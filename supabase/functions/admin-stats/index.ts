/**
 * Edge Function: admin-stats (Consultin)
 *
 * Expõe estatísticas agregadas do produto para o admin.pmatz.com.
 * Não substitui nem altera o admin-users — é somente leitura de stats.
 *
 * Rotas:
 *   GET /  → stats globais de clínicas e assinaturas
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
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

interface PublicSiteEventRow {
  created_at: string
  event_name: string
  page_path: string
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

const MRR_PER_ACTIVE_CLINIC = 10000 // R$100,00 em centavos

async function listPublicAnalytics(client: ReturnType<typeof createClient>): Promise<{
  since_7d: string
  since_30d: string
  page_views_7d: number
  login_page_views_7d: number
  signup_page_views_7d: number
  login_cta_clicks_7d: number
  signup_cta_clicks_7d: number
  clinic_signup_submits_30d: number
  top_pages_30d: Array<{ path: string; views: number }>
}> {
  const now = Date.now()
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000)
  const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000)

  const { data, error } = await client
    .from('public_site_events')
    .select('created_at, event_name, page_path')
    .gte('created_at', since30d.toISOString())
    .order('created_at', { ascending: false })
    .limit(5000)

  if (error) throw new Error(error.message)

  const rows = (data ?? []) as PublicSiteEventRow[]
  const pageCounts = new Map<string, number>()

  let pageViews7d = 0
  let loginPageViews7d = 0
  let signupPageViews7d = 0
  let loginCtaClicks7d = 0
  let signupCtaClicks7d = 0
  let clinicSignupSubmits30d = 0

  for (const row of rows) {
    const createdAt = new Date(row.created_at).getTime()
    const in7d = createdAt >= since7d.getTime()

    if (row.event_name === 'page_view') {
      pageCounts.set(row.page_path, (pageCounts.get(row.page_path) ?? 0) + 1)

      if (in7d) {
        pageViews7d += 1
        if (row.page_path === '/login') loginPageViews7d += 1
        if (row.page_path === '/cadastro-clinica') signupPageViews7d += 1
      }
    }

    if (row.event_name === 'login_cta_click' && in7d) loginCtaClicks7d += 1
    if (row.event_name === 'signup_cta_click' && in7d) signupCtaClicks7d += 1
    if (row.event_name === 'clinic_signup_submit') clinicSignupSubmits30d += 1
  }

  const topPages = Array.from(pageCounts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([path, views]) => ({ path, views }))

  return {
    since_7d: since7d.toISOString(),
    since_30d: since30d.toISOString(),
    page_views_7d: pageViews7d,
    login_page_views_7d: loginPageViews7d,
    signup_page_views_7d: signupPageViews7d,
    login_cta_clicks_7d: loginCtaClicks7d,
    signup_cta_clicks_7d: signupCtaClicks7d,
    clinic_signup_submits_30d: clinicSignupSubmits30d,
    top_pages_30d: topPages,
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const guard = assertAdmin(req)
  if (guard !== true) return guard

  if (req.method !== 'GET') return err('Method not allowed', 405)

  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const [clinicsResult, usersResult, recentClinicsResult, publicAnalyticsResult] = await Promise.all([
    // Clínicas por status de assinatura
    client
      .from('clinics')
      .select('id, name, subscription_status, payments_enabled, created_at'),

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
  ])

  if (clinicsResult.error) return err(clinicsResult.error.message, 500)
  if (usersResult.error)   return err(usersResult.error.message, 500)

  const clinics    = clinicsResult.data ?? []
  const totalUsers = usersResult.count ?? 0

  const totalClinics   = clinics.length
  const activeClinics  = clinics.filter((c) => c.subscription_status === 'ACTIVE').length
  const overdueClinics = clinics.filter((c) => c.subscription_status === 'OVERDUE').length
  const mrrCentavos    = activeClinics * MRR_PER_ACTIVE_CLINIC

  return json({
    clinics: {
      total:   totalClinics,
      active:  activeClinics,
      overdue: overdueClinics,
      recent:  recentClinicsResult.data ?? [],
    },
    users:            { total: totalUsers },
    public_analytics: publicAnalyticsResult,
    mrr_centavos: mrrCentavos,
  })
})
