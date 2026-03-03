import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '../services/supabase'
import { useAuthContext } from '../contexts/AuthContext'
import type { ClinicInvite, UserRole } from '../types'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function mapInviteRow(r: Record<string, unknown>): ClinicInvite {
  const clinic = r.clinics as { name?: string } | null
  return {
    id:         r.id as string,
    clinicId:   r.clinic_id as string,
    clinicName: clinic?.name,
    email:      r.email as string,
    roles:      (r.roles as UserRole[]) ?? ['professional'],
    name:       (r.name as string) ?? null,
    invitedBy:  (r.invited_by as string) ?? null,
    usedAt:     (r.used_at as string) ?? null,
    createdAt:  r.created_at as string,
  }
}

// ─── useMyInvite ──────────────────────────────────────────────────────────────
// Checks clinic_invites for the authenticated user's email.
// Used during onboarding: if the user has a pending invite, show the "confirm
// access" view instead of the "no access" view.
export function useMyInvite(email: string | undefined) {
  return useQuery<ClinicInvite | null>({
    queryKey: ['myInvite', email],
    enabled: !!email,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clinic_invites')
        .select('*, clinics(name)')
        .is('used_at', null)
        .ilike('email', email!)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      return mapInviteRow(data as Record<string, unknown>)
    },
  })
}

// ─── usePendingInvites ────────────────────────────────────────────────────────
// Lists pending (not yet accepted) invites for the current user's clinic.
export function usePendingInvites() {
  return useQuery<ClinicInvite[]>({
    queryKey: ['pendingInvites'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clinic_invites')
        .select('*, clinics(name)')
        .is('used_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(r => mapInviteRow(r as Record<string, unknown>))
    },
  })
}

// ─── useClinicsPublic ─────────────────────────────────────────────────────────
// Returns all clinics for the patient registration dropdown.
// Available to any authenticated user (RLS "authenticated_read_clinics" policy).
export function useClinicsPublic() {
  return useQuery<{ id: string; name: string }[]>({
    queryKey: ['clinicsPublic'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clinics')
        .select('id, name')
        .order('name')
      if (error) throw error
      return (data ?? []) as { id: string; name: string }[]
    },
  })
}

// ─── useCreateInvite ──────────────────────────────────────────────────────────
// Clinic admin creates an invite for a future professional/staff.
// After inserting the DB record, calls send-clinic-invite to fire the email.
export function useCreateInvite() {
  const qc = useQueryClient()
  const { profile } = useAuthContext()
  return useMutation({
    mutationFn: async (input: {
      email: string
      roles?: UserRole[]
      name?: string
    }): Promise<{ invite: ClinicInvite; emailSent: boolean; emailReason?: string }> => {
      // 1. Insert into clinic_invites
      const { data, error } = await supabase
        .from('clinic_invites')
        .insert({
          clinic_id: profile!.clinicId!,
          email: input.email.toLowerCase().trim(),
          roles: input.roles ?? ['professional'],
          name:  input.name ?? null,
        })
        .select('*, clinics(name)')
        .single()
      if (error) throw error

      const invite = mapInviteRow(data as Record<string, unknown>)

      // 2. Send invite email via edge function (best-effort — don't throw on failure)
      try {
        const { data: emailResult } = await supabase.functions.invoke<{
          sent: boolean
          reason?: string
          email: string
        }>('send-clinic-invite', {
          method: 'POST',
          body:   { inviteId: invite.id },
        })
        return {
          invite,
          emailSent:   emailResult?.sent ?? false,
          emailReason: emailResult?.reason,
        }
      } catch {
        // Email failed but invite is created — return gracefully
        return { invite, emailSent: false, emailReason: 'send_error' }
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pendingInvites'] }),
  })
}

// ─── useResendInviteEmail ─────────────────────────────────────────────────────
// Clinic admin resends invite email for an existing pending invite.
export function useResendInviteEmail() {
  return useMutation({
    mutationFn: async (inviteId: string): Promise<{ sent: boolean; reason?: string }> => {
      const { data, error } = await supabase.functions.invoke<{
        sent: boolean
        reason?: string
        email: string
      }>('send-clinic-invite', {
        method: 'POST',
        body:   { inviteId },
      })
      if (error) throw error
      return { sent: data?.sent ?? false, reason: data?.reason }
    },
    onSuccess: (result) => {
      if (result.sent) {
        toast.success('Convite reenviado por e-mail!')
      } else if (result.reason === 'already_registered') {
        toast.info('Usuário já tem conta ativa — ele verá o convite ao fazer login em consultin.app.')
      } else {
        toast.error('Não foi possível reenviar o e-mail.')
      }
    },
    onError: () => toast.error('Erro ao reenviar convite.'),
  })
}

// ─── useDeleteInvite ──────────────────────────────────────────────────────────
// Clinic admin revokes an invite.
export function useDeleteInvite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('clinic_invites')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pendingInvites'] }),
  })
}

