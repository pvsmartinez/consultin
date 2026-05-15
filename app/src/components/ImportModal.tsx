import { useState, useRef, useEffect, ChangeEvent, DragEvent as ReactDragEvent } from 'react'
import { UploadSimple, Check, Warning, Sparkle, Robot } from '@phosphor-icons/react'
import { invokeSupabaseFunction } from '@pvsmartinez/shared'
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
  section: 'identity' | 'contact' | 'address' | 'notes'
  required?: boolean
  hint?: string
}

const FIELD_SECTIONS = [
  {
    key: 'identity',
    title: 'Cadastro principal',
    description: 'Confirme os dados básicos que identificam cada paciente na clínica.',
  },
  {
    key: 'contact',
    title: 'Contato',
    description: 'Campos usados para comunicação e lembretes.',
  },
  {
    key: 'address',
    title: 'Endereço',
    description: 'Importe só o que fizer sentido para a operação da clínica.',
  },
  {
    key: 'notes',
    title: 'Observações',
    description: 'Campos livres e notas gerais.',
  },
] as const

interface ImportPatientsResponse {
  mapping?: Record<string, string>
  customFields?: Array<Record<string, unknown>>
}

type CustomFieldOption = CustomFieldSuggestion & { enabled: boolean }

const PATIENT_FIELDS: FieldDef[] = [
  { key: 'name', label: 'Nome', section: 'identity', required: true, hint: 'Obrigatório para criar o cadastro.' },
  { key: 'cpf', label: 'CPF', section: 'identity' },
  { key: 'rg', label: 'RG', section: 'identity' },
  { key: 'birth_date', label: 'Nascimento (DD/MM/YYYY)', section: 'identity', hint: 'Aceita datas em formatos comuns.' },
  { key: 'sex', label: 'Sexo (M/F/O)', section: 'identity' },
  { key: 'phone', label: 'Telefone', section: 'contact', hint: 'Celular, telefone fixo ou WhatsApp.' },
  { key: 'email', label: 'E-mail', section: 'contact' },
  { key: 'address_street', label: 'Rua / Endereço', section: 'address' },
  { key: 'address_number', label: 'Número', section: 'address' },
  { key: 'address_complement', label: 'Complemento', section: 'address' },
  { key: 'address_neighborhood', label: 'Bairro', section: 'address' },
  { key: 'address_city', label: 'Cidade', section: 'address' },
  { key: 'address_state', label: 'UF / Estado', section: 'address' },
  { key: 'address_zip', label: 'CEP', section: 'address' },
  { key: 'notes', label: 'Observações', section: 'notes', hint: 'Notas clínicas ou administrativas.' },
]

function getDuplicateMappings(mapping: PatientImportMapping): string[] {
  const usedCols = Object.values(mapping).filter(Boolean)
  return [...new Set(usedCols.filter((value, index) => usedCols.indexOf(value) !== index))]
}

function getMappingSourceMeta(source?: 'auto' | 'ai' | 'manual') {
  if (source === 'ai') {
    return {
      label: 'IA',
      className: 'border-teal-200 bg-teal-50 text-[#0ea5b0]',
      selectClassName: 'border-teal-200 bg-teal-50/50',
    }
  }

  if (source === 'auto') {
    return {
      label: 'Detectado',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      selectClassName: 'border-emerald-200 bg-emerald-50/40',
    }
  }

  if (source === 'manual') {
    return {
      label: 'Ajustado',
      className: 'border-gray-200 bg-gray-100 text-gray-700',
      selectClassName: 'border-gray-300 bg-white',
    }
  }

  return {
    label: 'Ignorado',
    className: 'border-gray-200 bg-white text-gray-400',
    selectClassName: 'border-gray-200 bg-white',
  }
}

