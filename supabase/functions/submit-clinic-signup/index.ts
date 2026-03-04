/**
 * Edge Function: submit-clinic-signup
 *
 * Public endpoint (verify_jwt = false) that accepts a clinic signup form
 * submission, inserts it into clinic_signup_requests using the service role
 * (bypassing RLS entirely — no anon INSERT policy needed), and sends a
 * Telegram notification to Pedro.
 *
 * POST /submit-clinic-signup
 *   body: { clinicName, responsibleName, email, cnpj?, phone?, message? }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TELEGRAM_BOT_TOKEN        = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const TELEGRAM_PEDRO_CHAT_ID    = Deno.env.get('TELEGRAM_PEDRO_CHAT_ID')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: {
    clinicName: string
    responsibleName: string
    email: string
    cnpj?: string
    phone?: string
    message?: string
  }

  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const { clinicName, responsibleName, email } = body
  if (!clinicName?.trim() || !responsibleName?.trim() || !email?.trim()) {
    return json({ error: 'clinicName, responsibleName e email são obrigatórios' }, 400)
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'E-mail inválido' }, 400)
  }

  // ─── Insert via service role (no RLS) ──────────────────────────────────────
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const { error: insertError } = await admin
    .from('clinic_signup_requests')
    .insert({
      name:             clinicName.trim(),
      cnpj:             body.cnpj?.trim()             || null,
      phone:            body.phone?.trim()             || null,
      email:            email.trim().toLowerCase(),
      responsible_name: responsibleName.trim(),
      message:          body.message?.trim()           || null,
    })

  if (insertError) {
    console.error('Insert error:', insertError)
    return json({ error: 'Erro ao registrar solicitação. Tente novamente.' }, 500)
  }

  // ─── Telegram notification (best-effort) ───────────────────────────────────
  if (TELEGRAM_BOT_TOKEN && TELEGRAM_PEDRO_CHAT_ID) {
    try {
      const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
      const text = [
        '🏥 *Nova solicitação de clínica*',
        '',
        `*Clínica:* ${clinicName}`,
        `*Responsável:* ${responsibleName}`,
        `*E-mail:* ${email}`,
        body.phone   ? `*Telefone:* ${body.phone}`   : null,
        body.message ? `*Mensagem:* ${body.message}` : null,
        '',
        `_Recebido em ${now}_`,
        '',
        `👉 Acesse /admin → Aprovações para revisar`,
      ].filter(line => line !== null).join('\n')

      await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id:    TELEGRAM_PEDRO_CHAT_ID,
            text,
            parse_mode: 'Markdown',
          }),
        },
      )
    } catch (e) {
      console.error('Telegram notification failed (non-fatal):', e)
    }
  }

  return json({ ok: true })
})
