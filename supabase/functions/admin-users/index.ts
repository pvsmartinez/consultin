/**
 * Edge Function: admin-users
 *
 * Gerencia usuários do Auth (criação, listagem, deleção, reset de senha).
 * Requer service_role key — apenas super admins têm acesso.
 *
 * Rotas:
 *   GET    /           → lista todos os usuários (auth + perfil)
 *   POST   /create     → cria auth user + user_profile
 *   POST   /invite     → envia invite por e-mail + cria user_profile
 *   DELETE /:id        → remove auth user + user_profile
 *   PATCH  /:id/password → reseta senha do usuário
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL               = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY          = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TELEGRAM_BOT_TOKEN         = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''
const TELEGRAM_PEDRO_CHAT_ID     = Deno.env.get('TELEGRAM_PEDRO_CHAT_ID') ?? ''
// URL canônica do frontend — configurar via `supabase secrets set SITE_URL=https://seu-app.vercel.app`
const DEFAULT_SITE_URL = 'https://consultin.pmatz.com'
const SITE_URL = Deno.env.get('SITE_URL')?.trim() || DEFAULT_SITE_URL

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
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

async function notifyPedro(lines: Array<string | null>) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_PEDRO_CHAT_ID) return
  const text = lines.filter(Boolean).join('\n')
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_PEDRO_CHAT_ID,
        text,
        parse_mode: 'Markdown',
      }),
    })
  } catch (error) {
    console.error('Telegram notification failed (non-fatal):', error)
  }
}

// ─── Auth check ───────────────────────────────────────────────────────────────
async function assertSuperAdmin(req: Request): Promise<{ adminClient: ReturnType<typeof createClient>; callerUid: string } | Response> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return err('Missing Authorization header', 401)

  // Use user-scoped client (recommended pattern for edge functions)
  // Passes JWT via global header so getUser() validates it server-side
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: { user }, error } = await userClient.auth.getUser()
  if (error || !user) return err('Unauthorized', 401)

  // Read profile with service role to bypass RLS
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: profile } = await serviceClient
    .from('user_profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_super_admin) return err('Forbidden: super admin only', 403)

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  return { adminClient, callerUid: user.id }
}

// ─── Handler ──────────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const url     = new URL(req.url)
  // Strip everything up to and including '/admin-users/' to get the sub-path.
  // Works whether Supabase passes the full URL (/functions/v1/admin-users/...)
  // or a stripped URL (/admin-users/...).
  const parts   = url.pathname.replace(/^.*\/admin-users\/?/, '').split('/').filter(Boolean)
  const auth    = await assertSuperAdmin(req)
  if (auth instanceof Response) return auth
  const { adminClient, callerUid } = auth

  // ── GET / → list users ──────────────────────────────────────────────────────
  if (req.method === 'GET' && parts.length === 0) {
    const { data: { users }, error: e1 } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
    if (e1) return err(e1.message, 500)

    const { data: profiles, error: e2 } = await adminClient
      .from('user_profiles')
      .select('id, name, roles, clinic_id, is_super_admin')
    if (e2) return err(e2.message, 500)

    const { data: clinics } = await adminClient
      .from('clinics')
      .select('id, name')
    const clinicMap: Record<string, string> = Object.fromEntries(
      (clinics ?? []).map(c => [c.id as string, c.name as string])
    )

    const profileMap: Record<string, typeof profiles[0]> = Object.fromEntries(
      (profiles ?? []).map(p => [p.id as string, p])
    )

    const rows = users.map(u => {
      const p = profileMap[u.id]
      return {
        id:          u.id,
        email:       u.email ?? '',
        createdAt:   u.created_at,
        lastSignIn:  u.last_sign_in_at ?? null,
        confirmed:   !!u.email_confirmed_at,
        name:        p?.name ?? null,
        roles:       p?.roles ?? null,
        clinicId:    p?.clinic_id ?? null,
        clinicName:  p?.clinic_id ? (clinicMap[p.clinic_id as string] ?? 'Desconhecida') : null,
        isSuperAdmin: (p?.is_super_admin as boolean) ?? false,
        hasProfile:  !!p,
      }
    })

    return json(rows)
  }

  // ── POST /create → cria usuário com senha ────────────────────────────────────
  if (req.method === 'POST' && parts[0] === 'create') {
    const body = await req.json() as {
      email: string
      password: string
      name: string
      role: string
      clinicId: string | null
      isSuperAdmin: boolean
    }

    if (!body.email || !body.password || !body.name) {
      return err('email, password e name são obrigatórios')
    }

    const { data: { user }, error: e1 } = await adminClient.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
    })
    if (e1 || !user) return err(e1?.message ?? 'Erro ao criar usuário', 500)

    const { error: e2 } = await adminClient.from('user_profiles').insert({
      id:            user.id,
      name:          body.name,
      roles:          body.role ? [body.role] : ['admin'],
      clinic_id:     body.clinicId || null,
      is_super_admin: body.isSuperAdmin ?? false,
    })
    if (e2) {
      // Rollback: remove auth user
      await adminClient.auth.admin.deleteUser(user.id)
      return err(e2.message, 500)
    }

    return json({ id: user.id, email: user.email })
  }

  // ── POST /invite → envia invite por e-mail ───────────────────────────────────
  if (req.method === 'POST' && parts[0] === 'invite') {
    const body = await req.json() as {
      email: string
      name: string
      role: string
      clinicId: string | null
      isSuperAdmin: boolean
    }

    if (!body.email || !body.name) return err('email e name são obrigatórios')

    // inviteUserByEmail fails if the email is already confirmed;
    // in that case, look up the existing user instead.
    let userId: string
    const { data: inviteData, error: e1 } = await adminClient.auth.admin.inviteUserByEmail(
      body.email,
      SITE_URL ? { redirectTo: `${SITE_URL}/nova-senha` } : undefined,
    )
    if (e1) {
      // User might already exist — look them up
      const { data: { users } } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
      const existing = users?.find(u => u.email === body.email)
      if (!existing) return err(e1.message ?? 'Erro ao convidar usuário', 500)
      userId = existing.id
    } else {
      if (!inviteData?.user) return err('Erro ao convidar usuário', 500)
      userId = inviteData.user.id
    }

    const { error: e2 } = await adminClient.from('user_profiles').upsert({
      id:            userId,
      name:          body.name,
      roles:          body.role ? [body.role] : ['admin'],
      clinic_id:     body.clinicId || null,
      is_super_admin: body.isSuperAdmin ?? false,
    })
    if (e2) return err(e2.message, 500)

    return json({ id: userId, email: body.email })
  }

  // ── POST /resend-invite → reenvia e-mail de convite ──────────────────────────
  if (req.method === 'POST' && parts[0] === 'resend-invite') {
    const { userId } = await req.json() as { userId: string }
    if (!userId) return err('userId obrigatório')

    // Fetch the user's email
    const { data: { user: targetUser }, error: e0 } = await adminClient.auth.admin.getUserById(userId)
    if (e0 || !targetUser?.email) return err(e0?.message ?? 'Usuário não encontrado', 404)
    if (targetUser.email_confirmed_at) return err('Usuário já confirmou o e-mail', 400)

    // Re-invite sends a new magic link / confirmation email
    const { error: e1 } = await adminClient.auth.admin.inviteUserByEmail(
      targetUser.email,
      SITE_URL ? { redirectTo: `${SITE_URL}/nova-senha` } : undefined,
    )
    if (e1) return err(e1.message, 500)

    return json({ resent: userId })
  }

  // ── DELETE /:id → remove usuário ─────────────────────────────────────────────
  if (req.method === 'DELETE' && parts[0]) {
    const userId = parts[0]

    // Remove profile first (FK)
    await adminClient.from('user_profiles').delete().eq('id', userId)

    const { error } = await adminClient.auth.admin.deleteUser(userId)
    if (error) return err(error.message, 500)

    return json({ deleted: userId })
  }

  // ── PATCH /:id/password → reseta senha ───────────────────────────────────────
  if (req.method === 'PATCH' && parts[0] && parts[1] === 'password') {
    const userId = parts[0]
    const { password } = await req.json() as { password: string }
    if (!password || password.length < 6) return err('Senha deve ter ao menos 6 caracteres')

    const { error } = await adminClient.auth.admin.updateUserById(userId, { password })
    if (error) return err(error.message, 500)

    return json({ updated: userId })
  }

  // ── POST /approve-signup → aprova solicitação de clínica ─────────────────────
  if (req.method === 'POST' && parts[0] === 'approve-signup') {
    const { requestId } = await req.json() as { requestId: string }
    if (!requestId) return err('requestId obrigatório')

    // Fetch signup request
    const { data: req_, error: e0 } = await adminClient
      .from('clinic_signup_requests')
      .select('*')
      .eq('id', requestId)
      .eq('status', 'pending')
      .single()
    if (e0 || !req_) return err('Solicitação não encontrada ou já processada', 404)

    const signupReq = req_ as {
      id: string; name: string; cnpj: string | null; phone: string | null
      email: string; responsible_name: string
    }

    // 1. Create clinic
    const { data: clinic, error: e1 } = await adminClient
      .from('clinics')
      .insert({
        name:  signupReq.name,
        cnpj:  signupReq.cnpj  || null,
        phone: signupReq.phone || null,
        email: signupReq.email,
      })
      .select()
      .single()
    if (e1 || !clinic) return err(e1?.message ?? 'Erro ao criar clínica', 500)

    const clinicId = (clinic as { id: string }).id

    // 2. Invite user by email (Supabase sends invite email)
    // Fallback: if email already exists, use that user instead
    let invitedUserId: string
    const { data: inviteResult, error: e2 } = await adminClient.auth.admin.inviteUserByEmail(
      signupReq.email,
      {
        data: { name: signupReq.responsible_name },
        ...(SITE_URL ? { redirectTo: `${SITE_URL}/nova-senha` } : {}),
      },
    )
    if (e2) {
      const { data: { users: allUsers } } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
      const existingUser = allUsers?.find(u => u.email === signupReq.email)
      if (!existingUser) return err(e2.message ?? 'Erro ao convidar usuário', 500)
      invitedUserId = existingUser.id
    } else {
      if (!inviteResult?.user) return err('Erro ao convidar usuário', 500)
      invitedUserId = inviteResult.user.id
    }

    // 3. Create user_profile as clinic admin
    const { error: e3 } = await adminClient.from('user_profiles').upsert({
      id:            invitedUserId,
      name:          signupReq.responsible_name,
      roles:         ['admin'],
      clinic_id:     clinicId,
      is_super_admin: false,
    })
    if (e3) return err(e3.message, 500)

    // 4. Mark request as approved
    await adminClient
      .from('clinic_signup_requests')
      .update({
        status: 'approved',
        reviewed_at: new Date().toISOString(),
        reviewed_by: callerUid,
      })
      .eq('id', requestId)

    await notifyPedro([
      '✅ *Solicitação de clínica aprovada*',
      `*Clínica:* ${signupReq.name}`,
      `*Responsável:* ${signupReq.responsible_name}`,
      `*E-mail:* ${signupReq.email}`,
      '',
      `*Clinic ID:* ${clinicId}`,
      `*User ID:* ${invitedUserId}`,
    ])

    return json({ clinicId, userId: invitedUserId })
  }

  // ── POST /reject-signup → rejeita solicitação de clínica ─────────────────────
  if (req.method === 'POST' && parts[0] === 'reject-signup') {
    const { requestId } = await req.json() as { requestId: string }
    if (!requestId) return err('requestId obrigatório')

    const { data: req_, error: fetchError } = await adminClient
      .from('clinic_signup_requests')
      .select('name, responsible_name, email')
      .eq('id', requestId)
      .single()
    if (fetchError || !req_) return err(fetchError?.message ?? 'Solicitação não encontrada', 404)

    const { error } = await adminClient
      .from('clinic_signup_requests')
      .update({
        status: 'rejected',
        reviewed_at: new Date().toISOString(),
        reviewed_by: callerUid,
      })
      .eq('id', requestId)
    if (error) return err(error.message, 500)

    await notifyPedro([
      '⛔ *Solicitação de clínica rejeitada*',
      `*Clínica:* ${req_.name as string}`,
      `*Responsável:* ${req_.responsible_name as string}`,
      `*E-mail:* ${req_.email as string}`,
    ])

    return json({ rejected: requestId })
  }

  return err('Not found', 404)
})