// ─── useAcceptInvite ──────────────────────────────────────────────────────────
// Called during onboarding when the user accepts a professional/staff invite.
// For professionals this also creates / links their `professionals` record
// and adds a `user_clinic_memberships` entry so multi-clinic works from day 1.
export function useAcceptInvite() {
  return useMutation({
    mutationFn: async (params: {
      inviteId: string
      userId: string
      clinicId: string
      roles: UserRole[]
      name: string
      email?: string   // auth user email — used to find / create professionals record
    }) => {
      // 1. Create user_profiles (only if it doesn't exist yet — second-clinic accepts skip this)
      const { data: existingProfile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('id', params.userId)
        .maybeSingle()

      if (!existingProfile) {
        const { error: profileErr } = await supabase
          .from('user_profiles')
          .insert({
            id:             params.userId,
            clinic_id:      params.clinicId,
            roles:          params.roles,
            name:           params.name.trim(),
            is_super_admin: false,
          })
        if (profileErr) throw new Error(profileErr.message)
      }

      // 2. For professional role: ensure a professionals record exists at this clinic
      //    and link user_id so multi-clinic queries work.
      let professionalId: string | null = null
      if (params.roles.includes('professional')) {
        // Check if admin already created a professionals record with this email
        const { data: existingProf } = await supabase
          .from('professionals')
          .select('id')
          .eq('clinic_id', params.clinicId)
          .ilike('email', params.email ?? '')
          .maybeSingle()

        if (existingProf) {
          // Link user_id to existing record
          await supabase
            .from('professionals')
            .update({ user_id: params.userId })
            .eq('id', existingProf.id)
          professionalId = existingProf.id as string
        } else {
          // Create a new professionals record for this clinic
          const { data: newProf, error: profErr } = await supabase
            .from('professionals')
            .insert({
              clinic_id: params.clinicId,
              user_id:   params.userId,
              name:      params.name.trim(),
              email:     params.email ?? null,
              active:    true,
            })
            .select('id')
            .single()
          if (profErr) throw new Error(profErr.message)
          professionalId = (newProf as { id: string }).id
        }

        // 3. Upsert user_clinic_memberships entry
        await supabase
          .from('user_clinic_memberships')
          .upsert(
            {
              user_id:         params.userId,
              clinic_id:       params.clinicId,
              professional_id: professionalId,
              active:          true,
            },
            { onConflict: 'user_id,clinic_id' },
          )
      }

      // 4. Mark invite as used
      const { error: inviteErr } = await supabase
        .from('clinic_invites')
        .update({ used_at: new Date().toISOString() })
        .eq('id', params.inviteId)
      if (inviteErr) throw new Error(inviteErr.message)

      // 5. Refresh the session so AuthContext picks up the new profile
      await supabase.auth.refreshSession()
    },
  })
}

// ─── useMyClinicMemberships ───────────────────────────────────────────────────
// Returns all clinic memberships for the current user.
// Professionals with multi-clinic: returns one entry per clinic.
export function useMyClinicMemberships() {
  const { session } = useAuthContext()
  return useQuery({
    queryKey: ['my-clinic-memberships', session?.user.id],
    enabled: !!session?.user.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_clinic_memberships')
        .select('*, clinics(id, name)')
        .eq('user_id', session!.user.id)
        .eq('active', true)
        .order('created_at')
      if (error) throw error
      return (data ?? []).map((r) => {
        const clinic = r.clinics as { id: string; name: string } | null
        return {
          id:             r.id as string,
          userId:         r.user_id as string,
          clinicId:       r.clinic_id as string,
          clinicName:     clinic?.name ?? null,
          professionalId: (r.professional_id as string) ?? null,
          active:         r.active as boolean,
          createdAt:      r.created_at as string,
        }
      })
    },
  })
}
