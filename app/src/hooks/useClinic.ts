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

// ─── Helpers ─────────────────────────────────────────────────────────────────
// Single source of truth for Clinic camelCase → DB snake_case mapping.
// Add new fields here once — the update mutation picks them up automatically.
function clinicToSnake(input: Partial<Omit<Clinic, 'id' | 'createdAt'>>): Record<string, unknown> {
  const defined = <T>(v: T | undefined): v is T => v !== undefined
  return {
    ...(defined(input.name)                   && { name:                       input.name }),
    ...(defined(input.cnpj)                   && { cnpj:                       input.cnpj }),
    ...(defined(input.phone)                  && { phone:                      input.phone }),
    ...(defined(input.email)                  && { email:                      input.email }),
    ...(defined(input.address)                && { address:                    input.address }),
    ...(defined(input.city)                   && { city:                       input.city }),
    ...(defined(input.state)                  && { state:                      input.state }),
    ...(defined(input.slotDurationMinutes)    && { slot_duration_minutes:      input.slotDurationMinutes }),
    ...(defined(input.workingHours)           && { working_hours:              input.workingHours }),
    ...(defined(input.customPatientFields)    && { custom_patient_fields:      input.customPatientFields }),
    ...(defined(input.patientFieldConfig)     && { patient_field_config:       input.patientFieldConfig }),
    ...(defined(input.customProfessionalFields) && { custom_professional_fields: input.customProfessionalFields }),
    ...(defined(input.professionalFieldConfig)  && { professional_field_config:  input.professionalFieldConfig }),
    ...(defined(input.anamnesisFields)        && { anamnesis_fields:           input.anamnesisFields }),
    ...(defined(input.onboardingCompleted)    && { onboarding_completed:       input.onboardingCompleted }),
    // Billing
    ...(defined(input.paymentsEnabled)        && { payments_enabled:           input.paymentsEnabled }),
    ...(defined(input.asaasCustomerId)        && { asaas_customer_id:          input.asaasCustomerId }),
    ...(defined(input.asaasSubscriptionId)    && { asaas_subscription_id:      input.asaasSubscriptionId }),
    ...(defined(input.subscriptionStatus)     && { subscription_status:        input.subscriptionStatus }),
    // WhatsApp
    ...(defined(input.whatsappEnabled)        && { whatsapp_enabled:           input.whatsappEnabled }),
    ...(defined(input.whatsappPhoneNumberId)  && { whatsapp_phone_number_id:   input.whatsappPhoneNumberId }),
    ...(defined(input.whatsappPhoneDisplay)   && { whatsapp_phone_display:     input.whatsappPhoneDisplay }),
    ...(defined(input.whatsappWabaId)         && { whatsapp_waba_id:           input.whatsappWabaId }),
    ...(defined(input.whatsappVerifyToken)    && { whatsapp_verify_token:      input.whatsappVerifyToken }),
    ...(defined(input.waRemindersd1)          && { wa_reminders_d1:            input.waRemindersd1 }),
    ...(defined(input.waRemindersd0)          && { wa_reminders_d0:            input.waRemindersd0 }),
    ...(defined(input.waProfessionalAgenda)   && { wa_professional_agenda:     input.waProfessionalAgenda }),
    ...(defined(input.waAttendantInbox)       && { wa_attendant_inbox:         input.waAttendantInbox }),
    ...(defined(input.waAiModel)              && { wa_ai_model:                input.waAiModel }),
    ...(defined(input.waAiCustomPrompt)       && { wa_ai_custom_prompt:        input.waAiCustomPrompt }),
    ...(defined(input.waAiAllowSchedule)      && { wa_ai_allow_schedule:       input.waAiAllowSchedule }),
    ...(defined(input.waAiAllowConfirm)       && { wa_ai_allow_confirm:        input.waAiAllowConfirm }),
    ...(defined(input.waAiAllowCancel)        && { wa_ai_allow_cancel:         input.waAiAllowCancel }),
    // Patient registration & payment policies
    ...(defined(input.allowSelfRegistration)  && { allow_self_registration:    input.allowSelfRegistration }),
    ...(defined(input.acceptedPaymentMethods) && { accepted_payment_methods:   input.acceptedPaymentMethods }),
    ...(defined(input.paymentTiming)          && { payment_timing:             input.paymentTiming }),
    ...(defined(input.cancellationHours)      && { cancellation_hours:         input.cancellationHours }),
    // Booking config
    ...(defined(input.allowProfessionalSelection) && { allow_professional_selection: input.allowProfessionalSelection }),
  }
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
        .update(clinicToSnake(input))
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
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, name, roles, permission_overrides')
        .eq('clinic_id', clinicId!)
        .order('name')
      if (error) throw error
      return ((data ?? []) as {
        id: string
        name: string
        roles: UserRole[]
        permission_overrides: Record<string, boolean> | null
      }[]).map(r => ({
        id:                  r.id,
        name:                r.name,
        roles:               r.roles ?? [],
        permissionOverrides: r.permission_overrides ?? {},
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
      const { data, error } = await supabase
        .from('clinic_invites')
        .select('id, email, name, roles, created_at')
        .eq('clinic_id', clinicId!)
        .is('used_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return ((data ?? []) as Record<string, unknown>[]).map(r => ({
        id:        r.id as string,
        email:     r.email as string,
        name:      (r.name as string | null) ?? null,
        role:      ((r.roles as string[]) ?? ['professional'])[0],
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
      const { error } = await supabase
        .from('clinic_invites')
        .delete()
        .eq('id', inviteId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinic-invites', profile?.clinicId] }),
  })
}