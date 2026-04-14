import { format, isValid, parse } from 'date-fns'
import type { CustomFieldDef } from '../types'

export type PatientImportMapping = Record<string, string>
export type CustomFieldSuggestion = Pick<CustomFieldDef, 'key' | 'label' | 'type' | 'options'> & { header: string }

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

export function autoDetectPatientHeader(header: string): string {
  const normalized = header.toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return AUTO_DETECT[header.toLowerCase().trim()] ?? AUTO_DETECT[normalized] ?? ''
}

export function normalizeImportedDate(value: string): string | null {
  const input = value.trim()
  if (!input) return null
  const formats = ['dd/MM/yyyy', 'dd-MM-yyyy', 'yyyy-MM-dd', 'MM/dd/yyyy', 'dd/MM/yy']
  for (const fmt of formats) {
    try {
      const date = parse(input, fmt, new Date())
      if (isValid(date)) return format(date, 'yyyy-MM-dd')
    } catch {
      // try next format
    }
  }
  return null
}

export function slugifyHeader(header: string) {
  return header
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
}

export function uniqueCustomFieldKey(baseKey: string, existingKeys: Set<string>) {
  const fallback = baseKey || 'campo_personalizado'
  let nextKey = fallback
  let suffix = 2
  while (existingKeys.has(nextKey)) {
    nextKey = `${fallback}_${suffix}`
    suffix += 1
  }
  existingKeys.add(nextKey)
  return nextKey
}

export function inferCustomFieldType(values: string[]): CustomFieldDef['type'] {
  const normalized = values.map(v => v.trim()).filter(Boolean)
  if (normalized.length === 0) return 'text'

  const lower = normalized.map(v => v.toLowerCase())
  if (lower.every(v => ['sim', 'nao', 'não', 'yes', 'no', 'true', 'false', '0', '1'].includes(v))) {
    return 'boolean'
  }
  if (normalized.every(v => normalizeImportedDate(v) !== null)) return 'date'
  if (normalized.every(v => /^-?\d+(?:[.,]\d+)?$/.test(v))) return 'number'
  if (normalized.some(v => v.length > 80)) return 'textarea'

  const uniqueValues = [...new Set(normalized)]
  if (
    uniqueValues.length > 1
    && uniqueValues.length <= 8
    && (normalized.length <= 5 || uniqueValues.length / normalized.length <= 0.8)
  ) {
    return 'select'
  }

  return 'text'
}

export function buildFallbackCustomFieldSuggestions(
  headers: string[],
  mapping: PatientImportMapping,
  rows: string[][],
  existingFields: CustomFieldDef[],
): CustomFieldSuggestion[] {
  const usedHeaders = new Set(Object.values(mapping).filter(Boolean))
  const usedKeys = new Set(existingFields.map(field => field.key))

  return headers
    .filter(header => !usedHeaders.has(header))
    .map(header => {
      const headerIndex = headers.indexOf(header)
      const sampleValues = rows
        .slice(0, 12)
        .map(row => String(row[headerIndex] ?? '').trim())
        .filter(Boolean)

      const type = inferCustomFieldType(sampleValues)
      return {
        header,
        key: uniqueCustomFieldKey(slugifyHeader(header), usedKeys),
        label: header.trim(),
        type,
        ...(type === 'select'
          ? { options: [...new Set(sampleValues)].slice(0, 8) }
          : {}),
      }
    })
}