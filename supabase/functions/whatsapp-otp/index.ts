/**
 * Edge Function: whatsapp-otp
 *
 * Issues and verifies one-time codes sent to the user's WhatsApp number
 * for passwordless login on the web panel.
 *
 * POST body:
 *   { action: 'send',   email: string }
 *   { action: 'verify', email: string, code: string }
 *
 * send → looks up phone from user_profiles, generates a 6-digit code,
 *         stores it (SHA-256 hashed) in whatsapp_otps, sends via WA.
 *         Returns: { sent: true, maskedPhone: "+55 (11) 9****-5678" }
 *         If no phone found: { sent: false, reason: 'no_phone' }
 *
 * verify → validates the code hash, calls generateLink to get a magic link token,
 *           marks the code as used, returns the token.
 *           Returns: { token: string, email: string }
 *           Frontend then calls supabase.auth.verifyOtp({ email, token, type: 'magiclink' })
 *
 * Rate limiting: max 3 active (unused, unexpired) codes per email at a time.
 *
 * Required env vars (auto-injected):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   PLATFORM_WA_TOKEN, PLATFORM_PHONE_NUMBER_ID
 */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SRK      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PLATFORM_WA_TOKEN = Deno.env.get('PLATFORM_WA_TOKEN') ?? ''
const PLATFORM_PHONE_ID = Deno.env.get('PLATFORM_PHONE_NUMBER_ID') ?? ''

const META_GRAPH_BASE = 'https://graph.facebook.com/v21.0'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')   return new Response('Method not allowed', { status: 405 })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SRK, { auth: { persistSession: false } })

  let body: { action: string; email?: string; code?: string }
  try { body = await req.json() }
  catch { return json({ error: 'bad_request' }, 400) }

  const { action, email, code } = body

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return json({ error: 'invalid_email' }, 400)
  }
  const normalEmail = email.trim().toLowerCase()

  // ── SEND ─────────────────────────────────────────────────────────────────
  if (action === 'send') {
    // 1. Look up the user's phone from user_profiles (join via auth.users)
    const phone = await getPhoneForEmail(supabase, normalEmail)
    if (!phone) {
      return json({ sent: false, reason: 'no_phone' })
    }

    // 2. Rate limit: max 3 active codes per email
    const { count } = await supabase
      .from('whatsapp_otps')
      .select('*', { count: 'exact', head: true })
      .eq('email', normalEmail)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())

    if ((count ?? 0) >= 3) {
      return json({ sent: false, reason: 'rate_limited' }, 429)
    }

    // 3. Generate 6-digit code
    const otp  = String(Math.floor(100000 + Math.random() * 900000))
    const hash = await sha256(otp)

    // 4. Store in DB
    await supabase.from('whatsapp_otps').insert({
      email:     normalEmail,
      phone,
      code_hash: hash,
    })

    // 5. Clean up expired codes (housekeeping)
    await supabase
      .from('whatsapp_otps')
      .delete()
      .lt('expires_at', new Date().toISOString())

    // 6. Send via WhatsApp
    const sent = await sendWA(phone, [
      `🔐 *Consultin — Código de acesso*`,
      ``,
      `Seu código: *${otp}*`,
      ``,
      `Válido por 5 minutos. Não compartilhe com ninguém.`,
    ].join('\n'))

    if (!sent) return json({ error: 'wa_send_failed' }, 502)

    return json({ sent: true, maskedPhone: maskPhone(phone) })
  }

  // ── VERIFY ────────────────────────────────────────────────────────────────
  if (action === 'verify') {
    if (!code || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
      return json({ error: 'invalid_code_format' }, 400)
    }

    const hash = await sha256(code.trim())

    // Find a matching, unexpired, unused code
    const { data: otpRow } = await supabase
      .from('whatsapp_otps')
      .select('id')
      .eq('email',     normalEmail)
      .eq('code_hash', hash)
      .is('used_at',   null)
      .gt('expires_at', new Date().toISOString())
      .limit(1)
      .maybeSingle()

    if (!otpRow) {
      return json({ error: 'invalid_or_expired' }, 401)
    }

    // Mark as used immediately (single-use)
    await supabase
      .from('whatsapp_otps')
      .update({ used_at: new Date().toISOString() })
      .eq('id', otpRow.id)

    // Generate a magic link token for this email
    const linkRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generateLink`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey:          SUPABASE_SRK,
        Authorization:   `Bearer ${SUPABASE_SRK}`,
      },
      body: JSON.stringify({ type: 'magiclink', email: normalEmail }),
    })

    if (!linkRes.ok) {
      console.error('[whatsapp-otp] generateLink error:', await linkRes.text())
      return json({ error: 'token_generation_failed' }, 502)
    }

    const linkData = await linkRes.json()
    // Supabase returns the full action link; extract the token_hash param
    const actionLink: string = linkData?.action_link ?? ''
    const tokenHash = new URL(actionLink).searchParams.get('token') ?? ''

    if (!tokenHash) {
      console.error('[whatsapp-otp] no token in generateLink response', linkData)
      return json({ error: 'token_generation_failed' }, 502)
    }

    return json({ token: tokenHash, email: normalEmail })
  }

  return json({ error: 'unknown_action' }, 400)
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getPhoneForEmail(
  supabase:   ReturnType<typeof createClient>,
  email:      string,
): Promise<string | null> {
  // Look up user id via secure RPC — avoids paginating auth.admin.listUsers()
  // which would miss users beyond the first 1000 and is slow at scale.
  const { data: userId, error: rpcErr } = await supabase
    .rpc('get_user_id_by_email', { p_email: email })
  if (rpcErr) {
    console.error('[whatsapp-otp] get_user_id_by_email error:', rpcErr)
    return null
  }
  if (!userId) return null

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('phone')
    .eq('id', userId)
    .maybeSingle()

  const rawPhone = (profile as { phone?: string } | null)?.phone?.trim()
  if (!rawPhone) return null

  return rawPhone
}

export async function sha256(text: string): Promise<string> {
  const data    = new TextEncoder().encode(text)
  const digest  = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export function maskPhone(phone: string): string {
  // "+5511985390121" → "+55 (11) 9****-0121"
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 8) return phone
  const last4 = digits.slice(-4)
  const prefix = digits.slice(0, -8)
  const area = digits.slice(prefix.length, prefix.length + 2)
  return `+${prefix} (${area}) ****-${last4}`
}

async function sendWA(toPhone: string, text: string): Promise<boolean> {
  if (!PLATFORM_WA_TOKEN || !PLATFORM_PHONE_ID) return false
  const res = await fetch(`${META_GRAPH_BASE}/${PLATFORM_PHONE_ID}/messages`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${PLATFORM_WA_TOKEN}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to:                toPhone,
      type:              'text',
      text:              { body: text, preview_url: false },
    }),
  })
  if (!res.ok) console.error('[whatsapp-otp] WA send error:', await res.text())
  return res.ok
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
