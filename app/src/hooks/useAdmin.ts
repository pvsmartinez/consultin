import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../services/supabase'
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
    queryKey: ['admin', 'clinics'],
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'clinics'] }),
  })
}

// ─── All user profiles (only visible to super admin via RLS) ──────────────────
export function useAdminProfiles() {
  return useQuery({
    queryKey: ['admin', 'profiles'],
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from('user_profiles')
        .select('id, name, roles, clinic_id, is_super_admin')
        .order('name')
      if (error) throw error

      const clinicIds = [...new Set(profiles?.map(p => p.clinic_id).filter(Boolean))]
      let clinicNames: Record<string, string> = {}
      if (clinicIds.length > 0) {
        const { data: clinics } = await supabase
          .from('clinics').select('id, name').in('id', clinicIds as string[])
        clinicNames = Object.fromEntries((clinics ?? []).map(c => [c.id, c.name as string]))
      }

      return (profiles ?? []).map(p => ({
        id:          p.id as string,
        name:        p.name as string,
        roles:       (p.roles as UserRole[]) ?? [],
        clinicId:    p.clinic_id as string | null,
        clinicName:  p.clinic_id ? (clinicNames[p.clinic_id] ?? 'Clínica desconhecida') : null,
        isSuperAdmin: (p.is_super_admin as boolean) ?? false,
      } satisfies AdminUserProfile))
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
      qc.invalidateQueries({ queryKey: ['admin', 'profiles'] })
      qc.invalidateQueries({ queryKey: ['admin', 'auth-users'] })
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
    queryKey: ['admin', 'overview'],
    queryFn: async () => {
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString()

      const [
        { data: clinics,       error: e1 },
        { count: totalUsers,   error: e2 },
        { count: totalPatients, error: e3 },
        { count: totalAppts,   error: e4 },
        { data: patientsPC,    error: e5 },
        { data: profsPC,       error: e6 },
        { data: apptsMonth,    error: e7 },
        { data: apptsTotal,    error: e8 },
      ] = await Promise.all([
        supabase.from('clinics').select('id, name').order('name'),
        supabase.from('user_profiles').select('*', { count: 'exact', head: true }),
        supabase.from('patients').select('*', { count: 'exact', head: true }),
        supabase.from('appointments').select('*', { count: 'exact', head: true }),
        supabase.from('patients').select('clinic_id'),
        supabase.from('professionals').select('clinic_id').eq('active', true),
        supabase.from('appointments').select('clinic_id').gte('starts_at', monthStart).lte('starts_at', monthEnd),
        supabase.from('appointments').select('clinic_id'),
      ])

      for (const err of [e1, e2, e3, e4, e5, e6, e7, e8]) {
        if (err) throw err
      }

      // Count per clinic
      const count = (rows: { clinic_id: string }[] | null, id: string) =>
        (rows ?? []).filter(r => r.clinic_id === id).length

      const perClinic: ClinicStats[] = (clinics ?? []).map(c => ({
        clinicId:             c.id as string,
        clinicName:           c.name as string,
        patients:             count(patientsPC as { clinic_id: string }[], c.id as string),
        professionals:        count(profsPC    as { clinic_id: string }[], c.id as string),
        appointmentsThisMonth: count(apptsMonth as { clinic_id: string }[], c.id as string),
        appointmentsTotal:    count(apptsTotal  as { clinic_id: string }[], c.id as string),
      }))

      return {
        totalClinics:      (clinics ?? []).length,
        totalUsers:        totalUsers ?? 0,
        totalPatients:     totalPatients ?? 0,
        totalAppointments: totalAppts ?? 0,
        perClinic,
      }
    },
  })
}

// ─── Auth users list (via edge function, service role) ────────────────────────
export function useAdminAuthUsers({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery<AdminAuthUser[]>({
    queryKey: ['admin', 'auth-users'],
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
      qc.invalidateQueries({ queryKey: ['admin', 'auth-users'] })
      qc.invalidateQueries({ queryKey: ['admin', 'profiles'] })
      qc.invalidateQueries({ queryKey: ['admin', 'overview'] })
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
      qc.invalidateQueries({ queryKey: ['admin', 'auth-users'] })
      qc.invalidateQueries({ queryKey: ['admin', 'profiles'] })
      qc.invalidateQueries({ queryKey: ['admin', 'overview'] })
    },
  })
}

// ─── Resend invite email to pending (unconfirmed) user ───────────────────────
export function useResendInvite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) =>
      callAdminFn<{ resent: string }>('/resend-invite', { method: 'POST', body: { userId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'auth-users'] }),
  })
}

// ─── Delete auth user ─────────────────────────────────────────────────────────
export function useDeleteAuthUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) =>
      callAdminFn<{ deleted: string }>(`/${userId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'auth-users'] })
      qc.invalidateQueries({ queryKey: ['admin', 'profiles'] })
      qc.invalidateQueries({ queryKey: ['admin', 'overview'] })
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
    queryKey: ['admin', 'signup-requests'],
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
      qc.invalidateQueries({ queryKey: ['admin', 'signup-requests'] })
      qc.invalidateQueries({ queryKey: ['admin', 'clinics'] })
      qc.invalidateQueries({ queryKey: ['admin', 'overview'] })
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
      qc.invalidateQueries({ queryKey: ['admin', 'signup-requests'] })
    },
  })
}

// ─── Update clinic details ────────────────────────────────────────────────────
export function useUpdateClinic() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      name: string
      cnpj?: string
      phone?: string
      email?: string
      city?: string
      state?: string
    }) => {
      const { error } = await supabase
        .from('clinics')
        .update({
          name:  input.name,
          cnpj:  input.cnpj  || null,
          phone: input.phone || null,
          email: input.email || null,
          city:  input.city  || null,
          state: input.state || null,
        })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'clinics'] }),
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
