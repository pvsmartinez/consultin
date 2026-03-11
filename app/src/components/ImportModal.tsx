import { useState, useRef, ChangeEvent } from 'react'
import { UploadSimple, Check, Warning } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Modal } from '@pvsmartinez/shared/ui'
import { format, parse, isValid } from 'date-fns'
import { supabase } from '../services/supabase'
import { useAuthContext } from '../contexts/AuthContext'
import { parseCSV } from '../utils/exportCSV'

// ─── Field definitions ────────────────────────────────────────────────────────

interface FieldDef {
  key: string
  label: string
  required?: boolean
}

const PATIENT_FIELDS: FieldDef[] = [
  { key: 'name',              label: 'Nome',          required: true },
  { key: 'cpf',               label: 'CPF' },
  { key: 'rg',                label: 'RG' },
  { key: 'birth_date',        label: 'Nascimento (DD/MM/YYYY)' },
  { key: 'sex',               label: 'Sexo (M/F/O)' },
  { key: 'phone',             label: 'Telefone' },
  { key: 'email',             label: 'E-mail' },
  { key: 'address_street',    label: 'Rua / Endereço' },
  { key: 'address_number',    label: 'Número' },
  { key: 'address_complement',label: 'Complemento' },
  { key: 'address_neighborhood', label: 'Bairro' },
  { key: 'address_city',      label: 'Cidade' },
  { key: 'address_state',     label: 'UF / Estado' },
  { key: 'address_zip',       label: 'CEP' },
  { key: 'notes',             label: 'Observações' },
]

// ─── Auto-detect header → field key ──────────────────────────────────────────

const AUTO_DETECT: Record<string, string> = {
  nome: 'name', name: 'name', paciente: 'name',
  cpf: 'cpf',
  rg: 'rg',
  nascimento: 'birth_date', 'data nascimento': 'birth_date', 'data_nascimento': 'birth_date',
  'data de nascimento': 'birth_date', birthdate: 'birth_date', birth_date: 'birth_date',
  sexo: 'sex', sex: 'sex', genero: 'sex', gênero: 'sex', gender: 'sex',
  telefone: 'phone', celular: 'phone', phone: 'phone', whatsapp: 'phone', fone: 'phone',
  email: 'email', 'e-mail': 'email',
  endereco: 'address_street', endereço: 'address_street', rua: 'address_street',
  logradouro: 'address_street', address: 'address_street', street: 'address_street',
  numero: 'address_number', número: 'address_number', 'nº': 'address_number', num: 'address_number',
  complemento: 'address_complement',
  bairro: 'address_neighborhood', neighborhood: 'address_neighborhood',
  cidade: 'address_city', city: 'address_city', municipio: 'address_city', município: 'address_city',
  estado: 'address_state', uf: 'address_state', state: 'address_state',
  cep: 'address_zip', zip: 'address_zip', postal: 'address_zip',
  observacoes: 'notes', observações: 'notes', obs: 'notes', notes: 'notes', notas: 'notes',
}

function autoDetect(header: string): string {
  const normalized = header.toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
  return AUTO_DETECT[header.toLowerCase().trim()] ?? AUTO_DETECT[normalized] ?? ''
}

// ─── Value normalizers ────────────────────────────────────────────────────────

function normalizeSex(v: string): string | null {
  const s = v.trim().toLowerCase()
  if (['m', 'masc', 'masculino', 'male'].includes(s)) return 'M'
  if (['f', 'fem', 'feminino', 'female'].includes(s)) return 'F'
  if (['o', 'outro', 'other', 'n/a', 'na'].includes(s)) return 'O'
  return null
}

function normalizeDate(v: string): string | null {
  const s = v.trim()
  if (!s) return null
  const formats = ['dd/MM/yyyy', 'dd-MM-yyyy', 'yyyy-MM-dd', 'MM/dd/yyyy', 'dd/MM/yy']
  for (const fmt of formats) {
    try {
      const d = parse(s, fmt, new Date())
      if (isValid(d)) return format(d, 'yyyy-MM-dd')
    } catch { /* try next */ }
  }
  return null
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
  onImported?: (count: number) => void
}

type Mapping = Record<string, string> // fieldKey → csvHeader

