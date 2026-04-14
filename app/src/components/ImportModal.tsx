import { useState, useRef, useEffect, ChangeEvent } from 'react'
import { UploadSimple, Check, Warning, Sparkle, Robot } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Modal } from '@pvsmartinez/shared/ui'
import { supabase } from '../services/supabase'
import { useAuthContext } from '../contexts/AuthContext'
import { useClinic } from '../hooks/useClinic'
import { usePatientImportJob } from '../hooks/usePatientImportJobs'
import type { CustomFieldDef } from '../types'
import type { Json } from '../types/database'
import {
  autoDetectPatientHeader,
  buildFallbackCustomFieldSuggestions,
  slugifyHeader,
  uniqueCustomFieldKey,
  type CustomFieldSuggestion,
  type PatientImportMapping,
} from '../utils/patientImport'

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

// ─── Value normalizers ────────────────────────────────────────────────────────

// ─── Parse file to headers + rows ────────────────────────────────────────────

function parseFile(file: File): Promise<{ headers: string[]; rows: string[][] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    if (file.name.match(/\.(xlsx|xls|ods)$/i)) {
      reader.onload = ev => {
        try {
          void import('xlsx').then(({ default: _default, ...xlsxModule }) => {
            const XLSX = Object.keys(xlsxModule).length > 0 ? xlsxModule : _default
            const data = new Uint8Array(ev.target?.result as ArrayBuffer)
            const workbook = XLSX.read(data, { type: 'array', cellDates: true })
            const sheet = workbook.Sheets[workbook.SheetNames[0]]
            const raw = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' })
            const [headerRow, ...dataRows] = raw as string[][]
            const headers = (headerRow ?? []).map(h => String(h ?? '').trim()).filter(Boolean)
            const colCount = headers.length
            const rows = dataRows
              .filter(r => r.some(c => String(c ?? '').trim() !== ''))
              .map(r => headers.map((_, i) => String(r[i] ?? '').trim()))
            resolve({ headers, rows: rows.slice(0, colCount > 0 ? undefined : 0) })
          }).catch(() => {
            reject(new Error('Não foi possível carregar o leitor de Excel.'))
          })
        } catch (e) {
          reject(new Error('Não foi possível ler o arquivo Excel. Verifique se está no formato correto.'))
        }
      }
      reader.readAsArrayBuffer(file)
    } else {
      // CSV / TXT
      reader.onload = ev => {
        const text = ev.target?.result as string
        const lines = text.split(/\r?\n/).filter(l => l.trim())
        if (lines.length === 0) { reject(new Error('Arquivo vazio')); return }
        // Detect separator (comma, semicolon, tab)
        const sample = lines[0]
        const sep = sample.includes('\t') ? '\t' : sample.includes(';') ? ';' : ','
        const parseRow = (line: string): string[] =>
          line.split(sep).map(c => c.replace(/^"|"$/g, '').trim())
        const headers = parseRow(lines[0]).filter(Boolean)
        const rows = lines.slice(1)
          .filter(l => l.trim())
          .map(l => parseRow(l))
        resolve({ headers, rows })
      }
      reader.readAsText(file, 'UTF-8')
    }

    reader.onerror = () => reject(new Error('Erro ao ler o arquivo'))
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
  onImported?: (count: number) => void
}

