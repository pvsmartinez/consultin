import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../services/supabase'
import { QK } from '../lib/queryKeys'
import { mapClinic } from '../utils/mappers'
import type { UserRole } from '../types'

// ─── Types ────────────────────────────────────────────────────────────────────
export interface AdminUserProfile {
  id: string
  name: string
  roles: UserRole[]
  clinicId: string | null
  clinicName: string | null
  isSuperAdmin: boolean
}

/** Usuário completo (auth + perfil) retornado pela edge function */
export interface AdminAuthUser {
  id: string
  email: string
  createdAt: string
  lastSignIn: string | null
  confirmed: boolean
  name: string | null
  roles: UserRole[] | null
  clinicId: string | null
  clinicName: string | null
  isSuperAdmin: boolean
  hasProfile: boolean
}

async function callAdminFn<T>(
  path: string,
  options?: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown },
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(`admin-users${path}`, {
    method: options?.method ?? 'GET',
    body:   options?.body ?? undefined,
  })
  if (error) {
    // Try to pull the JSON error message from the response body
    let msg = error.message
    try {
      const ctx = (error as unknown as { context?: Response }).context
      if (ctx) {
        // Try JSON first, then plain text
        let bodyText = ''
        try {
          const json = await ctx.clone().json() as { error?: string; message?: string }
          if (json?.error) { msg = json.error; bodyText = json.error }
          else if (json?.message) { msg = json.message; bodyText = json.message }
        } catch {
          bodyText = await ctx.text().catch(() => '')
          if (bodyText) msg = bodyText
        }
      }
    } catch { /* ignore — fallback to error.message */ }
    throw new Error(msg)
  }
  return data as T
}

// ─── All clinics (no RLS filter — super admin sees everything) ─────────────────
export function useAdminClinics() {
  return useQuery({
    queryKey: QK.admin.clinics(),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clinics')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(row => mapClinic(row as Record<string, unknown>))
    },
  })
}

// ─── Create clinic ────────────────────────────────────────────────────────────
export function useCreateClinic() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { name: string; cnpj?: string; phone?: string; email?: string; city?: string; state?: string }) => {
      const { data, error } = await supabase
        .from('clinics')
        .insert({ name: input.name, cnpj: input.cnpj || null, phone: input.phone || null,
                  email: input.email || null, city: input.city || null, state: input.state || null })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.admin.clinics() }),
  })
}

// ─── All user profiles (only visible to super admin via RLS) ──────────────────
export function useAdminProfiles() {
  return useQuery({
    queryKey: QK.admin.profiles(),
    staleTime: 2 * 60_000,
    queryFn: async () => {
      // Single JOIN query instead of 2 round-trips
      const { data: profiles, error } = await supabase
        .from('user_profiles')
        .select('id, name, roles, clinic_id, is_super_admin, clinics(id, name)')
        .order('name')
      if (error) throw error

      return (profiles ?? []).map(p => {
        const clinic = p.clinics as { id: string; name: string } | null
        return {
          id:          p.id as string,
          name:        p.name as string,
          roles:       (p.roles as UserRole[]) ?? [],
          clinicId:    p.clinic_id as string | null,
          clinicName:  clinic?.name ?? null,
          isSuperAdmin: (p.is_super_admin as boolean) ?? false,
        } satisfies AdminUserProfile
      })
    },
  })
}

// ─── Upsert a user profile (assign to clinic + role) ─────────────────────────
export function useUpsertProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; name: string; roles: UserRole[]; clinicId: string | null; isSuperAdmin: boolean }) => {
      const { error } = await supabase
        .from('user_profiles')
        .upsert({
          id: input.id,
          name: input.name,
          roles: input.roles,
          clinic_id: input.clinicId,
          is_super_admin: input.isSuperAdmin,
        })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.admin.profiles() })
      qc.invalidateQueries({ queryKey: QK.admin.authUsers() })
    },
  })
}