function getMergedRows(stats: {
  processed_rows?: number | null
  imported_rows?: number | null
  skipped_rows?: number | null
  failed_rows?: number | null
}) {
  return Math.max(
    0,
    (stats.processed_rows ?? 0)
      - (stats.imported_rows ?? 0)
      - (stats.skipped_rows ?? 0)
      - (stats.failed_rows ?? 0),
  )
}

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
  const dragDepthRef = useRef(0)

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Mapping>({})
  const [mappingSource, setMappingSource] = useState<MappingSource>({})
  const [customFieldSuggestions, setCustomFieldSuggestions] = useState<CustomFieldOption[]>([])
  const [aiUsed, setAiUsed] = useState(false)
  const [step, setStep] = useState<'upload' | 'analyzing' | 'map' | 'preview' | 'importing' | 'processing-job'>('upload')
  const [importJobId, setImportJobId] = useState<string | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const importJobQuery = usePatientImportJob(importJobId)

  function resetAll() {
    setSelectedFile(null)
    setHeaders([]); setRows([]); setMapping({}); setMappingSource({})
    setCustomFieldSuggestions([])
    setAiUsed(false)
    setImportJobId(null)
    setStep('upload'); setErrors([])
    dragDepthRef.current = 0
    setIsDraggingFile(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleClose() { resetAll(); onClose() }

  useEffect(() => {
    const job = importJobQuery.data
    if (!job) return

    if (job.status === 'completed') {
      const mergedRows = getMergedRows(job)
      const extraSummary = [
        mergedRows > 0 ? `${mergedRows} linhas mescladas` : null,
        job.skipped_rows > 0 ? `${job.skipped_rows} puladas` : null,
        job.failed_rows > 0 ? `${job.failed_rows} com erro` : null,
      ].filter(Boolean).join(' · ')

      toast.success(
        extraSummary
          ? `${job.imported_rows} pacientes únicos importados/atualizados. ${extraSummary}`
          : `${job.imported_rows} pacientes únicos importados/atualizados.`,
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

  useEffect(() => {
    if (!open) return

    const preventBrowserDrop = (event: DragEvent) => {
      event.preventDefault()
    }

    window.addEventListener('dragover', preventBrowserDrop)
    window.addEventListener('drop', preventBrowserDrop)

    return () => {
      window.removeEventListener('dragover', preventBrowserDrop)
      window.removeEventListener('drop', preventBrowserDrop)
    }
  }, [open])

  async function processSelectedFile(file: File) {
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

    const localMapping: Mapping = {}
    const localSource: MappingSource = {}
    PATIENT_FIELDS.forEach(f => {
      const csvCol = parsed.headers.find(col => autoDetectPatientHeader(col) === f.key)
      if (csvCol) { localMapping[f.key] = csvCol; localSource[f.key] = 'auto' }
    })

    const mappedCols = new Set(Object.values(localMapping))
    const unmappedHeaders = parsed.headers.filter(h => !mappedCols.has(h))
    const needsAi = unmappedHeaders.length >= 3 || !localMapping['name']

    let nextCustomFieldSuggestions: CustomFieldSuggestion[] = []

    if (needsAi) {
      try {
        const sampleRows = parsed.rows.slice(0, 5)
        const data = await invokeSupabaseFunction<ImportPatientsResponse>(supabase, 'import-patients', {
          body: { headers: parsed.headers, sampleRows }
        })
        if (data?.mapping) {
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

    setCustomFieldSuggestions(nextCustomFieldSuggestions.map(field => ({ ...field, enabled: true })))
    setMapping(localMapping)
    setMappingSource(localSource)
    setStep('map')
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    await processSelectedFile(file)
  }

  function hasDraggedFiles(event: ReactDragEvent<HTMLElement>) {
    return Array.from(event.dataTransfer?.types ?? []).includes('Files')
  }

  function handleDragEnter(event: ReactDragEvent<HTMLDivElement>) {
    if (!hasDraggedFiles(event)) return
    event.preventDefault()
    event.stopPropagation()
    dragDepthRef.current += 1
    setIsDraggingFile(true)
  }

  function handleDragOver(event: ReactDragEvent<HTMLDivElement>) {
    if (!hasDraggedFiles(event)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
    setIsDraggingFile(true)
  }

  function handleDragLeave(event: ReactDragEvent<HTMLDivElement>) {
    if (!hasDraggedFiles(event)) return
    event.preventDefault()
    event.stopPropagation()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setIsDraggingFile(false)
  }

  async function handleDrop(event: ReactDragEvent<HTMLDivElement>) {
    if (!hasDraggedFiles(event)) return
    event.preventDefault()
    event.stopPropagation()
    dragDepthRef.current = 0
    setIsDraggingFile(false)

    const droppedFiles = Array.from(event.dataTransfer.files ?? [])
    if (droppedFiles.length === 0) return
    if (droppedFiles.length > 1) {
      toast.info('Usando apenas o primeiro arquivo da seleção.')
    }

    await processSelectedFile(droppedFiles[0])
  }

  function handleMappingChange(fieldKey: string, csvHeader: string) {
    setMapping(prev => ({ ...prev, [fieldKey]: csvHeader }))
    setMappingSource(prev => ({ ...prev, [fieldKey]: 'manual' }))
  }

  function handleCustomFieldToggle(fieldKey: string) {
    setCustomFieldSuggestions(prev => prev.map(field => (
      field.key === fieldKey ? { ...field, enabled: !field.enabled } : field
    )))
  }

  function validate(): string[] {
    const errs: string[] = []
    if (!mapping['name']) errs.push('O campo "Nome" é obrigatório.')
    const dupes = getDuplicateMappings(mapping)
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
          custom_fields: customFieldSuggestions.filter(field => field.enabled) as Json,
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
  const enabledCustomFields = customFieldSuggestions.filter(field => field.enabled)
  const requiredFields = PATIENT_FIELDS.filter(f => f.required)
  const requiredMappedCount = requiredFields.filter(f => mapping[f.key]).length
  const duplicateMappings = getDuplicateMappings(mapping)
  const usedHeaders = new Set(Object.values(mapping).filter(Boolean))
  const ignoredHeaders = headers.filter(header => !usedHeaders.has(header))
  const jobMergedRows = getMergedRows(importJobQuery.data ?? {})
  const groupedFields = FIELD_SECTIONS.map(section => ({
    ...section,
    fields: PATIENT_FIELDS.filter(field => field.section === section.key),
  }))

  return (
    <Modal open={open} onClose={handleClose} title="Importar pacientes (CSV ou Excel)" maxWidth="xl">
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* ─ Step: Upload ─ */}
          {step === 'upload' && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div
                className={`w-full rounded-[24px] border-2 border-dashed p-10 text-center transition ${
                  isDraggingFile
                    ? 'border-[#0ea5b0] bg-teal-50 shadow-[0_0_0_4px_rgba(20,184,166,0.08)]'
                    : 'border-gray-300 hover:border-[#0ea5b0] hover:bg-teal-50/40'
                } cursor-pointer`}
                onClick={() => fileRef.current?.click()}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={event => { void handleDrop(event) }}
              >
                <UploadSimple size={36} className="mx-auto text-[#0ea5b0] mb-3" />
                <p className="text-sm font-medium text-gray-700">
                  {isDraggingFile ? 'Solte o arquivo aqui' : 'Clique ou arraste seu arquivo para cá'}
                </p>
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
              <div className="rounded-[28px] border border-teal-100 bg-gradient-to-br from-white via-teal-50/60 to-slate-50 px-5 py-5">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-teal-100 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#0ea5b0]">
                        Revisão antes da importação
                      </span>
                      {aiUsed && (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-100 bg-teal-50 px-3 py-1 text-xs font-medium text-[#0ea5b0]">
                          <Robot size={13} /> Mapeado com IA
                        </span>
                      )}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        {selectedFile?.name ?? 'Planilha pronta para revisão'}
                      </h3>
                      <p className="mt-1 max-w-2xl text-sm text-gray-600">
                        Revise os campos abaixo por bloco. O único campo obrigatório para criar pacientes é o nome;
                        o restante você ajusta só se fizer sentido para a sua base.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[360px]">
                    <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3">
                      <p className="text-[11px] uppercase tracking-wide text-gray-400">Colunas</p>
                      <p className="mt-1 text-lg font-semibold text-gray-900">{headers.length}</p>
                    </div>
                    <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3">
                      <p className="text-[11px] uppercase tracking-wide text-gray-400">Linhas</p>
                      <p className="mt-1 text-lg font-semibold text-gray-900">{rows.length}</p>
                    </div>
                    <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3">
                      <p className="text-[11px] uppercase tracking-wide text-gray-400">Campos mapeados</p>
                      <p className="mt-1 text-lg font-semibold text-gray-900">{mappedFields.length}/{PATIENT_FIELDS.length}</p>
                    </div>
                    <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3">
                      <p className="text-[11px] uppercase tracking-wide text-gray-400">Extras</p>
                      <p className="mt-1 text-lg font-semibold text-gray-900">{enabledCustomFields.length}</p>
                    </div>
                  </div>
                </div>
              </div>

              {errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2 text-sm text-red-700">
                  <Warning size={18} className="shrink-0 mt-0.5" />
                  <ul className="list-disc list-inside space-y-0.5">
                    {errors.map(e => <li key={e}>{e}</li>)}
                  </ul>
                </div>
              )}

              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
                <div className="space-y-4">
                  {groupedFields.map(section => (
                    <section key={section.key} className="rounded-[24px] border border-gray-200 bg-white px-4 py-4 sm:px-5">
                      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h4 className="text-sm font-semibold text-gray-900">{section.title}</h4>
                          <p className="text-xs text-gray-500">{section.description}</p>
                        </div>
                        <span className="text-xs text-gray-400">
                          {section.fields.filter(field => mapping[field.key]).length}/{section.fields.length} mapeados
                        </span>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        {section.fields.map(field => {
                          const sourceMeta = getMappingSourceMeta(mappingSource[field.key])

                          return (
                            <div
                              key={field.key}
                              className="rounded-2xl border border-gray-200 bg-[#fcfdfd] p-3 transition-colors hover:border-gray-300"
                            >
                              <div className="mb-3 flex items-start justify-between gap-3">
                                <div>
                                  <label className="flex items-center gap-1.5 text-sm font-medium text-gray-800">
                                    {field.label}
                                    {field.required && <span className="text-red-500">*</span>}
                                    {mappingSource[field.key] === 'ai' && (
                                      <span title="Sugerido pela IA">
                                        <Sparkle size={12} className="text-[#0ea5b0]" />
                                      </span>
                                    )}
                                  </label>
                                  {field.hint && (
                                    <p className="mt-1 text-xs leading-relaxed text-gray-500">{field.hint}</p>
                                  )}
                                </div>
                                <span className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${sourceMeta.className}`}>
                                  {sourceMeta.label}
                                </span>
                              </div>

                              <select
                                value={mapping[field.key] ?? ''}
                                onChange={e => handleMappingChange(field.key, e.target.value)}
                                className={`w-full rounded-xl border px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#0ea5b0] ${sourceMeta.selectClassName}`}
                              >
                                <option value="">— ignorar este campo —</option>
                                {headers.map(header => (
                                  <option key={header} value={header}>{header}</option>
                                ))}
                              </select>
                            </div>
                          )
                        })}
                      </div>
                    </section>
                  ))}
                </div>

                <aside className="space-y-4 lg:sticky lg:top-0 lg:self-start">
                  <div className="rounded-[24px] border border-gray-200 bg-white p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400">
                      Checklist
                    </p>
                    <div className="mt-4 space-y-3 text-sm">
                      <div className="flex items-start gap-3">
                        <span className={`mt-1 h-2.5 w-2.5 rounded-full ${mapping.name ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                        <div>
                          <p className="font-medium text-gray-800">Nome do paciente</p>
                          <p className="text-xs text-gray-500">
                            {mapping.name ? 'Obrigatório já mapeado.' : 'Escolha qual coluna representa o nome.'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <span className={`mt-1 h-2.5 w-2.5 rounded-full ${duplicateMappings.length === 0 ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                        <div>
                          <p className="font-medium text-gray-800">Colunas duplicadas</p>
                          <p className="text-xs text-gray-500">
                            {duplicateMappings.length === 0
                              ? 'Nenhuma coluna está sendo usada duas vezes.'
                              : `Revise: ${duplicateMappings.join(', ')}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <span className={`mt-1 h-2.5 w-2.5 rounded-full ${requiredMappedCount === requiredFields.length ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                        <div>
                          <p className="font-medium text-gray-800">Campos essenciais</p>
                          <p className="text-xs text-gray-500">
                            {requiredMappedCount} de {requiredFields.length} obrigatórios confirmados.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <span className="mt-1 h-2.5 w-2.5 rounded-full bg-slate-300" />
                        <div>
                          <p className="font-medium text-gray-800">Colunas sem campo padrão</p>
                          <p className="text-xs text-gray-500">
                            {ignoredHeaders.length === 0
                              ? 'Todas as colunas foram aproveitadas.'
                              : `${ignoredHeaders.length} podem virar campos personalizados abaixo.`}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {customFieldSuggestions.length > 0 && (
                    <div className="rounded-[24px] border border-amber-200 bg-amber-50/70 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">
                        Campos extras do Excel
                      </p>
                      <p className="mt-2 text-sm text-amber-900">
                        Escolha quais colunas sem campo padrão devem entrar como campo personalizado.
                      </p>
                      <div className="mt-3 space-y-2">
                        {customFieldSuggestions.map(field => (
                          <label
                            key={field.key}
                            className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                              field.enabled
                                ? 'border-amber-300 bg-white text-amber-900'
                                : 'border-amber-200/70 bg-amber-50/30 text-amber-700/70'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={field.enabled}
                              onChange={() => handleCustomFieldToggle(field.key)}
                              className="mt-0.5 h-4 w-4 rounded border-amber-300 text-[#0ea5b0] focus:ring-[#0ea5b0]"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium">{field.label}</span>
                                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">
                                  {field.type}
                                </span>
                              </span>
                              <span className="mt-1 block text-xs text-amber-700/80">
                                Coluna: {field.header}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                      <p className="mt-3 text-xs text-amber-800/80">
                        {enabledCustomFields.length} de {customFieldSuggestions.length} coluna(s) serão criadas como campo custom.
                      </p>
                    </div>
                  )}

                  <div className="rounded-[24px] border border-gray-200 bg-[#f8fafb] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400">
                      Como ler os selos
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {[
                        getMappingSourceMeta('auto'),
                        getMappingSourceMeta('ai'),
                        getMappingSourceMeta('manual'),
                      ].map(source => (
                        <span key={source.label} className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${source.className}`}>
                          {source.label}
                        </span>
                      ))}
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-gray-500">
                      Detectado = nome parecido com o padrão. IA = sugestão vinda da análise da planilha.
                      Ajustado = você trocou manualmente.
                    </p>
                  </div>
                </aside>
              </div>
            </>
          )}

          {/* ─ Step: Preview ─ */}
          {(step === 'preview' || step === 'importing') && (
            <>
              <div className="rounded-[28px] border border-gray-200 bg-white px-5 py-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#0ea5b0]">
                      Prévia da importação
                    </p>
                    <h3 className="mt-2 text-lg font-semibold text-gray-900">
                      Revise as primeiras {Math.min(5, rows.length)} linhas antes de enviar
                    </h3>
                    <p className="mt-1 text-sm text-gray-600">
                      Será criado um paciente por linha que tiver o campo Nome preenchido.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:min-w-[360px]">
                    <div className="rounded-2xl border border-gray-200 bg-[#f8fafb] px-4 py-3">
                      <p className="text-[11px] uppercase tracking-wide text-gray-400">Pacientes</p>
                      <p className="mt-1 text-lg font-semibold text-gray-900">{rows.length}</p>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-[#f8fafb] px-4 py-3">
                      <p className="text-[11px] uppercase tracking-wide text-gray-400">Campos</p>
                      <p className="mt-1 text-lg font-semibold text-gray-900">{mappedFields.length}</p>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-[#f8fafb] px-4 py-3 col-span-2 sm:col-span-1">
                      <p className="text-[11px] uppercase tracking-wide text-gray-400">Extras</p>
                      <p className="mt-1 text-lg font-semibold text-gray-900">{enabledCustomFields.length}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {mappedFields.map(field => (
                    <span
                      key={field.key}
                      className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-[#f8fafb] px-2.5 py-1 text-xs text-gray-700"
                    >
                      <span className="font-medium">{field.label}</span>
                      <span className="text-gray-400">← {mapping[field.key]}</span>
                    </span>
                  ))}
                </div>
              </div>

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
              {enabledCustomFields.length > 0 && (
                <p className="text-xs text-gray-500">
                  {enabledCustomFields.length} coluna(s) extra serão importadas como campos personalizados da clínica.
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
                  O backend está lendo a planilha, criando campos personalizados, mesclando duplicados e populando a base.
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
                    <p className="text-[11px] uppercase tracking-wide text-gray-400">Únicos</p>
                    <p className="text-sm font-semibold text-gray-800">{importJobQuery.data?.imported_rows ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gray-400">Mescladas</p>
                    <p className="text-sm font-semibold text-gray-800">{jobMergedRows}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gray-400">Erros</p>
                    <p className="text-sm font-semibold text-gray-800">{importJobQuery.data?.failed_rows ?? 0}</p>
                  </div>
                </div>
                {importJobQuery.data?.processed_rows ? (
                  <p className="mt-3 text-left text-xs text-gray-500">
                    {importJobQuery.data?.imported_rows ?? 0} pacientes únicos importados/atualizados, {jobMergedRows} linhas mescladas.
                  </p>
                ) : null}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <button
            onClick={step === 'upload' || step === 'processing-job' ? handleClose : () => {
              if (step === 'preview') { setStep('map'); setErrors([]) }
              else if (step === 'map') { setStep('upload'); resetAll() }
            }}
            className="min-h-11 rounded-lg px-3 py-2.5 text-left text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            disabled={step === 'importing' || step === 'analyzing'}
          >
            {step === 'upload' || step === 'processing-job' ? 'Fechar' : '← Voltar'}
          </button>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {step === 'map' && (
              <button
                onClick={goToPreview}
                className="min-h-11 rounded-xl px-5 py-2.5 text-sm font-medium text-white transition-all active:scale-[0.99]"
                style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
              >
                Revisar prévia →
              </button>
            )}
            {step === 'preview' && (
              <button
                onClick={handleImport}
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white transition-all active:scale-[0.99]"
                style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
              >
                <Check size={16} />
                Iniciar importação de {rows.length} paciente(s)
              </button>
            )}
            {step === 'importing' && (
              <button disabled className="min-h-11 rounded-xl bg-teal-300 px-5 py-2.5 text-sm font-medium text-white opacity-60">
                Enviando job...
              </button>
            )}
            {step === 'processing-job' && (
              <button disabled className="min-h-11 rounded-xl bg-teal-300 px-5 py-2.5 text-sm font-medium text-white opacity-60">
                Processando no backend...
              </button>
            )}
          </div>
        </div>
    </Modal>
  )
}


