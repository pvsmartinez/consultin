/**
 * Edge Function: send-clinic-invite
 *
 * Envia e-mail de convite para um profissional/funcionário de uma clínica.
 * Requer que o chamador seja admin da clínica dona do convite.
 *
 * Rotas:
 *   POST /          → envia e-mail para um clinic_invites existente
 *   POST /resend    → reenvia e-mail de convite já existente
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SITE_URL                  = Deno.env.get('SITE_URL') ?? ''

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

function err(msg: string, status = 400): Response {
  return json({ error: msg }, status)
}

// ─── Auth check ───────────────────────────────────────────────────────────────
// Verifies caller is a clinic admin (or super admin).
// Returns adminClient + caller's clinicId.
async function assertClinicAdmin(req: Request): Promise<
  | { adminClient: ReturnType<typeof createClient>; callerClinicId: string | null; isSuperAdmin: boolean }
  | Response
> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return err('Missing Authorization header', 401)

  // Use user-scoped client (recommended pattern for edge functions)
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: { user }, error } = await userClient.auth.getUser()
  if (error || !user) return err('Unauthorized', 401)

  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: profile } = await serviceClient
    .from('user_profiles')
    .select('roles, clinic_id, is_super_admin')
    .eq('id', user.id)
    .single()

  if (!profile) return err('Perfil não encontrado', 403)

  const isSuperAdmin = !!profile.is_super_admin
  const isClinicAdmin = Array.isArray(profile.roles) && profile.roles.includes('admin')

  if (!isSuperAdmin && !isClinicAdmin) {
    return err('Forbidden: somente admins podem enviar convites', 403)
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  return {
    adminClient,
    callerClinicId: (profile.clinic_id as string) ?? null,
    isSuperAdmin,
  }
}

// ─── Send invite e-mail ───────────────────────────────────────────────────────
async function sendInviteEmail(
  adminClient: ReturnType<typeof createClient>,
  inviteId: string,
  callerClinicId: string | null,
  isSuperAdmin: boolean,
): Promise<Response> {
  // Fetch the invite record
  const { data: invite, error: e0 } = await adminClient
    .from('clinic_invites')
    .select('id, email, name, clinic_id, roles, used_at, clinics(name)')
    .eq('id', inviteId)
    .maybeSingle()

  if (e0 || !invite) return err('Convite não encontrado', 404)

  const inv = invite as {
    id: string
    email: string
    name: string | null
    clinic_id: string
    roles: string[]
    used_at: string | null
    clinics: { name: string } | null
  }

  // Non-super admins can only send invites for their own clinic
  if (!isSuperAdmin && callerClinicId !== inv.clinic_id) {
    return err('Forbidden: convite pertence a outra clínica', 403)
  }

  if (inv.used_at) {
    return err('Convite já foi aceito', 400)
  }

  const clinicName = inv.clinics?.name ?? 'a clínica'
  const redirectTo = SITE_URL ? `${SITE_URL}/onboarding` : undefined

  // Try to send invite email
  const { error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(
    inv.email,
    {
      data: {
        name:        inv.name ?? undefined,
        clinic_name: clinicName,
      },
      ...(redirectTo ? { redirectTo } : {}),
    },
  )

  if (inviteErr) {
    // User already has a confirmed account — they'll see the invite via useMyInvite
    // when they log in and visit /onboarding, or we show them an in-app notification.
    if (
      inviteErr.message?.toLowerCase().includes('already registered') ||
      inviteErr.message?.toLowerCase().includes('already been registered') ||
      inviteErr.message?.toLowerCase().includes('user already exists') ||
      inviteErr.status === 422
    ) {
      return json({ sent: false, reason: 'already_registered', email: inv.email })
    }
    return err(inviteErr.message ?? 'Erro ao enviar convite', 500)
  }

  return json({ sent: true, email: inv.email })
}

// ─── Handler ──────────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return err('Method not allowed', 405)

  const auth = await assertClinicAdmin(req)
  if (auth instanceof Response) return auth
  const { adminClient, callerClinicId, isSuperAdmin } = auth

  const url   = new URL(req.url)
  const parts = url.pathname.replace(/^.*\/send-clinic-invite\/?/, '').split('/').filter(Boolean)

  // ── POST / → envia e-mail para convite recém-criado ──────────────────────────
  // ── POST /resend → reenvia e-mail de convite já existente ────────────────────
  if (parts.length === 0 || parts[0] === 'resend') {
    const body = await req.json() as { inviteId: string }
    if (!body.inviteId) return err('inviteId é obrigatório')

    return sendInviteEmail(adminClient, body.inviteId, callerClinicId, isSuperAdmin)
  }

  return err('Not found', 404)
})