type Mapping = PatientImportMapping
type MappingSource = Record<string, 'auto' | 'ai' | 'manual'>
export default function ImportModal({ open, onClose, onImported }: Props) {
  const { profile } = useAuthContext()
  const { data: clinic } = useClinic()
  const fileRef = useRef<HTMLInputElement>(null)

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Mapping>({})
  const [mappingSource, setMappingSource] = useState<MappingSource>({})
  const [customFieldSuggestions, setCustomFieldSuggestions] = useState<CustomFieldSuggestion[]>([])
  const [aiUsed, setAiUsed] = useState(false)
  const [step, setStep] = useState<'upload' | 'analyzing' | 'map' | 'preview' | 'importing' | 'processing-job'>('upload')
  const [importJobId, setImportJobId] = useState<string | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const importJobQuery = usePatientImportJob(importJobId)

  function resetAll() {
    setSelectedFile(null)
    setHeaders([]); setRows([]); setMapping({}); setMappingSource({})
    setCustomFieldSuggestions([])
    setAiUsed(false)
    setImportJobId(null)
    setStep('upload'); setErrors([])
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleClose() { resetAll(); onClose() }

  useEffect(() => {
    const job = importJobQuery.data
    if (!job) return

    if (job.status === 'completed') {
      const extraSummary = [
        job.skipped_rows > 0 ? `${job.skipped_rows} puladas` : null,
        job.failed_rows > 0 ? `${job.failed_rows} com erro` : null,
      ].filter(Boolean).join(' · ')

      toast.success(
        extraSummary
          ? `${job.imported_rows} paciente(s) importado(s) com sucesso. ${extraSummary}`
          : `${job.imported_rows} paciente(s) importado(s) com sucesso!`,
      )
      onImported?.(job.imported_rows)
      handleClose()
    }

    if (job.status === 'failed') {
      toast.error(job.error_message ?? 'A importação falhou.')
      setStep('preview')
      setImportJobId(null)
    }
  }, [importJobQuery.data, onImported])

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSelectedFile(file)
    setStep('analyzing')

    let parsed: { headers: string[]; rows: string[][] }
    try {
      parsed = await parseFile(file)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao ler arquivo')
      setStep('upload')
      return
    }

    if (parsed.headers.length === 0) {
      toast.error('Arquivo vazio ou sem cabeçalhos')
      setStep('upload')
      return
    }

    setHeaders(parsed.headers)
    setRows(parsed.rows)

    // Attempt local auto-detect first
    const localMapping: Mapping = {}
    const localSource: MappingSource = {}
    PATIENT_FIELDS.forEach(f => {
      const csvCol = parsed.headers.find(col => autoDetectPatientHeader(col) === f.key)
      if (csvCol) { localMapping[f.key] = csvCol; localSource[f.key] = 'auto' }
    })

    // Count unmapped columns — if more than 3 unmapped, call AI
    const mappedCols = new Set(Object.values(localMapping))
    const unmappedHeaders = parsed.headers.filter(h => !mappedCols.has(h))
    const needsAi = unmappedHeaders.length >= 3 || !localMapping['name']

    let nextCustomFieldSuggestions: CustomFieldSuggestion[] = []

    if (needsAi) {
      try {
        const sampleRows = parsed.rows.slice(0, 5)
        const { data, error } = await supabase.functions.invoke('import-patients', {
          body: { headers: parsed.headers, sampleRows }
        })
        if (!error && data?.mapping) {
          const aiMapping: Record<string, string> = data.mapping
          Object.entries(aiMapping).forEach(([fieldKey, csvHeader]) => {
            if (!localMapping[fieldKey] && csvHeader && parsed.headers.includes(csvHeader)) {
              localMapping[fieldKey] = csvHeader
              localSource[fieldKey] = 'ai'
            }
          })
          if (Array.isArray(data.customFields)) {
            const existingKeys = new Set((clinic?.customPatientFields ?? []).map(field => field.key))
            nextCustomFieldSuggestions = (data.customFields as Array<Record<string, unknown>>)
              .map(field => {
                const header = typeof field.header === 'string' ? field.header : ''
                const label = typeof field.label === 'string' ? field.label.trim() : header.trim()
                const type = typeof field.type === 'string' ? field.type as CustomFieldDef['type'] : 'text'
                const options = Array.isArray(field.options)
                  ? field.options.filter((option): option is string => typeof option === 'string' && option.trim().length > 0)
                  : undefined
                if (!header || !parsed.headers.includes(header)) return null
                return {
                  header,
                  label: label || header,
                  key: uniqueCustomFieldKey(slugifyHeader(typeof field.key === 'string' ? field.key : header), existingKeys),
                  type,
                  ...(options && options.length > 0 ? { options } : {}),
                } satisfies CustomFieldSuggestion
              })
              .filter((field): field is CustomFieldSuggestion => field !== null)
          }
          setAiUsed(true)
        }
      } catch {
        // AI failed — continue with local mapping only
      }
    }

    if (nextCustomFieldSuggestions.length === 0) {
      nextCustomFieldSuggestions = buildFallbackCustomFieldSuggestions(
        parsed.headers,
        localMapping,
        parsed.rows,
        clinic?.customPatientFields ?? [],
      )
    }

    setCustomFieldSuggestions(nextCustomFieldSuggestions)
    setMapping(localMapping)
    setMappingSource(localSource)
    setStep('map')
  }

  function handleMappingChange(fieldKey: string, csvHeader: string) {
    setMapping(prev => ({ ...prev, [fieldKey]: csvHeader }))
    setMappingSource(prev => ({ ...prev, [fieldKey]: 'manual' }))
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

  async function handleImport() {
    setStep('importing')
    const clinicId = profile?.clinicId
    if (!clinicId) { toast.error('Clínica não identificada'); setStep('preview'); return }
    if (!selectedFile) {
      toast.error('Selecione a planilha novamente antes de importar.')
      setStep('upload')
      return
    }
    if (rows.length === 0) {
      toast.error('Nenhuma linha válida encontrada (coluna Nome vazia em todas as linhas?)')
      setStep('preview')
      return
    }

    try {
      const safeName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const storagePath = `${clinicId}/${crypto.randomUUID()}/${safeName}`

      const { error: uploadError } = await supabase.storage
        .from('patient-imports')
        .upload(storagePath, selectedFile, {
          upsert: false,
          contentType: selectedFile.type || undefined,
        })

      if (uploadError) throw new Error(uploadError.message)

      const { data: job, error: jobError } = await supabase
        .from('patient_import_jobs')
        .insert({
          clinic_id: clinicId,
          created_by: profile?.id ?? null,
          status: 'queued',
          file_name: selectedFile.name,
          storage_path: storagePath,
          file_size_bytes: selectedFile.size,
          total_rows: rows.length,
          source_headers: headers as Json,
          mapping: mapping as Json,
          custom_fields: customFieldSuggestions as Json,
        })
        .select('*')
        .single()

      if (jobError || !job) throw new Error(jobError?.message ?? 'Não consegui criar o job de importação.')

      setImportJobId(job.id)
      setStep('processing-job')
    } catch (err) {
      toast.error(`Erro na importação: ${err instanceof Error ? err.message : String(err)}`)
      setStep('preview')
    }
  }

  const previewRows = rows.slice(0, 5)
  const mappedFields = PATIENT_FIELDS.filter(f => mapping[f.key])

  return (
    <Modal open={open} onClose={handleClose} title="Importar pacientes (CSV ou Excel)" maxWidth="lg">
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* ─ Step: Upload ─ */}
          {step === 'upload' && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div
                className="border-2 border-dashed border-gray-300 rounded-[24px] p-10 text-center cursor-pointer hover:border-[#0ea5b0] hover:bg-teal-50/40 transition w-full"
                onClick={() => fileRef.current?.click()}
              >
                <UploadSimple size={36} className="mx-auto text-[#0ea5b0] mb-3" />
                <p className="text-sm font-medium text-gray-700">Clique para selecionar seu arquivo</p>
                <p className="text-xs text-gray-400 mt-1">Excel (.xlsx), CSV ou .txt</p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.txt,.xlsx,.xls,.ods"
                className="hidden"
                onChange={handleFile}
              />
              <div className="text-xs text-gray-400 bg-[#f8fafb] border border-gray-100 rounded-2xl p-4 w-full space-y-2">
                <div className="flex items-center gap-2">
                  <Robot size={15} className="text-[#0ea5b0] shrink-0" />
                  <p className="font-semibold text-gray-600">A IA analisa sua planilha automaticamente</p>
                </div>
                <p>Se sua planilha tiver colunas com nomes diferentes do padrão, a IA vai tentar identificar o que cada coluna representa — você só confirma antes de importar.</p>
                <p className="text-gray-500">Formatos: Google Sheets, Excel, exportações de prontuário eletrônico, planilha livre.</p>
              </div>
            </div>
          )}

          {/* ─ Step: Analyzing ─ */}
          {step === 'analyzing' && (
            <div className="flex flex-col items-center gap-4 py-16 text-center">
              <div className="w-12 h-12 rounded-full bg-teal-50 flex items-center justify-center animate-pulse">
                <Sparkle size={24} className="text-[#0ea5b0]" />
              </div>
              <p className="text-sm font-medium text-gray-700">Lendo arquivo e identificando colunas...</p>
              <p className="text-xs text-gray-400 max-w-xs">
                A IA vai mapear automaticamente as colunas da sua planilha para os campos do sistema.
              </p>
            </div>
          )}

          {/* ─ Step: Map ─ */}
          {step === 'map' && (
            <>
              <div className="flex items-start justify-between">
                <p className="text-sm text-gray-600">
                  <strong>{headers.length} colunas</strong> · <strong>{rows.length} linhas</strong> encontradas.
                  Verifique os mapeamentos abaixo e ajuste se necessário.
                </p>
                {aiUsed && (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-[#0ea5b0] bg-teal-50 border border-teal-100 rounded-full px-2.5 py-1 shrink-0 ml-3">
                    <Robot size={13} /> Mapeado com IA
                  </span>
                )}
              </div>

              {errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2 text-sm text-red-700">
                  <Warning size={18} className="shrink-0 mt-0.5" />
                  <ul className="list-disc list-inside space-y-0.5">
                    {errors.map(e => <li key={e}>{e}</li>)}
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {PATIENT_FIELDS.map(f => {
                  const src = mappingSource[f.key]
                  return (
                    <div key={f.key} className="flex items-center gap-2">
                      <label className="text-xs text-gray-600 w-36 shrink-0 flex items-center gap-1">
                        {f.label}
                        {f.required && <span className="text-red-500">*</span>}
                        {src === 'ai' && (
                          <span title="Sugerido pela IA">
                            <Sparkle size={11} className="text-[#0ea5b0]" />
                          </span>
                        )}
                      </label>
                      <select
                        value={mapping[f.key] ?? ''}
                        onChange={e => handleMappingChange(f.key, e.target.value)}
                        className={`flex-1 border rounded-xl px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#0ea5b0] ${
                          src === 'ai' ? 'border-teal-200 bg-teal-50/40' : 'border-gray-200'
                        }`}
                      >
                        <option value="">— ignorar —</option>
                        {headers.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  )
                })}
              </div>

              {customFieldSuggestions.length > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-2">
                    Campos personalizados que serão criados
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {customFieldSuggestions.map(field => (
                      <span
                        key={field.key}
                        className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs text-amber-800"
                      >
                        {field.label}
                        <span className="text-amber-500">· {field.type}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
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
              {customFieldSuggestions.length > 0 && (
                <p className="text-xs text-gray-500">
                  {customFieldSuggestions.length} coluna(s) extra serão importadas como campos personalizados da clínica.
                </p>
              )}
            </>
          )}

          {step === 'processing-job' && (
            <div className="space-y-4 py-8 text-center">
              <div className="w-14 h-14 rounded-full bg-teal-50 flex items-center justify-center mx-auto animate-pulse">
                <Robot size={28} className="text-[#0ea5b0]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-700">
                  {importJobQuery.data?.status === 'queued'
                    ? 'Job criado. Colocando a importação na fila...'
                    : 'Importando pacientes em segundo plano...'}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  O backend está lendo a planilha, criando campos personalizados e populando a base.
                </p>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-[#f8fafb] px-4 py-4 max-w-md mx-auto">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                  <span>Progresso</span>
                  <span>{importJobQuery.data?.processed_rows ?? 0} / {importJobQuery.data?.total_rows ?? rows.length}</span>
                </div>
                <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#0ea5b0] to-[#006970] transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round(((importJobQuery.data?.processed_rows ?? 0) / Math.max(importJobQuery.data?.total_rows ?? rows.length, 1)) * 100),
                      )}%`,
                    }}
                  />
                </div>
                <div className="grid grid-cols-3 gap-3 mt-4 text-left">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gray-400">Importadas</p>
                    <p className="text-sm font-semibold text-gray-800">{importJobQuery.data?.imported_rows ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gray-400">Puladas</p>
                    <p className="text-sm font-semibold text-gray-800">{importJobQuery.data?.skipped_rows ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gray-400">Erros</p>
                    <p className="text-sm font-semibold text-gray-800">{importJobQuery.data?.failed_rows ?? 0}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100">
          <button
            onClick={step === 'upload' || step === 'processing-job' ? handleClose : () => {
              if (step === 'preview') { setStep('map'); setErrors([]) }
              else if (step === 'map') { setStep('upload'); resetAll() }
            }}
            className="text-sm text-gray-500 hover:text-gray-700"
            disabled={step === 'importing' || step === 'analyzing'}
          >
            {step === 'upload' || step === 'processing-job' ? 'Fechar' : '← Voltar'}
          </button>

          <div className="flex gap-2">
            {step === 'map' && (
              <button
                onClick={goToPreview}
                className="text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-all active:scale-[0.99]"
                style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
              >
                Ver prévia →
              </button>
            )}
            {step === 'preview' && (
              <button
                onClick={handleImport}
                className="flex items-center gap-2 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-all active:scale-[0.99]"
                style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
              >
                <Check size={16} />
                Importar {rows.length} paciente(s)
              </button>
            )}
            {step === 'importing' && (
              <button disabled className="bg-teal-300 text-white text-sm font-medium px-5 py-2.5 rounded-xl opacity-60">
                Enviando job...
              </button>
            )}
            {step === 'processing-job' && (
              <button disabled className="bg-teal-300 text-white text-sm font-medium px-5 py-2.5 rounded-xl opacity-60">
                Processando no backend...
              </button>
            )}
          </div>
        </div>
    </Modal>
  )
}


