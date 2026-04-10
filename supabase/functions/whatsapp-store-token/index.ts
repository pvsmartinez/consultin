/**
 * Edge Function: whatsapp-store-token
 *
 * Stores a clinic's WhatsApp permanent access token in Supabase Vault.
 * Called from the frontend onboarding flow with the clinic admin's JWT.
 *
 * Access control: verifies that the calling user belongs to the target clinic
 * and has admin role before touching Vault.
 *
 * Body: { clinicId: string, token: string }
 */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  // ── Parse calling user JWT ────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? ''
  const userJwt    = authHeader.replace('Bearer ', '')

  if (!userJwt) return jsonError('Unauthorized', 401)

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: { clinicId?: string; token?: string }
  try { body = await req.json() }
  catch { return jsonError('Invalid JSON', 400) }

  const { clinicId, token } = body
  if (!clinicId || !token) return jsonError('Missing clinicId or token', 400)
  if (token.length < 20)   return jsonError('Token appears invalid (too short)', 422)

  // ── Verify user belongs to this clinic with admin role ──────────────────
  const userSupabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${userJwt}` } },
  })

  const { data: { user }, error: authErr } = await userSupabase.auth.getUser()
  if (authErr || !user) return jsonError('Unauthorized', 401)

  const serviceSupabase = createClient(SUPABASE_URL, SUPABASE_SRK)

  const { data: profile } = await serviceSupabase
    .from('user_profiles')
    .select('clinic_id, roles')
    .eq('id', user.id)
    .single()

  if (!profile)                       return jsonError('User profile not found', 403)
  if (profile.clinic_id !== clinicId) return jsonError('Forbidden — wrong clinic', 403)
  if (!(profile.roles ?? []).includes('admin')) return jsonError('Forbidden — admin role required', 403)

  // ── Store token in Vault via the SECURITY DEFINER function ───────────────
  const { error: vaultErr } = await serviceSupabase
    .rpc('store_clinic_whatsapp_token', {
      p_clinic_id: clinicId,
      p_token:     token,
    })

  if (vaultErr) {
    console.error('[store-token] Vault error:', vaultErr)
    return jsonError('Failed to store token in Vault', 500)
  }

  // ── Mark whatsapp_enabled = true once token is stored ─────────────────────
  await serviceSupabase
    .from('clinics')
    .update({ whatsapp_enabled: true })
    .eq('id', clinicId)

  return json({ success: true })
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function jsonError(message: string, status: number) {
  return json({ error: message }, status)
}
