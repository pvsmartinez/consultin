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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const guard = assertAdmin(req)
  if (guard !== true) return guard

  if (req.method !== 'GET') return err('Method not allowed', 405)

  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const [clinicsResult, usersResult, recentClinicsResult] = await Promise.all([
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
    users:       { total: totalUsers },
    mrr_centavos: mrrCentavos,
  })
})