// ─── Admin overview — aggregate stats across ALL clinics ──────────────────────
export interface ClinicStats {
  clinicId: string
  clinicName: string
  patients: number
  professionals: number
  appointmentsThisMonth: number
  appointmentsTotal: number
}

export interface AdminOverview {
  totalClinics: number
  totalUsers: number
  totalPatients: number
  totalAppointments: number
  perClinic: ClinicStats[]
}

export function useAdminOverview() {
  return useQuery<AdminOverview>({
    queryKey: QK.admin.overview(),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // 2 queries instead of 8 — per-clinic aggregations done in DB via RPC
      const [
        { data: rows,        error: e1 },
        { count: totalUsers, error: e2 },
      ] = await Promise.all([
        supabase.rpc('admin_clinic_stats'),
        supabase.from('user_profiles').select('id', { count: 'exact', head: true }),
      ])

      if (e1) throw e1
      if (e2) throw e2

      const perClinic: ClinicStats[] = (rows ?? []).map(r => ({
        clinicId:              r.clinic_id,
        clinicName:            r.clinic_name,
        patients:              Number(r.patients_count),
        professionals:         Number(r.professionals_count),
        appointmentsThisMonth: Number(r.appointments_this_month),
        appointmentsTotal:     Number(r.appointments_total),
      }))

      return {
        totalClinics:      perClinic.length,
        totalUsers:        totalUsers ?? 0,
        totalPatients:     perClinic.reduce((s, r) => s + r.patients, 0),
        totalAppointments: perClinic.reduce((s, r) => s + r.appointmentsTotal, 0),
        perClinic,
      }
    },
  })
}

// ─── Auth users list (via edge function, service role) ────────────────────────
export function useAdminAuthUsers({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery<AdminAuthUser[]>({
    queryKey: QK.admin.authUsers(),
    queryFn: () => callAdminFn<AdminAuthUser[]>(''),
    enabled,
    staleTime: 60_000, // 1 min — evita refetch desnecessário
  })
}

// ─── Create auth user with password ──────────────────────────────────────────
export function useCreateAuthUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      email: string
      password: string
      name: string
      role: UserRole
      clinicId: string | null
      isSuperAdmin: boolean
    }) => callAdminFn<{ id: string; email: string }>('/create', { method: 'POST', body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.admin.authUsers() })
      qc.invalidateQueries({ queryKey: QK.admin.profiles() })
      qc.invalidateQueries({ queryKey: QK.admin.overview() })
    },
  })
}

// ─── Invite user by email (no password needed) ────────────────────────────────
export function useInviteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      email: string
      name: string
      role: UserRole
      clinicId: string | null
      isSuperAdmin: boolean
    }) => callAdminFn<{ id: string; email: string }>('/invite', { method: 'POST', body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.admin.authUsers() })
      qc.invalidateQueries({ queryKey: QK.admin.profiles() })
      qc.invalidateQueries({ queryKey: QK.admin.overview() })
    },
  })
}

// ─── Resend invite email to pending (unconfirmed) user ───────────────────────
export function useResendInvite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) =>
      callAdminFn<{ resent: string }>('/resend-invite', { method: 'POST', body: { userId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.admin.authUsers() }),
  })
}

