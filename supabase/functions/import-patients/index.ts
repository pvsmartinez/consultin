import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY') ?? ''
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BUILTIN_FIELDS = [
  'name',
  'cpf',
  'rg',
  'birth_date',
  'sex',
  'phone',
  'email',
  'address_street',
  'address_number',
  'address_complement',
  'address_neighborhood',
  'address_city',
  'address_state',
  'address_zip',
  'notes',
] as const

const CUSTOM_FIELD_TYPES = ['text', 'textarea', 'number', 'date', 'select', 'multiselect', 'boolean'] as const

type BuiltinField = typeof BUILTIN_FIELDS[number]
type CustomFieldType = typeof CUSTOM_FIELD_TYPES[number]

interface ImportPatientsRequest {
  headers?: unknown
  sampleRows?: unknown
}

interface ParsedResponse {
  mapping?: Record<string, string>
  customFields?: Array<{
    header?: string
    key?: string
    label?: string
    type?: string
    options?: string[]
  }>
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

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
}

function uniqueKey(baseKey: string, usedKeys: Set<string>) {
  const fallback = baseKey || 'campo_personalizado'
  let nextKey = fallback
  let suffix = 2
  while (usedKeys.has(nextKey)) {
    nextKey = `${fallback}_${suffix}`
    suffix += 1
  }
  usedKeys.add(nextKey)
  return nextKey
}

function isBuiltinField(field: string): field is BuiltinField {
  return BUILTIN_FIELDS.includes(field as BuiltinField)
}

function isCustomFieldType(type: string): type is CustomFieldType {
  return CUSTOM_FIELD_TYPES.includes(type as CustomFieldType)
}

serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: ImportPatientsRequest
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const headers = Array.isArray(body.headers)
    ? body.headers.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : []
  const sampleRows = Array.isArray(body.sampleRows)
    ? body.sampleRows.filter((row): row is string[] => Array.isArray(row)).slice(0, 8)
    : []

  if (headers.length === 0) return json({ error: 'Headers are required' }, 400)
  if (!OPENROUTER_API_KEY) return json({ mapping: {}, customFields: [] })

  const systemPrompt = [
    'You analyze spreadsheet headers from Brazilian clinic systems and map them to Consultin patient fields.',
    'Return JSON only with shape: {"mapping": Record<string,string>, "customFields": Array<{"header": string, "key": string, "label": string, "type": string, "options"?: string[]}>}.',
    `Allowed built-in field keys: ${BUILTIN_FIELDS.join(', ')}.`,
    `Allowed custom field types: ${CUSTOM_FIELD_TYPES.join(', ')}.`,
    'Map a column to a built-in field only when confidence is high.',
    'Columns not represented by built-in fields should become customFields.',
    'Use Portuguese labels for customFields when possible.',
    'Never include headers that are not present in the input.',
    'Never repeat the same header twice between mapping/customFields.',
    'For plan/status categorical values, prefer select. For long text, use textarea. For yes/no values, use boolean.',
  ].join(' ')

  const orRes = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://consultin.app',
      'X-Title': 'Consultin Patient Import',
    },
    body: JSON.stringify({
      model: 'google/gemma-4-31b-it',
      temperature: 0.1,
      max_tokens: 1000,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: JSON.stringify({ headers, sampleRows }),
        },
      ],
    }),
  })

  if (!orRes.ok) {
    console.error('[import-patients] OpenRouter error:', await orRes.text())
    return json({ mapping: {}, customFields: [] })
  }

  const rawContent = (await orRes.json())?.choices?.[0]?.message?.content ?? ''
  const cleaned = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()

  let parsed: ParsedResponse
  try {
    parsed = JSON.parse(cleaned) as ParsedResponse
  } catch {
    console.error('[import-patients] JSON parse error:', rawContent)
    return json({ mapping: {}, customFields: [] })
  }

  const validMapping: Partial<Record<BuiltinField, string>> = {}
  const usedHeaders = new Set<string>()

  for (const [field, header] of Object.entries(parsed.mapping ?? {})) {
    if (!isBuiltinField(field) || typeof header !== 'string' || !headers.includes(header) || usedHeaders.has(header)) continue
    validMapping[field] = header
    usedHeaders.add(header)
  }

  const usedKeys = new Set<string>()
  const validCustomFields = Array.isArray(parsed.customFields)
    ? parsed.customFields
        .map(field => {
          const header = typeof field.header === 'string' ? field.header : ''
          if (!header || !headers.includes(header) || usedHeaders.has(header)) return null

          const requestedType = typeof field.type === 'string' ? field.type : 'text'
          const type = isCustomFieldType(requestedType) ? requestedType : 'text'
          const label = typeof field.label === 'string' && field.label.trim().length > 0 ? field.label.trim() : header.trim()
          const options = Array.isArray(field.options)
            ? field.options.filter((option): option is string => typeof option === 'string' && option.trim().length > 0).slice(0, 12)
            : undefined

          usedHeaders.add(header)
          return {
            header,
            key: uniqueKey(slugify(typeof field.key === 'string' ? field.key : header), usedKeys),
            label,
            type,
            ...(options && options.length > 0 ? { options } : {}),
          }
        })
        .filter(field => field !== null)
    : []

  return json({
    mapping: validMapping,
    customFields: validCustomFields,
  })
})