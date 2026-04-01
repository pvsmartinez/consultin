/**
 * Edge Function: whatsapp-embedded-signup
 *
 * Completes the Meta Embedded Signup OAuth flow for WhatsApp.
 * Called by the clinic admin after authorizing via the Meta popup in the frontend.
 *
 * Flow:
 *   1. Verify calling user is admin of this clinic
 *   2. Exchange short-lived code → short-lived user access token
 *   3. Exchange short-lived token → long-lived token (~60 days)
 *   4. Fetch phone number display name from Graph API
 *   5. Store token via store_clinic_whatsapp_token RPC (same as manual flow)
 *   6. Update clinic: waba_id, phone_number_id, phone_display, whatsapp_enabled = true
 *
 * Env secrets required:
 *   META_APP_ID     — Consultin's Meta App ID (add via `supabase secrets set META_APP_ID=...`)
 *   META_APP_SECRET — already set (used by whatsapp-webhook)
 *
 * Body: {
 *   clinicId:      string  — clinic UUID
 *   code:          string  — exchange token from FB.login() with response_type=code
 *   wabaId:        string  — WABA ID from WA_EMBEDDED_SIGNUP window message event
 *   phoneNumberId: string  — phone number ID from WA_EMBEDDED_SIGNUP window message event
 * }
 */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL    = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SRK    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const META_APP_ID     = Deno.env.get('META_APP_ID') ?? ''
const META_APP_SECRET = Deno.env.get('META_APP_SECRET') ?? ''

const GRAPH_BASE = 'https://graph.facebook.com/v21.0'

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  const origin = req.headers.get('Origin') ?? '*'
  const corsHeaders = {
    'Access-Control-Allow-Origin':  origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  if (!META_APP_ID || !META_APP_SECRET) {
    console.error('[embedded-signup] META_APP_ID or META_APP_SECRET not configured')
    return jsonError('WhatsApp Embedded Signup não configurado no servidor', 500, corsHeaders)
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: { clinicId?: string; code?: string; wabaId?: string; phoneNumberId?: string }
  try { body = await req.json() }
  catch { return jsonError('JSON inválido', 400, corsHeaders) }

  const { clinicId, code, wabaId, phoneNumberId } = body
  if (!clinicId || !code || !wabaId || !phoneNumberId) {
    return jsonError('Campos obrigatórios ausentes: clinicId, code, wabaId, phoneNumberId', 400, corsHeaders)
  }

  // ── Verify user is admin of this clinic ────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? ''
  const userJwt    = authHeader.replace('Bearer ', '')
  if (!userJwt) return jsonError('Não autorizado', 401, corsHeaders)

  const serviceSupabase = createClient(SUPABASE_URL, SUPABASE_SRK)
  const userSupabase    = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${userJwt}` } },
  })

  const { data: { user }, error: authErr } = await userSupabase.auth.getUser()
  if (authErr || !user) return jsonError('Não autorizado', 401, corsHeaders)

  const { data: profile } = await serviceSupabase
    .from('user_profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()

  if (!profile)                       return jsonError('Perfil de usuário não encontrado', 403, corsHeaders)
  if (profile.clinic_id !== clinicId) return jsonError('Acesso negado — clínica inválida', 403, corsHeaders)
  if (profile.role !== 'admin')       return jsonError('Apenas administradores podem conectar o WhatsApp', 403, corsHeaders)

  // ── Exchange code → short-lived user access token ─────────────────────────
  const tokenRes = await fetch(
    `${GRAPH_BASE}/oauth/access_token` +
    `?client_id=${encodeURIComponent(META_APP_ID)}` +
    `&client_secret=${encodeURIComponent(META_APP_SECRET)}` +
    `&code=${encodeURIComponent(code)}`,
  )

  if (!tokenRes.ok) {
    const err = await tokenRes.json().catch(() => ({})) as { error?: { message?: string } }
    console.error('[embedded-signup] token exchange failed:', err)
    return jsonError(
      `Falha na autenticação Meta: ${err.error?.message ?? 'código inválido ou expirado'}`,
      400,
      corsHeaders,
    )
  }

  const { access_token: shortToken } = await tokenRes.json() as { access_token: string }

  // ── Exchange short-lived → long-lived token (~60 days) ─────────────────────
  let longToken = shortToken
  const longTokenRes = await fetch(
    `${GRAPH_BASE}/oauth/access_token` +
    `?grant_type=fb_exchange_token` +
    `&client_id=${encodeURIComponent(META_APP_ID)}` +
    `&client_secret=${encodeURIComponent(META_APP_SECRET)}` +
    `&fb_exchange_token=${encodeURIComponent(shortToken)}`,
  )

  if (longTokenRes.ok) {
    const lt = await longTokenRes.json() as { access_token?: string }
    if (lt.access_token) longToken = lt.access_token
  } else {
    console.warn('[embedded-signup] long-lived token exchange failed, using short-lived token')
  }

  // ── Fetch phone number display name from Graph API ─────────────────────────
  let phoneDisplay: string | null = null
  const phoneRes = await fetch(
    `${GRAPH_BASE}/${encodeURIComponent(phoneNumberId)}` +
    `?fields=display_phone_number,verified_name` +
    `&access_token=${encodeURIComponent(longToken)}`,
  )

  if (phoneRes.ok) {
    const pd = await phoneRes.json() as { display_phone_number?: string; verified_name?: string }
    if (pd.display_phone_number) {
      phoneDisplay = pd.verified_name
        ? `${pd.display_phone_number} · ${pd.verified_name}`
        : pd.display_phone_number
    }
  } else {
    console.warn('[embedded-signup] could not fetch phone display name')
  }

  // ── Store token via SECURITY DEFINER function ─────────────────────────────
  const { error: vaultErr } = await serviceSupabase
    .rpc('store_clinic_whatsapp_token', {
      p_clinic_id: clinicId,
      p_token:     longToken,
    })

  if (vaultErr) {
    console.error('[embedded-signup] token storage failed:', vaultErr)
    return jsonError('Falha ao salvar token de acesso', 500, corsHeaders)
  }

  // ── Update clinic with connection data ────────────────────────────────────
  const { error: updateErr } = await serviceSupabase
    .from('clinics')
    .update({
      whatsapp_enabled:         true,
      whatsapp_waba_id:         wabaId,
      whatsapp_phone_number_id: phoneNumberId,
      whatsapp_phone_display:   phoneDisplay,
    })
    .eq('id', clinicId)

  if (updateErr) {
    console.error('[embedded-signup] clinic update failed:', updateErr)
    return jsonError('Falha ao atualizar dados da clínica', 500, corsHeaders)
  }

  return json({ success: true, phoneDisplay }, 200, corsHeaders)
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function jsonError(message: string, status: number, headers: Record<string, string> = {}) {
  return json({ error: message }, status, headers)
}