// ─── Delete auth user ─────────────────────────────────────────────────────────
export function useDeleteAuthUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) =>
      callAdminFn<{ deleted: string }>(`/${userId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.admin.authUsers() })
      qc.invalidateQueries({ queryKey: QK.admin.profiles() })
      qc.invalidateQueries({ queryKey: QK.admin.overview() })
    },
  })
}

// ─── Reset user password ──────────────────────────────────────────────────────
export function useResetUserPassword() {
  return useMutation({
    mutationFn: ({ userId, password }: { userId: string; password: string }) =>
      callAdminFn<{ updated: string }>(`/${userId}/password`, { method: 'PATCH', body: { password } }),
  })
}

// ─── Clinic signup requests ───────────────────────────────────────────────────
export interface ClinicSignupRequest {
  id:              string
  name:            string
  cnpj:            string | null
  phone:           string | null
  email:           string
  responsibleName: string
  message:         string | null
  status:          'pending' | 'approved' | 'rejected'
  createdAt:       string
}

export function useSignupRequests() {
  return useQuery<ClinicSignupRequest[]>({
    queryKey: QK.admin.signupRequests(),
    staleTime: 2 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clinic_signup_requests')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(r => ({
        id:              r.id as string,
        name:            r.name as string,
        cnpj:            r.cnpj as string | null,
        phone:           r.phone as string | null,
        email:           r.email as string,
        responsibleName: r.responsible_name as string,
        message:         r.message as string | null,
        status:          r.status as ClinicSignupRequest['status'],
        createdAt:       r.created_at as string,
      }))
    },
  })
}

export function useApproveSignupRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (requestId: string) =>
      callAdminFn<{ clinicId: string; userId: string }>('/approve-signup', {
        method: 'POST',
        body: { requestId },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.admin.signupRequests() })
      qc.invalidateQueries({ queryKey: QK.admin.clinics() })
      qc.invalidateQueries({ queryKey: QK.admin.overview() })
    },
  })
}

export function useRejectSignupRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (requestId: string) =>
      callAdminFn<{ rejected: string }>('/reject-signup', {
        method: 'POST',
        body: { requestId },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.admin.signupRequests() })
    },
  })
}

// ─── Update clinic details ────────────────────────────────────────────────────
export function useUpdateClinic() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      name?: string
      cnpj?: string
      phone?: string
      email?: string
      city?: string
      state?: string
      paymentsEnabled?: boolean
      billingOverrideEnabled?: boolean
      subscriptionStatus?: 'ACTIVE' | 'OVERDUE' | 'INACTIVE' | 'EXPIRED' | null
      subscriptionTier?: 'trial' | 'basic' | 'professional' | 'unlimited'
      trialEndsAt?: string | null
    }) => {
      const payload: Record<string, unknown> = {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.cnpj !== undefined ? { cnpj: input.cnpj || null } : {}),
        ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
        ...(input.email !== undefined ? { email: input.email || null } : {}),
        ...(input.city !== undefined ? { city: input.city || null } : {}),
        ...(input.state !== undefined ? { state: input.state || null } : {}),
        ...(input.paymentsEnabled !== undefined ? { payments_enabled: input.paymentsEnabled } : {}),
        ...(input.billingOverrideEnabled !== undefined ? { billing_override_enabled: input.billingOverrideEnabled } : {}),
        ...(input.subscriptionStatus !== undefined ? { subscription_status: input.subscriptionStatus } : {}),
        ...(input.subscriptionTier !== undefined ? { subscription_tier: input.subscriptionTier } : {}),
        ...(input.trialEndsAt !== undefined ? { trial_ends_at: input.trialEndsAt } : {}),
      }

      const { error } = await supabase
        .from('clinics')
        .update(payload)
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.admin.clinics() }),
  })
}

// ─── Delete clinic (cascades via FK) ────────────────────────────────────────
export function useDeleteClinic() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (clinicId: string) => {
      const { error } = await supabase
        .from('clinics')
        .delete()
        .eq('id', clinicId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.admin.clinics() }),
  })
}

// ─── Enter a clinic as super admin (test mode) ────────────────────────────────
// Sets clinic_id on own profile → navigate to /dashboard → app behaves as clinic admin.
// Pass clinicId = null to exit test mode.
export function useEnterClinic() {
  return useMutation({
    mutationFn: async ({ userId, clinicId }: { userId: string; clinicId: string | null }) => {
      const { error } = await supabase
        .from('user_profiles')
        .update({ clinic_id: clinicId })
        .eq('id', userId)
      if (error) throw error
      // Clear profile localStorage cache so next load fetches fresh data
      localStorage.removeItem('consultin_profile_cache')
    },
    onSuccess: (_data, vars) => {
      window.location.href = vars.clinicId ? '/dashboard' : '/admin'
    },
  })
}
