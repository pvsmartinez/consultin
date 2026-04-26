import {
  buildStaffLinks,
  buildPatientLinks,
  buildQuotaNotice,
  detectRequestedDateRange,
} from './index.ts'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

// ---------------------------------------------------------------------------
// buildStaffLinks
// ---------------------------------------------------------------------------

Deno.test('buildStaffLinks contains all expected internal links', () => {
  const result = buildStaffLinks(null)
  assert(result.includes('/agenda'), '/agenda')
  assert(result.includes('/minha-agenda'), '/minha-agenda')
  assert(result.includes('/pacientes'), '/pacientes')
  assert(result.includes('/financeiro'), '/financeiro')
  assert(result.includes('/assinatura'), '/assinatura')
})

Deno.test('buildStaffLinks omits public page lines when publicPage is null', () => {
  const result = buildStaffLinks(null)
  assert(!result.includes('/p/'), 'no /p/ slug when null')
})

Deno.test('buildStaffLinks includes clinic public page link when provided', () => {
  const result = buildStaffLinks({ slug: 'minha-clinica', show_booking: false, clinic_name: 'Clínica Teste', phone: null, address: null, services: [] })
  assert(result.includes('/p/minha-clinica'), 'slug included')
})

Deno.test('buildStaffLinks includes booking link only when show_booking is true', () => {
  const withBooking = buildStaffLinks({ slug: 'clinica', show_booking: true, clinic_name: 'X', phone: null, address: null, services: [] })
  const noBooking   = buildStaffLinks({ slug: 'clinica', show_booking: false, clinic_name: 'X', phone: null, address: null, services: [] })
  assert(withBooking.includes('/agendar'), 'booking link present when show_booking=true')
  assert(!noBooking.includes('/agendar'), 'booking link absent when show_booking=false')
})

// ---------------------------------------------------------------------------
// buildPatientLinks
// ---------------------------------------------------------------------------

Deno.test('buildPatientLinks contains patient-facing links', () => {
  const result = buildPatientLinks(null)
  assert(result.includes('/minhas-consultas'), '/minhas-consultas')
  assert(result.includes('/agendar'), '/agendar')
  assert(result.includes('/meu-perfil'), '/meu-perfil')
})

Deno.test('buildPatientLinks omits clinic page lines when publicPage is null', () => {
  const result = buildPatientLinks(null)
  assert(!result.includes('/p/'), 'no /p/ when null')
})

Deno.test('buildPatientLinks includes booking link when show_booking is true', () => {
  const result = buildPatientLinks({ slug: 'clinica', show_booking: true, clinic_name: 'X', phone: null, address: null, services: [] })
  assert(result.includes('/p/clinica/agendar'), 'public booking link')
})

// ---------------------------------------------------------------------------
// buildQuotaNotice
// ---------------------------------------------------------------------------

function makeClinic(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    name: 'Teste',
    subscription_tier: 'basic',
    subscription_status: 'ACTIVE',
    billing_override_enabled: false,
    payments_enabled: true,
    ...overrides,
  } as Parameters<typeof buildQuotaNotice>[0]
}

Deno.test('buildQuotaNotice returns empty string for unlimited tier', () => {
  const result = buildQuotaNotice(makeClinic({ subscription_tier: 'unlimited' }))
  assert(result === '', 'unlimited → empty')
})

Deno.test('buildQuotaNotice returns empty string for trial tier', () => {
  const result = buildQuotaNotice(makeClinic({ subscription_tier: 'trial' }))
  assert(result === '', 'trial → empty')
})

Deno.test('buildQuotaNotice returns empty string when subscription is not active', () => {
  const result = buildQuotaNotice(makeClinic({ subscription_status: 'OVERDUE', billing_override_enabled: false }))
  assert(result === '', 'OVERDUE without override → empty')
})

Deno.test('buildQuotaNotice returns limit notice for basic active plan', () => {
  const result = buildQuotaNotice(makeClinic({ subscription_tier: 'basic', subscription_status: 'ACTIVE' }))
  assert(result.includes('40'), 'basic limit 40')
  assert(result.includes('Básico'), 'tier label em PT')
})

Deno.test('buildQuotaNotice returns limit notice for professional plan', () => {
  const result = buildQuotaNotice(makeClinic({ subscription_tier: 'professional', subscription_status: 'ACTIVE' }))
  assert(result.includes('100'), 'professional limit 100')
  assert(result.includes('Profissional'), 'tier label em PT')
})

Deno.test('buildQuotaNotice accepts billing_override_enabled as substitute for ACTIVE', () => {
  const result = buildQuotaNotice(makeClinic({ subscription_status: 'OVERDUE', billing_override_enabled: true }))
  assert(result.includes('40'), 'override makes it active')
})

// ---------------------------------------------------------------------------
// detectRequestedDateRange — explicit date DD/MM (platform-independent)
// ---------------------------------------------------------------------------

Deno.test('detectRequestedDateRange parses explicit DD/MM date', () => {
  const { start, days } = detectRequestedDateRange('quero para 15/06')
  assert(start.getMonth() === 5, 'month is June (0-indexed)')
  assert(start.getDate() === 15, 'day is 15')
  assert(days === 1, 'single day')
})

Deno.test('detectRequestedDateRange parses explicit DD/MM/YYYY date', () => {
  const { start, days } = detectRequestedDateRange('disponivel em 20/08/2025')
  assert(start.getFullYear() === 2025, 'year 2025')
  assert(start.getMonth() === 7, 'August')
  assert(start.getDate() === 20, 'day 20')
  assert(days === 1, 'single day')
})

Deno.test('detectRequestedDateRange parses "proximos 3 dias"', () => {
  const { days } = detectRequestedDateRange('quais os próximos 3 dias disponíveis')
  assert(days === 3, '3 days')
})

Deno.test('detectRequestedDateRange caps "proximos N dias" at 14', () => {
  const { days } = detectRequestedDateRange('próximos 30 dias')
  assert(days === 14, 'capped at 14')
})

Deno.test('detectRequestedDateRange falls back to today for unrecognized input', () => {
  const before = new Date()
  const { days } = detectRequestedDateRange('qualquer dia')
  const after = new Date()
  assert(days === 1, 'days=1')
  assert(before.getTime() <= after.getTime(), 'start is around now')
})
