/**
 * Edge Function: submit-clinic-signup
 *
 * Public endpoint (verify_jwt = false). Creates the clinic + invites the user
 * immediately — no approval step, no signup request table.
 *
 * POST /submit-clinic-signup
 *   body: { clinicName, responsibleName, email, cnpj?, phone?, message?, isSoloPractitioner? }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TELEGRAM_BOT_TOKEN        = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const TELEGRAM_PEDRO_CHAT_ID    = Deno.env.get('TELEGRAM_PEDRO_CHAT_ID')!
const SITE_URL                  = Deno.env.get('SITE_URL') ?? 'https://app.consultin.com.br'

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

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  let body: {
    clinicName: string
    responsibleName: string
    email: string
    cnpj?: string
    phone?: string
    message?: string
    isSoloPractitioner?: boolean
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

  const cleanEmail = email.trim().toLowerCase()

  // ─── 1. Create clinic ──────────────────────────────────────────────────────
  const { data: clinic, error: clinicError } = await admin
    .from('clinics')
    .insert({
      name:  clinicName.trim(),
      cnpj:  body.cnpj?.trim()  || null,
      phone: body.phone?.trim() || null,
      email: cleanEmail,
    })
    .select('id')
    .single()

  if (clinicError || !clinic) {
    console.error('Clinic creation error:', clinicError)
    return json({ error: 'Erro ao criar clínica. Tente novamente.' }, 500)
  }

  const clinicId = (clinic as { id: string }).id

  // ─── 2. Invite user by email (Supabase sends the invite email) ────────────
  let userId: string
  const { data: inviteResult, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    cleanEmail,
    {
      data: { name: responsibleName.trim() },
      redirectTo: `${SITE_URL}/nova-senha`,
    },
  )

  if (inviteError) {
    // User already exists — link them to the new clinic
    const { data: { users: allUsers } } = await admin.auth.admin.listUsers({ perPage: 1000 })
    const existing = allUsers?.find(u => u.email === cleanEmail)
    if (!existing) {
      console.error('Invite error:', inviteError)
      return json({ error: 'Erro ao criar acesso. Tente novamente.' }, 500)
    }
    userId = existing.id
  } else {
    if (!inviteResult?.user) return json({ error: 'Erro ao criar acesso.' }, 500)
    userId = inviteResult.user.id
  }

  // ─── 3. Create user_profile as clinic admin ────────────────────────────────
  const { error: profileError } = await admin.from('user_profiles').upsert({
    id:             userId,
    name:           responsibleName.trim(),
    roles:          ['admin'],
    clinic_id:      clinicId,
    is_super_admin: false,
  })

  if (profileError) {
    console.error('Profile upsert error:', profileError)
    return json({ error: 'Erro ao configurar perfil. Tente novamente.' }, 500)
  }

  // ─── 4. Telegram notification (best-effort) ────────────────────────────────
  if (TELEGRAM_BOT_TOKEN && TELEGRAM_PEDRO_CHAT_ID) {
    try {
      const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
      const text = [
        '✅ *Novo cadastro de clínica*',
        '',
        `*Clínica:* ${clinicName.trim()}`,
        `*Responsável:* ${responsibleName.trim()}`,
        `*E-mail:* ${cleanEmail}`,
        body.phone   ? `*Telefone:* ${body.phone}`   : null,
        body.message ? `*Mensagem:* ${body.message}` : null,
        '',
        `*Clinic ID:* ${clinicId}`,
        `*User ID:* ${userId}`,
        '',
        `_Cadastrado em ${now}_`,
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

  return json({ ok: true, clinicId, userId })
})