export default function ImportModal({ open, onClose, onImported }: Props) {
  const { profile } = useAuthContext()
  const fileRef = useRef<HTMLInputElement>(null)

  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Mapping>({})
  const [step, setStep] = useState<'upload' | 'map' | 'preview' | 'importing'>('upload')
  const [errors, setErrors] = useState<string[]>([])

  function resetAll() {
    setHeaders([]); setRows([]); setMapping({})
    setStep('upload'); setErrors([])
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleClose() { resetAll(); onClose() }

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      const { headers: h, rows: r } = parseCSV(text)
      if (h.length === 0) { toast.error('Arquivo vazio ou inválido'); return }
      setHeaders(h)
      setRows(r)
      // Auto-detect mapping
      const m: Mapping = {}
      PATIENT_FIELDS.forEach(f => {
        const csvCol = h.find((col: string) => autoDetect(col) === f.key)
        if (csvCol) m[f.key] = csvCol
      })
      setMapping(m)
      setStep('map')
    }
    reader.readAsText(file, 'UTF-8')
  }

  function handleMappingChange(fieldKey: string, csvHeader: string) {
    setMapping(prev => ({ ...prev, [fieldKey]: csvHeader }))
  }

  function validate(): string[] {
    const errs: string[] = []
    if (!mapping['name']) errs.push('O campo "Nome" é obrigatório.')
    const usedCols = Object.values(mapping).filter(Boolean)
    const dupes = usedCols.filter((v, i) => usedCols.indexOf(v) !== i)
    if (dupes.length > 0) errs.push(`Coluna(s) usada(s) mais de uma vez: ${[...new Set(dupes)].join(', ')}`)
    return errs
  }

  function goToPreview() {
    const errs = validate()
    if (errs.length) { setErrors(errs); return }
    setErrors([])
    setStep('preview')
  }

  // Build the DB row from a CSV row
  function buildDbRow(csvRow: string[]): Record<string, string | null> | null {
    const get = (fieldKey: string): string => {
      const col = mapping[fieldKey]
      if (!col) return ''
      const idx = headers.indexOf(col)
      return idx >= 0 ? (csvRow[idx] ?? '').trim() : ''
    }
    const name = get('name')
    if (!name) return null // skip rows without a name
    return {
      name,
      cpf:                  get('cpf') || null,
      rg:                   get('rg') || null,
      birth_date:           normalizeDate(get('birth_date')),
      sex:                  normalizeSex(get('sex')),
      phone:                get('phone') || null,
      email:                get('email') || null,
      address_street:       get('address_street') || null,
      address_number:       get('address_number') || null,
      address_complement:   get('address_complement') || null,
      address_neighborhood: get('address_neighborhood') || null,
      address_city:         get('address_city') || null,
      address_state:        get('address_state') || null,
      address_zip:          get('address_zip') || null,
      notes:                get('notes') || null,
    }
  }

  async function handleImport() {
    setStep('importing')
    const clinicId = profile?.clinicId
    if (!clinicId) { toast.error('Clínica não identificada'); setStep('preview'); return }

    const dbRows = rows
      .map(r => buildDbRow(r))
      .filter((r): r is Record<string, string | null> => r !== null)
      .map(r => ({ ...r, clinic_id: clinicId }))

    if (dbRows.length === 0) {
      toast.error('Nenhuma linha válida encontrada (coluna Nome vazia em todas as linhas?)')
      setStep('preview')
      return
    }

    // Insert in batches of 200
    const BATCH = 200
    let imported = 0
    try {
      for (let i = 0; i < dbRows.length; i += BATCH) {
        const batch = dbRows.slice(i, i + BATCH)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await supabase.from('patients').insert(batch as any)
        if (error) throw new Error(error.message)
        imported += batch.length
      }
      toast.success(`${imported} paciente(s) importado(s) com sucesso!`)
      onImported?.(imported)
      handleClose()
    } catch (err) {
      toast.error(`Erro na importação: ${err instanceof Error ? err.message : String(err)}`)
      setStep('preview')
    }
  }

  // ── Preview rows (first 5) ──
  const previewRows = rows.slice(0, 5)
  const mappedFields = PATIENT_FIELDS.filter(f => mapping[f.key])

  return (
    <Modal open={open} onClose={handleClose} title="Importar pacientes via CSV" maxWidth="lg">
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* ─ Step: Upload ─ */}
          {step === 'upload' && (
            <div className="flex flex-col items-center gap-4 py-10">
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center cursor-pointer hover:border-blue-400 transition"
                onClick={() => fileRef.current?.click()}>
                <UploadSimple size={36} className="mx-auto text-gray-400 mb-3" />
                <p className="text-sm font-medium text-gray-700">Clique para selecionar um arquivo CSV</p>
                <p className="text-xs text-gray-400 mt-1">
                  A primeira linha deve conter os cabeçalhos das colunas
                </p>
              </div>
              <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFile} />
              <div className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3 w-full">
                <p className="font-semibold text-gray-600 mb-1">Dica: colunas reconhecidas automaticamente</p>
                <p>Nome, CPF, RG, Nascimento, Sexo, Telefone, E-mail, Endereço, Cidade, UF, CEP, Observações</p>
                <p className="mt-1">Aceita exportações do Google Sheets, Excel e de outros sistemas de gestão.</p>
              </div>
            </div>
          )}

          {/* ─ Step: Map ─ */}
          {step === 'map' && (
            <>
              <p className="text-sm text-gray-600">
                Arquivo carregado: <strong>{headers.length} colunas</strong>, <strong>{rows.length} linhas</strong>.{' '}
                Vincule cada campo do sistema com a coluna correspondente do CSV.
              </p>

              {errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2 text-sm text-red-700">
                  <Warning size={18} className="shrink-0 mt-0.5" />
                  <ul className="list-disc list-inside space-y-0.5">
                    {errors.map(e => <li key={e}>{e}</li>)}
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {PATIENT_FIELDS.map(f => (
                  <div key={f.key} className="flex items-center gap-2">
                    <label className="text-xs text-gray-600 w-36 shrink-0">
                      {f.label}
                      {f.required && <span className="text-red-500 ml-0.5">*</span>}
                    </label>
                    <select
                      value={mapping[f.key] ?? ''}
                      onChange={e => handleMappingChange(f.key, e.target.value)}
                      className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">— ignorar —</option>
                      {headers.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ─ Step: Preview ─ */}
          {(step === 'preview' || step === 'importing') && (
            <>
              <p className="text-sm text-gray-600">
                Prévia das primeiras {Math.min(5, rows.length)} de <strong>{rows.length}</strong> linhas
                (será criado um paciente por linha que tiver Nome preenchido).
              </p>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {mappedFields.map(f => (
                        <th key={f.key} className="text-left px-3 py-2 font-medium text-gray-500 whitespace-nowrap">
                          {f.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, ri) => {
                      const get = (fk: string) => {
                        const col = mapping[fk]
                        if (!col) return ''
                        const idx = headers.indexOf(col)
                        return idx >= 0 ? (row[idx] ?? '') : ''
                      }
                      return (
                        <tr key={ri} className="border-b border-gray-100 last:border-0">
                          {mappedFields.map(f => (
                            <td key={f.key} className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-[180px] truncate">
                              {get(f.key)}
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {rows.length > 5 && (
                <p className="text-xs text-gray-400">… e mais {rows.length - 5} linhas</p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100">
          <button
            onClick={step === 'upload' ? handleClose : () => {
              if (step === 'preview') { setStep('map'); setErrors([]) }
              else if (step === 'map') { setStep('upload'); resetAll() }
            }}
            className="text-sm text-gray-500 hover:text-gray-700"
            disabled={step === 'importing'}
          >
            {step === 'upload' ? 'Cancelar' : '← Voltar'}
          </button>

          <div className="flex gap-2">
            {step === 'map' && (
              <button
                onClick={goToPreview}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition"
              >
                Ver prévia →
              </button>
            )}
            {step === 'preview' && (
              <button
                onClick={handleImport}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition"
              >
                <Check size={16} />
                Importar {rows.length} paciente(s)
              </button>
            )}
            {step === 'importing' && (
              <button disabled className="bg-blue-400 text-white text-sm font-medium px-5 py-2 rounded-lg opacity-60">
                Importando...
              </button>
            )}
          </div>
        </div>
    </Modal>
  )
}
