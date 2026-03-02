import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../services/supabase'
import { useAuthContext } from '../contexts/AuthContext'
import { mapClinic } from '../utils/mappers'
import type { Clinic, UserRole } from '../types'

export interface ClinicMember {
  id:                 string
  name:               string
  roles:              UserRole[]
  permissionOverrides: Partial<Record<string, boolean>>
}

export function useClinic() {
  const qc = useQueryClient()
  const { profile } = useAuthContext()
  const clinicId = profile?.clinicId

  const query = useQuery({
    queryKey: ['clinic', clinicId],
    enabled: !!clinicId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clinics')
        .select('*')
        .eq('id', clinicId!)
        .single()
      if (error) throw error
      return mapClinic(data as Record<string, unknown>)
    },
  })

  const update = useMutation({
    mutationFn: async (input: Partial<Omit<Clinic, 'id' | 'createdAt'>>) => {
      const { data, error } = await supabase
        .from('clinics')
        .update({
          name:                       input.name,
          cnpj:                       input.cnpj,
          phone:                      input.phone,
          email:                      input.email,
          address:                    input.address,
          city:                       input.city,
          state:                      input.state,
          slot_duration_minutes:      input.slotDurationMinutes,
          working_hours:              input.workingHours,
          custom_patient_fields:      input.customPatientFields,
          patient_field_config:       input.patientFieldConfig,
          custom_professional_fields: input.customProfessionalFields,
          professional_field_config:  input.professionalFieldConfig,
          anamnesis_fields:           input.anamnesisFields,
          onboarding_completed:       input.onboardingCompleted,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...(input.paymentsEnabled      !== undefined ? { payments_enabled:      input.paymentsEnabled      } : {}),
          ...(input.asaasCustomerId      !== undefined ? { asaas_customer_id:     input.asaasCustomerId      } : {}),
          ...(input.asaasSubscriptionId  !== undefined ? { asaas_subscription_id: input.asaasSubscriptionId  } : {}),
          ...(input.subscriptionStatus   !== undefined ? { subscription_status:   input.subscriptionStatus   } : {}),
          // WhatsApp
          ...(input.whatsappEnabled         !== undefined ? { whatsapp_enabled:           input.whatsappEnabled         } : {}),
          ...(input.whatsappPhoneNumberId   !== undefined ? { whatsapp_phone_number_id:   input.whatsappPhoneNumberId   } : {}),
          ...(input.whatsappPhoneDisplay    !== undefined ? { whatsapp_phone_display:      input.whatsappPhoneDisplay    } : {}),
          ...(input.whatsappWabaId          !== undefined ? { whatsapp_waba_id:            input.whatsappWabaId          } : {}),
          ...(input.whatsappVerifyToken     !== undefined ? { whatsapp_verify_token:       input.whatsappVerifyToken     } : {}),
          ...(input.waRemindersd1           !== undefined ? { wa_reminders_d1:             input.waRemindersd1           } : {}),
          ...(input.waRemindersd0           !== undefined ? { wa_reminders_d0:             input.waRemindersd0           } : {}),
          ...(input.waProfessionalAgenda    !== undefined ? { wa_professional_agenda:      input.waProfessionalAgenda    } : {}),
          ...(input.waAttendantInbox        !== undefined ? { wa_attendant_inbox:          input.waAttendantInbox        } : {}),
          ...(input.waAiModel               !== undefined ? { wa_ai_model:                 input.waAiModel               } : {}),
        } as Record<string, unknown>)
        .eq('id', clinicId!)
        .select()
        .single()
      if (error) throw error
      return mapClinic(data as Record<string, unknown>)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinic', clinicId] }),
  })

  return { ...query, update }
}
// ─── Clinic members (user_profiles for current clinic) ───────────────────────
export function useClinicMembers() {
  const { profile } = useAuthContext()
  const clinicId = profile?.clinicId

  return useQuery<ClinicMember[]>({
    queryKey: ['clinic-members', clinicId],
    enabled: !!clinicId,
    staleTime: 2 * 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('user_profiles')
        .select('id, name, roles, permission_overrides')
        .eq('clinic_id', clinicId!)
        .order('name')
      if (error) throw error
      return ((data ?? []) as Record<string, unknown>[]).map(r => ({
        id:                  r.id as string,
        name:                r.name as string,
        roles:               (r.roles as UserRole[]) ?? [],
        permissionOverrides: (r.permission_overrides as Record<string, boolean>) ?? {},
      }))
    },
  })
}

export function useUpdateMemberRole() {
  const qc = useQueryClient()
  const { profile } = useAuthContext()
  return useMutation({
    mutationFn: async ({
      memberId,
      roles,
      permissionOverrides,
    }: {
      memberId: string
      roles: UserRole[]
      permissionOverrides?: Partial<Record<string, boolean>>
    }) => {
      const update: Record<string, unknown> = { roles }
      if (permissionOverrides !== undefined) update.permission_overrides = permissionOverrides
      const { error } = await supabase
        .from('user_profiles')
        .update(update)
        .eq('id', memberId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinic-members', profile?.clinicId] }),
  })
}

export function useRemoveClinicMember() {
  const qc = useQueryClient()
  const { profile } = useAuthContext()
  return useMutation({
    mutationFn: async (memberId: string) => {
      // Unlink from clinic instead of deleting the auth profile — the user's
      // account remains valid; they simply lose access to this clinic.
      const { error } = await supabase
        .from('user_profiles')
        .update({ clinic_id: null, roles: [] })
        .eq('id', memberId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinic-members', profile?.clinicId] }),
  })
}

// ─── Clinic invites (pending) ─────────────────────────────────────────────────

export interface ClinicInvite {
  id:        string
  email:     string
  name:      string | null
  role:      string
  createdAt: string
}

export function useClinicInvites() {
  const { profile } = useAuthContext()
  const clinicId = profile?.clinicId

  return useQuery<ClinicInvite[]>({
    queryKey: ['clinic-invites', clinicId],
    enabled: !!clinicId,
    staleTime: 2 * 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('clinic_invites')
        .select('id, email, name, role, created_at')
        .eq('clinic_id', clinicId!)
        .is('used_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return ((data ?? []) as Record<string, unknown>[]).map(r => ({
        id:        r.id as string,
        email:     r.email as string,
        name:      (r.name as string | null) ?? null,
        role:      (r.role as string) ?? 'professional',
        createdAt: r.created_at as string,
      }))
    },
  })
}

export function useResendInvite() {
  const qc = useQueryClient()
  const { profile } = useAuthContext()
  return useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase.functions.invoke('send-clinic-invite', {
        body: { inviteId },
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinic-invites', profile?.clinicId] }),
  })
}

export function useCancelInvite() {
  const qc = useQueryClient()
  const { profile } = useAuthContext()
  return useMutation({
    mutationFn: async (inviteId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('clinic_invites')
        .delete()
        .eq('id', inviteId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinic-invites', profile?.clinicId] }),
  })
}