/**
 * Edge Function: admin-stats (Consultin)
 *
 * Expõe estatísticas e gestão para o admin.pmatz.com.
 *
 * Rotas:
 *   GET /                          → stats globais de clínicas e assinaturas
 *   GET /clinics                   → lista todas as clínicas com tier/status
 *   PATCH /clinics/:id             → atualiza subscription_tier de uma clínica
 *
 * Autenticação:
 *   Header: x-admin-secret: <ADMIN_SECRET>
 *
 * Secrets necessários (supabase secrets set --project-ref nxztzehgnkdmluogxehi):
 *   ADMIN_SECRET  — mesma senha mestra do painel admin
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ADMIN_SECRET              = Deno.env.get('ADMIN_SECRET')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'x-admin-secret, content-type',
  'Access-Control-Allow-Methods': 'GET, PATCH, POST, OPTIONS',
}

const VALID_TIERS = ['trial', 'basic', 'professional', 'unlimited'] as const
type SubscriptionTier = typeof VALID_TIERS[number]

interface ClinicRow {
  id: string
  name: string
  subscription_status: string | null
  subscription_tier: string | null
  payments_enabled: boolean
  trial_ends_at: string | null
  created_at: string
  asaas_subscription_id: string | null
  patients_30d?: number
  appointments_30d?: number
}

interface ClinicManageRow {
  asaas_subscription_id: string | null
}

interface PublicSiteEventRow {
  created_at: string
  event_name: string
  page_path: string
  metadata: Record<string, unknown> | null
}

interface LandingAnalyticsRow {
  path: string
  signup_page_views: number
  signup_cta_clicks: number
  clinic_signup_submits: number
  whatsapp_cta_clicks: number
  clinics_created: number
}

interface SignupAttributionClinicRow {
  created_at: string
  signup_attribution: Record<string, unknown> | null
}

function readMetadataText(metadata: Record<string, unknown> | null | undefined, key: string, maxLength = 200) {
  if (!metadata) return null
  const value = metadata[key]
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, maxLength)
}

function getLandingPath(row: PublicSiteEventRow) {
  return readMetadataText(row.metadata, 'landingPath', 200)
    ?? readMetadataText(row.metadata, 'pagePath', 200)
    ?? row.page_path
}

function getClinicLandingPath(row: SignupAttributionClinicRow) {
  return readMetadataText(row.signup_attribution, 'landingPath', 200)
    ?? readMetadataText(row.signup_attribution, 'pagePath', 200)
    ?? '/unknown'
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function err(msg: string, status = 400): Response {
  return json({ error: msg }, status)
}

function assertAdmin(req: Request): true | Response {
  const secret = req.headers.get('x-admin-secret')
  if (!secret || secret !== ADMIN_SECRET) return err('Forbidden', 403)
  return true
}

const MRR_BY_TIER: Record<string, number> = {
  basic:        10000, // R$100
  professional: 20000, // R$200
  unlimited:    30000, // R$300
}

async function listPublicAnalytics(client: ReturnType<typeof createClient>): Promise<{
  since_7d: string
  since_30d: string
  page_views_7d: number
  login_page_views_7d: number
  signup_page_views_7d: number
  login_cta_clicks_7d: number
  signup_cta_clicks_7d: number
  whatsapp_cta_clicks_7d: number
  clinic_signup_submits_7d: number
  clinic_signup_submits_30d: number
  top_pages_30d: Array<{ path: string; views: number }>
  signup_landings_30d: LandingAnalyticsRow[]
}> {
  const now = Date.now()
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000)
  const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000)

  const { data, error } = await client
    .from('public_site_events')
    .select('created_at, event_name, page_path, metadata')
    .gte('created_at', since30d.toISOString())
    .order('created_at', { ascending: false })
    .limit(5000)

  if (error) throw new Error(error.message)

  const rows = (data ?? []) as PublicSiteEventRow[]
  const pageCounts = new Map<string, number>()
  const landingCounts = new Map<string, LandingAnalyticsRow>()

  let pageViews7d = 0
  let loginPageViews7d = 0
  let signupPageViews7d = 0
  let loginCtaClicks7d = 0
  let signupCtaClicks7d = 0
  let clinicSignupSubmits7d = 0
  let clinicSignupSubmits30d = 0
  let whatsappCtaClicks7d = 0

  for (const row of rows) {
    const createdAt = new Date(row.created_at).getTime()
    const in7d = createdAt >= since7d.getTime()
    const landingPath = getLandingPath(row)

    if (!landingCounts.has(landingPath)) {
      landingCounts.set(landingPath, {
        path: landingPath,
        signup_page_views: 0,
        signup_cta_clicks: 0,
        clinic_signup_submits: 0,
        whatsapp_cta_clicks: 0,
        clinics_created: 0,
      })
    }

    const landing = landingCounts.get(landingPath)!

    if (row.event_name === 'page_view') {
      pageCounts.set(row.page_path, (pageCounts.get(row.page_path) ?? 0) + 1)
      if (row.page_path === '/cadastro-clinica') landing.signup_page_views += 1

      if (in7d) {
        pageViews7d += 1
        if (row.page_path === '/login') loginPageViews7d += 1
        if (row.page_path === '/cadastro-clinica') signupPageViews7d += 1
      }
    }

    if (row.event_name === 'login_cta_click' && in7d) loginCtaClicks7d += 1
    if (row.event_name === 'signup_cta_click') {
      landing.signup_cta_clicks += 1
      if (in7d) signupCtaClicks7d += 1
    }
    if (row.event_name === 'whatsapp_cta_click') {
      landing.whatsapp_cta_clicks += 1
      if (in7d) whatsappCtaClicks7d += 1
    }
    if (row.event_name === 'clinic_signup_submit') {
      landing.clinic_signup_submits += 1
      if (in7d) clinicSignupSubmits7d += 1
      clinicSignupSubmits30d += 1
    }
  }

  const { data: createdClinics, error: createdClinicsError } = await client
    .from('clinics')
    .select('created_at, signup_attribution')
    .gte('created_at', since30d.toISOString())
    .order('created_at', { ascending: false })
    .limit(5000)

  if (createdClinicsError) throw new Error(createdClinicsError.message)

  for (const clinic of (createdClinics ?? []) as SignupAttributionClinicRow[]) {
    const landingPath = getClinicLandingPath(clinic)

    if (!landingCounts.has(landingPath)) {
      landingCounts.set(landingPath, {
        path: landingPath,
        signup_page_views: 0,
        signup_cta_clicks: 0,
        clinic_signup_submits: 0,
        whatsapp_cta_clicks: 0,
        clinics_created: 0,
      })
    }

    landingCounts.get(landingPath)!.clinics_created += 1
  }

  const topPages = Array.from(pageCounts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([path, views]) => ({ path, views }))

  const signupLandings = Array.from(landingCounts.values())
    .filter((item) => item.signup_page_views > 0 || item.signup_cta_clicks > 0 || item.clinic_signup_submits > 0 || item.whatsapp_cta_clicks > 0 || item.clinics_created > 0)
    .sort((left, right) => {
      const leftScore = left.clinics_created * 20 + left.clinic_signup_submits * 8 + left.signup_cta_clicks * 3 + left.signup_page_views + left.whatsapp_cta_clicks
      const rightScore = right.clinics_created * 20 + right.clinic_signup_submits * 8 + right.signup_cta_clicks * 3 + right.signup_page_views + right.whatsapp_cta_clicks
      return rightScore - leftScore
    })
    .slice(0, 10)

  return {
    since_7d: since7d.toISOString(),
    since_30d: since30d.toISOString(),
    page_views_7d: pageViews7d,
    login_page_views_7d: loginPageViews7d,
    signup_page_views_7d: signupPageViews7d,
    login_cta_clicks_7d: loginCtaClicks7d,
    signup_cta_clicks_7d: signupCtaClicks7d,
    whatsapp_cta_clicks_7d: whatsappCtaClicks7d,
    clinic_signup_submits_7d: clinicSignupSubmits7d,
    clinic_signup_submits_30d: clinicSignupSubmits30d,
    top_pages_30d: topPages,
    signup_landings_30d: signupLandings,
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const guard = assertAdmin(req)
  if (guard !== true) return guard

  const url      = new URL(req.url)
  const pathname = url.pathname.replace(/^\/admin-stats/, '') || '/'

  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ── GET /clinics ──────────────────────────────────────────────────────────
  if (req.method === 'GET' && pathname === '/clinics') {
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const [clinicsResult, patientsResult, appointmentsResult] = await Promise.all([
      client
        .from('clinics')
        .select('id, name, subscription_tier, subscription_status, payments_enabled, trial_ends_at, created_at, asaas_subscription_id')
        .order('created_at', { ascending: false }),
      client
        .from('patients')
        .select('clinic_id')
        .gte('created_at', since30d),
      client
        .from('appointments')
        .select('clinic_id')
        .gte('starts_at', since30d),
    ])

    if (clinicsResult.error) return err(clinicsResult.error.message, 500)

    // Aggregate counts by clinic_id
    const patients30d: Record<string, number> = {}
    for (const row of (patientsResult.data ?? [])) {
      patients30d[row.clinic_id] = (patients30d[row.clinic_id] ?? 0) + 1
    }
    const appointments30d: Record<string, number> = {}
    for (const row of (appointmentsResult.data ?? [])) {
      appointments30d[row.clinic_id] = (appointments30d[row.clinic_id] ?? 0) + 1
    }

    const clinics = (clinicsResult.data ?? []).map((c: ClinicRow) => ({
      ...c,
      patients_30d:     patients30d[c.id] ?? 0,
      appointments_30d: appointments30d[c.id] ?? 0,
    }))

    return json(clinics)
  }

  // ── PATCH /clinics/:id ────────────────────────────────────────────────────
  const patchMatch = pathname.match(/^\/clinics\/([^/]+)$/)
  if (req.method === 'PATCH' && patchMatch) {
    const clinicId = patchMatch[1]
    const body = await req.json().catch(() => null)
    const action = body?.action as string | undefined
    const tier = body?.tier as string | undefined

    const { data: clinic, error: clinicError } = await client
      .from('clinics')
      .select('asaas_subscription_id')
      .eq('id', clinicId)
      .single<ClinicManageRow>()

    if (clinicError) return err(clinicError.message, 500)

    if (action === 'revoke_manual') {
      if (clinic?.asaas_subscription_id) {
        return err('Nao e possivel revogar uma assinatura paga por aqui. Cancele via Asaas/app.', 400)
      }

      const { error } = await client
        .from('clinics')
        .update({
          subscription_tier: 'trial',
          subscription_status: 'INACTIVE',
          payments_enabled: false,
        })
        .eq('id', clinicId)

      if (error) return err(error.message, 500)
      return json({ ok: true })
    }

    if (!tier || !(VALID_TIERS as readonly string[]).includes(tier)) {
      return err(`tier must be one of: ${VALID_TIERS.join(', ')}`, 400)
    }

    const update: Record<string, unknown> = { subscription_tier: tier as SubscriptionTier }

    if (tier === 'trial') {
      if (clinic?.asaas_subscription_id) {
        return err('Nao e possivel alterar assinatura paga para trial por aqui. Cancele via Asaas/app.', 400)
      }

      update.subscription_status = 'INACTIVE'
      update.payments_enabled    = false
    } else {
      update.subscription_status = 'ACTIVE'
      update.payments_enabled    = true
    }

    const { error } = await client.from('clinics').update(update).eq('id', clinicId)
    if (error) return err(error.message, 500)
    return json({ ok: true })
  }

  // ── GET / (stats) ─────────────────────────────────────────────────────────
  if (req.method !== 'GET') return err('Method not allowed', 405)

  const [clinicsResult, usersResult, recentClinicsResult, publicAnalyticsResult, pendingSignupsResult, trialsResult] = await Promise.all([
    // Clínicas por status de assinatura
    client
      .from('clinics')
      .select('id, name, subscription_status, subscription_tier, payments_enabled, trial_ends_at, created_at, asaas_subscription_id'),

    // Total de usuários (user_profiles)
    client
      .from('user_profiles')
      .select('id', { count: 'exact', head: true }),

    // Últimas 5 clínicas criadas
    client
      .from('clinics')
      .select('id, name, subscription_status, created_at')
      .order('created_at', { ascending: false })
      .limit(5),

    listPublicAnalytics(client),

    // Solicitações de cadastro pendentes
    client
      .from('clinic_signup_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),

    // Trials expirando nos próximos 7 dias
    client
      .from('clinics')
      .select('id', { count: 'exact', head: true })
      .eq('subscription_tier', 'trial')
      .gte('trial_ends_at', new Date().toISOString())
      .lte('trial_ends_at', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()),
  ])

  if (clinicsResult.error) return err(clinicsResult.error.message, 500)
  if (usersResult.error)   return err(usersResult.error.message, 500)

  const clinics    = (clinicsResult.data ?? []) as ClinicRow[]
  const totalUsers = usersResult.count ?? 0

  const totalClinics     = clinics.length
  const activeClinics    = clinics.filter((c) => c.subscription_status === 'ACTIVE').length
  const overdueClinics   = clinics.filter((c) => c.subscription_status === 'OVERDUE').length
  const manualActiveClinics = clinics.filter(
    (c) => c.subscription_status === 'ACTIVE' && !c.asaas_subscription_id
  ).length
  const mrrCentavos      = clinics.reduce((sum, c) => {
    if (c.subscription_status !== 'ACTIVE' || !c.asaas_subscription_id) return sum
    return sum + (MRR_BY_TIER[c.subscription_tier ?? ''] ?? 0)
  }, 0)
  const pendingSignups   = pendingSignupsResult.count ?? 0
  const trialsExpiring7d = trialsResult.count ?? 0

  return json({
    clinics: {
      total:   totalClinics,
      active:  activeClinics,
      overdue: overdueClinics,
      manual:  manualActiveClinics,
      recent:  recentClinicsResult.data ?? [],
    },
    users:              { total: totalUsers },
    public_analytics:   publicAnalyticsResult,
    mrr_centavos:       mrrCentavos,
    pending_signups:    pendingSignups,
    trials_expiring_7d: trialsExpiring7d,
  })
})
