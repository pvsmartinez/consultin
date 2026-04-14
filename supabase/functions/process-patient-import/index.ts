import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as XLSX from 'https://esm.sh/xlsx@0.18.5'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

type Mapping = Record<string, string>
type CustomFieldType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'multiselect' | 'boolean'
type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue | undefined }

interface ImportJobRow {
  id: string
  clinic_id: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  file_name: string
  storage_path: string
  total_rows: number
  processed_rows: number
  imported_rows: number
  skipped_rows: number
  failed_rows: number
  created_custom_fields: number
  mapping: JsonValue
  custom_fields: JsonValue
}

interface CustomFieldSuggestion {
  header: string
  key: string
  label: string
  type: CustomFieldType
  options?: string[]
}

interface PatientRow {
  id?: string
  clinic_id: string
  user_id: string | null
  name: string
  cpf: string | null
  rg: string | null
  birth_date: string | null
  sex: string | null
  phone: string | null
  email: string | null
  address_street: string | null
  address_number: string | null
  address_complement: string | null
  address_neighborhood: string | null
  address_city: string | null
  address_state: string | null
  address_zip: string | null
  notes: string | null
  custom_fields: Record<string, JsonValue>
  anamnesis_data: Record<string, JsonValue>
  created_at?: string
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function normalizeHeader(header: string) {
  return header
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function autoDetect(header: string): string {
  const normalized = normalizeHeader(header)
  return AUTO_DETECT[header.toLowerCase().trim()] ?? AUTO_DETECT[normalized] ?? ''
}

function normalizeSex(value: string): string | null {
  const lower = value.trim().toLowerCase()
  if (['m', 'masc', 'masculino', 'male'].includes(lower)) return 'M'
  if (['f', 'fem', 'feminino', 'female'].includes(lower)) return 'F'
  if (['o', 'outro', 'other', 'na', 'n/a'].includes(lower)) return 'O'
  return null
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function normalizeDate(value: string): string | null {
  const input = value.trim()
  if (!input) return null

  const direct = input.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (direct) return `${direct[1]}-${direct[2]}-${direct[3]}`

  const br = input.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (br) {
    const year = br[3].length === 2 ? `20${br[3]}` : br[3]
    return `${year}-${pad(Number(br[2]))}-${pad(Number(br[1]))}`
  }

  return null
}

function normalizeCpf(value: string | null) {
  const digits = (value ?? '').replace(/\D/g, '')
  return digits.length === 11 ? digits : null
}

function normalizePhone(value: string | null) {
  const digits = (value ?? '').replace(/\D/g, '')
  return digits.length >= 10 ? digits : null
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isEmpty(value: string | null | undefined) {
  return !value || value.trim() === ''
}

async function parseStoredFile(fileName: string, blob: Blob): Promise<{ headers: string[]; rows: string[][] }> {
  if (fileName.match(/\.(xlsx|xls|ods)$/i)) {
    const data = new Uint8Array(await blob.arrayBuffer())
    const workbook = XLSX.read(data, { type: 'array', cellDates: true })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const raw = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1, defval: '' })
    const [headerRow, ...restRows] = raw
    const headers = (headerRow ?? []).map(cell => safeString(String(cell ?? ''))).filter(Boolean)
    const rows = restRows
      .filter(row => row.some(cell => safeString(String(cell ?? '')) !== ''))
      .map(row => headers.map((_, index) => safeString(String(row[index] ?? ''))))
    return { headers, rows }
  }

  const text = await blob.text()
  const lines = text.split(/\r?\n/).filter(line => line.trim())
  if (lines.length === 0) return { headers: [], rows: [] }

  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ','
  const parseLine = (line: string) => line.split(sep).map(cell => cell.replace(/^"|"$/g, '').trim())
  const headers = parseLine(lines[0]).filter(Boolean)
  const rows = lines.slice(1).map(parseLine)
  return { headers, rows }
}

function sanitizeMapping(rawMapping: JsonValue, headers: string[]): Mapping {
  const mapping: Mapping = {}
  if (!rawMapping || Array.isArray(rawMapping) || typeof rawMapping !== 'object') return mapping

  for (const [fieldKey, header] of Object.entries(rawMapping)) {
    if (typeof header === 'string' && headers.includes(header)) mapping[fieldKey] = header
  }

  if (!mapping.name) {
    const nameHeader = headers.find(header => autoDetect(header) === 'name')
    if (nameHeader) mapping.name = nameHeader
  }

  return mapping
}

function sanitizeCustomFields(rawCustomFields: JsonValue, headers: string[]): CustomFieldSuggestion[] {
  if (!Array.isArray(rawCustomFields)) return []

  return rawCustomFields
    .map(field => {
      if (!field || typeof field !== 'object' || Array.isArray(field)) return null
      const header = typeof field.header === 'string' ? field.header : ''
      const key = typeof field.key === 'string' ? field.key : ''
      const label = typeof field.label === 'string' ? field.label : header
      const type = typeof field.type === 'string' ? field.type as CustomFieldType : 'text'
      const options = Array.isArray(field.options)
        ? field.options.filter((option): option is string => typeof option === 'string' && option.trim().length > 0)
        : undefined

      if (!header || !key || !headers.includes(header)) return null
      return { header, key, label, type, ...(options && options.length > 0 ? { options } : {}) }
    })
    .filter((field): field is CustomFieldSuggestion => field !== null)
}

function parseCustomFieldValue(rawValue: string, suggestion: CustomFieldSuggestion): JsonValue {
  const trimmed = rawValue.trim()
  if (!trimmed) return null

  if (suggestion.type === 'boolean') return ['sim', 'yes', 'true', '1'].includes(trimmed.toLowerCase())
  if (suggestion.type === 'number') {
    const parsed = Number(trimmed.replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : trimmed
  }
  if (suggestion.type === 'date') return normalizeDate(trimmed) ?? trimmed
  if (suggestion.type === 'multiselect') {
    return trimmed.split(/[;,|]/).map(part => part.trim()).filter(Boolean)
  }

  return trimmed
}

function getHeaderValue(headers: string[], row: string[], header: string) {
  const index = headers.indexOf(header)
  return index >= 0 ? safeString(row[index] ?? '') : ''
}

function buildIncomingPatient(
  clinicId: string,
  headers: string[],
  row: string[],
  mapping: Mapping,
  customFields: CustomFieldSuggestion[],
): PatientRow | null {
  const get = (fieldKey: string) => {
    const header = mapping[fieldKey]
    return header ? getHeaderValue(headers, row, header) : ''
  }

  const name = get('name')
  if (!name) return null

  const customFieldValues = Object.fromEntries(
    customFields
      .map(field => [field.key, parseCustomFieldValue(getHeaderValue(headers, row, field.header), field)] as const)
      .filter((entry): entry is readonly [string, JsonValue] => entry[1] !== null),
  )

  return {
    clinic_id: clinicId,
    user_id: null,
    name,
    cpf: get('cpf') || null,
    rg: get('rg') || null,
    birth_date: normalizeDate(get('birth_date')),
    sex: normalizeSex(get('sex')),
    phone: get('phone') || null,
    email: get('email') || null,
    address_street: get('address_street') || null,
    address_number: get('address_number') || null,
    address_complement: get('address_complement') || null,
    address_neighborhood: get('address_neighborhood') || null,
    address_city: get('address_city') || null,
    address_state: get('address_state') || null,
    address_zip: get('address_zip') || null,
    notes: get('notes') || null,
    custom_fields: customFieldValues,
    anamnesis_data: {},
  }
}

function buildNameBirthKey(name: string, birthDate: string | null) {
  if (!birthDate) return null
  const normalizedName = normalizeHeader(name).replace(/[^a-z0-9]+/g, '')
  return normalizedName ? `${normalizedName}|${birthDate}` : null
}

function registerPatientLookups(
  row: PatientRow,
  byCpf: Map<string, PatientRow>,
  byPhone: Map<string, PatientRow>,
  byNameBirth: Map<string, PatientRow>,
) {
  const cpf = normalizeCpf(row.cpf)
  const phone = normalizePhone(row.phone)
  const nameBirth = buildNameBirthKey(row.name, row.birth_date)
  if (cpf) byCpf.set(cpf, row)
  if (phone) byPhone.set(phone, row)
  if (nameBirth) byNameBirth.set(nameBirth, row)
}

function findPatientMatch(
  row: PatientRow,
  byCpf: Map<string, PatientRow>,
  byPhone: Map<string, PatientRow>,
  byNameBirth: Map<string, PatientRow>,
) {
  const cpf = normalizeCpf(row.cpf)
  if (cpf && byCpf.has(cpf)) return byCpf.get(cpf) ?? null

  const phone = normalizePhone(row.phone)
  if (phone && byPhone.has(phone)) return byPhone.get(phone) ?? null

  const nameBirth = buildNameBirthKey(row.name, row.birth_date)
  if (nameBirth && byNameBirth.has(nameBirth)) return byNameBirth.get(nameBirth) ?? null

  return null
}

function mergeScalar(current: string | null, incoming: string | null) {
  return isEmpty(current) ? incoming : current
}

function mergePatient(target: PatientRow, incoming: PatientRow) {
  target.name = mergeScalar(target.name, incoming.name) ?? target.name
  target.cpf = mergeScalar(target.cpf, incoming.cpf)
  target.rg = mergeScalar(target.rg, incoming.rg)
  target.birth_date = mergeScalar(target.birth_date, incoming.birth_date)
  target.sex = mergeScalar(target.sex, incoming.sex)
  target.phone = mergeScalar(target.phone, incoming.phone)
  target.email = mergeScalar(target.email, incoming.email)
  target.address_street = mergeScalar(target.address_street, incoming.address_street)
  target.address_number = mergeScalar(target.address_number, incoming.address_number)
  target.address_complement = mergeScalar(target.address_complement, incoming.address_complement)
  target.address_neighborhood = mergeScalar(target.address_neighborhood, incoming.address_neighborhood)
  target.address_city = mergeScalar(target.address_city, incoming.address_city)
  target.address_state = mergeScalar(target.address_state, incoming.address_state)
  target.address_zip = mergeScalar(target.address_zip, incoming.address_zip)
  target.notes = mergeScalar(target.notes, incoming.notes)

  for (const [key, value] of Object.entries(incoming.custom_fields)) {
    const currentValue = target.custom_fields[key]
    if (currentValue === undefined || currentValue === null || currentValue === '') {
      target.custom_fields[key] = value
    }
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size))
  }
  return result
}

serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabase = createClient(SUPABASE_URL, SUPABASE_SRK)
  let jobId: string | null = null

