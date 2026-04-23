/**
 * Edge Function: submit-clinic-signup
 *
 * Public endpoint (verify_jwt = false). Creates the clinic + auth user
 * immediately — no approval step, no email gate before first access.
 *
 * POST /submit-clinic-signup
 *   body: { clinicName, responsibleName, email, password, cnpj?, phone?, message?, isSoloPractitioner? }
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

const ATTRIBUTION_KEYS = [
  'utmSource',
  'utmMedium',
  'utmCampaign',
  'utmContent',
  'utmTerm',
  'gclid',
  'gbraid',
  'wbraid',
  'fbclid',
  'msclkid',
  'ttclid',
  'landingPath',
  'landingSearch',
  'landingReferrer',
  'pagePath',
  'pageSearch',
  'persona',
] as const

function sanitizeText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.slice(0, maxLength)
}

function sanitizeAttribution(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  const input = value as Record<string, unknown>
  const output: Record<string, string> = {}

  for (const key of ATTRIBUTION_KEYS) {
    const cleaned = sanitizeText(input[key], key.endsWith('Search') || key.endsWith('Referrer') ? 512 : 255)
    if (cleaned) output[key] = cleaned
  }

  return output
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function accountExistsResponse() {
  return json({
    error: 'Este e-mail já possui uma conta. Entre com sua senha para continuar.',
    code: 'ACCOUNT_EXISTS',
  }, 409)
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
    password: string
    cnpj?: string
    phone?: string
    message?: string
    isSoloPractitioner?: boolean
    attribution?: Record<string, unknown>
  }

  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const { clinicName, responsibleName, email, password } = body
  const signupAttribution = sanitizeAttribution(body.attribution)
  if (!clinicName?.trim() || !responsibleName?.trim() || !email?.trim() || !password?.trim()) {
    return json({ error: 'clinicName, responsibleName, email e password são obrigatórios' }, 400)
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'E-mail inválido' }, 400)
  }
  if (password.trim().length < 8) {
    return json({ error: 'A senha deve ter pelo menos 8 caracteres.' }, 400)
  }

  const cleanEmail = email.trim().toLowerCase()
  const cleanPassword = password.trim()

  const { data: existingUserId, error: existingUserError } = await admin.rpc('get_user_id_by_email', {
    p_email: cleanEmail,
  })

  if (existingUserError) {
    console.error('Existing user lookup error:', existingUserError)
    return json({ error: 'Erro ao validar acesso existente. Tente novamente.' }, 500)
  }

  if (existingUserId) {
    return accountExistsResponse()
  }

  // ─── 0. Create auth user first to block duplicate clinics on double-submit ──
  const { data: createdUserData, error: createUserError } = await admin.auth.admin.createUser({
    email: cleanEmail,
    password: cleanPassword,
    email_confirm: true,
    user_metadata: { name: responsibleName.trim() },
  })

  if (createUserError || !createdUserData.user) {
    const duplicateEmail = /already|registered|exists|duplicate/i.test(createUserError?.message ?? '')
    if (duplicateEmail) {
      return accountExistsResponse()
    }
    console.error('User creation error:', createUserError)
    return json({ error: 'Erro ao criar acesso. Tente novamente.' }, 500)
  }

  const userId = createdUserData.user.id

  const [{ data: existingProfile }, { data: existingOwnedClinic, error: existingOwnedClinicError }] = await Promise.all([
    admin
      .from('user_profiles')
      .select('clinic_id')
      .eq('id', userId)
      .maybeSingle(),
    admin
      .from('clinics')
      .select('id')
      .eq('owner_user_id', userId)
      .maybeSingle(),
  ])

  if (existingOwnedClinicError) {
    console.error('Existing clinic lookup error:', existingOwnedClinicError)
    return json({ error: 'Erro ao validar clínica existente. Tente novamente.' }, 500)
  }

  if (existingProfile?.clinic_id || existingOwnedClinic?.id) {
    return accountExistsResponse()
  }

  // ─── 1. Create clinic ──────────────────────────────────────────────────────
  const { data: clinic, error: clinicError } = await admin
    .from('clinics')
    .insert({
      name:               clinicName.trim(),
      cnpj:               body.cnpj?.trim()  || null,
      phone:              body.phone?.trim() || null,
      email:              cleanEmail,
      owner_user_id: userId,
      signup_attribution: signupAttribution,
    })
    .select('id')
    .single()

  if (clinicError || !clinic) {
    const duplicateClinic = clinicError?.code === '23505' || /owner_user_id/i.test(clinicError?.message ?? '')
    if (duplicateClinic) {
      return accountExistsResponse()
    }
    console.error('Clinic creation error:', clinicError)
    try {
      await admin.auth.admin.deleteUser(userId)
    } catch (rollbackError) {
      console.error('User rollback failed after clinic error:', rollbackError)
    }
    return json({ error: 'Erro ao criar clínica. Tente novamente.' }, 500)
  }

  const clinicId = (clinic as { id: string }).id

  // ─── 2. Create user_profile as clinic admin ────────────────────────────────
  const { error: profileError } = await admin.from('user_profiles').upsert({
    id:             userId,
    name:           responsibleName.trim(),
    roles:          ['admin'],
    clinic_id:      clinicId,
    is_super_admin: false,
  })

  if (profileError) {
    console.error('Profile upsert error:', profileError)
    try {
      await admin.from('clinics').delete().eq('id', clinicId)
    } catch (clinicRollbackError) {
      console.error('Clinic rollback failed after profile error:', clinicRollbackError)
    }
    try {
      await admin.auth.admin.deleteUser(userId)
    } catch (userRollbackError) {
      console.error('User rollback failed after profile error:', userRollbackError)
    }
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