  try {
    const body = await req.json()
    jobId = typeof body.jobId === 'string' ? body.jobId : null
    if (!jobId || typeof jobId !== 'string') return json({ error: 'jobId is required' }, 400)

    const { data: jobData, error: jobError } = await supabase
      .from('patient_import_jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (jobError || !jobData) return json({ error: 'Import job not found' }, 404)

    const job = jobData as ImportJobRow
    if (job.status === 'completed') return json({ ok: true, status: 'completed' })

    await supabase
      .from('patient_import_jobs')
      .update({ status: 'processing', started_at: new Date().toISOString(), error_message: null })
      .eq('id', jobId)

    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from('patient-imports')
      .download(job.storage_path)

    if (downloadError || !fileBlob) throw new Error(downloadError?.message ?? 'Não consegui baixar o arquivo enviado.')

    const { headers, rows } = await parseStoredFile(job.file_name, fileBlob)
    if (headers.length === 0) throw new Error('O arquivo enviado não contém cabeçalhos válidos.')

    const mapping = sanitizeMapping(job.mapping, headers)
    if (!mapping.name) throw new Error('Não encontrei uma coluna equivalente ao nome do paciente.')

    const customFieldSuggestions = sanitizeCustomFields(job.custom_fields, headers)

    const { data: clinicData, error: clinicError } = await supabase
      .from('clinics')
      .select('custom_patient_fields')
      .eq('id', job.clinic_id)
      .single()

    if (clinicError || !clinicData) throw new Error(clinicError?.message ?? 'Clínica não encontrada.')

    const existingCustomFields = Array.isArray(clinicData.custom_patient_fields)
      ? clinicData.custom_patient_fields as Array<Record<string, unknown>>
      : []
    const existingKeys = new Set(existingCustomFields.map(field => safeString(field.key)))
    const newCustomFields = customFieldSuggestions
      .filter(field => !existingKeys.has(field.key))
      .map(field => ({
        key: field.key,
        label: field.label,
        type: field.type,
        required: false,
        ...(field.options && field.options.length > 0 ? { options: field.options } : {}),
      }))

    if (newCustomFields.length > 0) {
      await supabase
        .from('clinics')
        .update({
          custom_patient_fields: [...existingCustomFields, ...newCustomFields],
        })
        .eq('id', job.clinic_id)
    }

    const { data: existingPatientsData, error: existingPatientsError } = await supabase
      .from('patients')
      .select('*')
      .eq('clinic_id', job.clinic_id)

    if (existingPatientsError) throw new Error(existingPatientsError.message)

    const existingPatients = ((existingPatientsData ?? []) as Array<Record<string, unknown>>).map(row => ({
      id: safeString(row.id),
      clinic_id: safeString(row.clinic_id),
      user_id: typeof row.user_id === 'string' ? row.user_id : null,
      name: safeString(row.name),
      cpf: typeof row.cpf === 'string' ? row.cpf : null,
      rg: typeof row.rg === 'string' ? row.rg : null,
      birth_date: typeof row.birth_date === 'string' ? row.birth_date : null,
      sex: typeof row.sex === 'string' ? row.sex : null,
      phone: typeof row.phone === 'string' ? row.phone : null,
      email: typeof row.email === 'string' ? row.email : null,
      address_street: typeof row.address_street === 'string' ? row.address_street : null,
      address_number: typeof row.address_number === 'string' ? row.address_number : null,
      address_complement: typeof row.address_complement === 'string' ? row.address_complement : null,
      address_neighborhood: typeof row.address_neighborhood === 'string' ? row.address_neighborhood : null,
      address_city: typeof row.address_city === 'string' ? row.address_city : null,
      address_state: typeof row.address_state === 'string' ? row.address_state : null,
      address_zip: typeof row.address_zip === 'string' ? row.address_zip : null,
      notes: typeof row.notes === 'string' ? row.notes : null,
      custom_fields: row.custom_fields && typeof row.custom_fields === 'object' && !Array.isArray(row.custom_fields)
        ? row.custom_fields as Record<string, JsonValue>
        : {},
      anamnesis_data: row.anamnesis_data && typeof row.anamnesis_data === 'object' && !Array.isArray(row.anamnesis_data)
        ? row.anamnesis_data as Record<string, JsonValue>
        : {},
      created_at: typeof row.created_at === 'string' ? row.created_at : undefined,
    } satisfies PatientRow))

    const byCpf = new Map<string, PatientRow>()
    const byPhone = new Map<string, PatientRow>()
    const byNameBirth = new Map<string, PatientRow>()
    const dirtyIds = new Set<string>()
    const newPatients: PatientRow[] = []
    const sampleErrors: Array<{ line: number; error: string }> = []
    let processedRows = 0
    let skippedRows = 0
    let failedRows = 0

    for (const patient of existingPatients) registerPatientLookups(patient, byCpf, byPhone, byNameBirth)

    for (const [index, row] of rows.entries()) {
      try {
        const incoming = buildIncomingPatient(job.clinic_id, headers, row, mapping, customFieldSuggestions)
        if (!incoming) {
          skippedRows += 1
          processedRows += 1
        } else {
          const match = findPatientMatch(incoming, byCpf, byPhone, byNameBirth)
          if (match) {
            mergePatient(match, incoming)
            if (match.id) dirtyIds.add(match.id)
          } else {
            newPatients.push(incoming)
            registerPatientLookups(incoming, byCpf, byPhone, byNameBirth)
          }
          processedRows += 1
        }
      } catch (error) {
        failedRows += 1
        processedRows += 1
        if (sampleErrors.length < 20) {
          sampleErrors.push({
            line: index + 2,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      if (processedRows % 200 === 0) {
        await supabase
          .from('patient_import_jobs')
          .update({
            processed_rows: processedRows,
            skipped_rows: skippedRows,
            failed_rows: failedRows,
            total_rows: rows.length,
          })
          .eq('id', jobId)
      }
    }

    const updates = existingPatients.filter(patient => patient.id && dirtyIds.has(patient.id))

    for (const batch of chunk(newPatients, 200)) {
      const { error } = await supabase.from('patients').insert(batch)
      if (error) throw new Error(error.message)
    }

    for (const batch of chunk(updates, 200)) {
      const { error } = await supabase.from('patients').upsert(batch, { onConflict: 'id' })
      if (error) throw new Error(error.message)
    }

    await supabase
      .from('patient_import_jobs')
      .update({
        status: 'completed',
        total_rows: rows.length,
        processed_rows: processedRows,
        imported_rows: newPatients.length + updates.length,
        skipped_rows: skippedRows,
        failed_rows: failedRows,
        created_custom_fields: newCustomFields.length,
        mapping,
        custom_fields: customFieldSuggestions,
        sample_errors: sampleErrors,
        finished_at: new Date().toISOString(),
      })
      .eq('id', jobId)

    return json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    try {
      if (jobId) {
        await supabase
          .from('patient_import_jobs')
          .update({
            status: 'failed',
            error_message: message,
            finished_at: new Date().toISOString(),
          })
          .eq('id', jobId)
      }
    } catch {
      // ignore secondary failure when updating job status
    }

    console.error('[process-patient-import] failed:', message)
    return json({ error: message }, 500)
  }
})