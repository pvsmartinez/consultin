/**
 * Shared row-mappers: convert Supabase snake_case DB rows → camelCase domain types.
 * Single source of truth — import these instead of defining local mapRow functions.
 */
import type { Appointment, Clinic, Patient, Professional, ServiceType } from '../types'

// ─── Appointment ──────────────────────────────────────────────────────────────

export function mapAppointment(row: Record<string, unknown>): Appointment {
  return {
    id:                   row.id as string,
    clinicId:             row.clinic_id as string,
    patientId:            row.patient_id as string,
    professionalId:       row.professional_id as string,
    startsAt:             row.starts_at as string,
    endsAt:               row.ends_at as string,
    status:               row.status as Appointment['status'],
    notes:                (row.notes as string) ?? null,
    roomId:               (row.room_id as string) ?? null,
    serviceTypeId:        (row.service_type_id as string) ?? null,
    chargeAmountCents:    (row.charge_amount_cents as number) ?? null,
    paidAmountCents:      (row.paid_amount_cents as number) ?? null,
    professionalFeeCents: (row.professional_fee_cents as number) ?? null,
    paidAt:               (row.paid_at as string) ?? null,
    paymentMethod:        (row.payment_method as string) ?? null,
    createdAt:            row.created_at as string,
    patient:              row.patient as Appointment['patient'],
    professional:         row.professional as Appointment['professional'],
    clinicRoom:           row.clinic_room as Appointment['clinicRoom'],
  }
}

// ─── Clinic ───────────────────────────────────────────────────────────────────

export function mapClinic(r: Record<string, unknown>): Clinic {
  return {
    id:                       r.id as string,
    name:                     r.name as string,
    cnpj:                     (r.cnpj as string) ?? null,
    phone:                    (r.phone as string) ?? null,
    email:                    (r.email as string) ?? null,
    address:                  (r.address as string) ?? null,
    city:                     (r.city as string) ?? null,
    state:                    (r.state as string) ?? null,
    slotDurationMinutes:      (r.slot_duration_minutes as number) ?? 30,
    workingHours:             (r.working_hours as Clinic['workingHours']) ?? {},
    customPatientFields:      (r.custom_patient_fields as Clinic['customPatientFields']) ?? [],
    patientFieldConfig:       (r.patient_field_config as Clinic['patientFieldConfig']) ?? {},
    customProfessionalFields: (r.custom_professional_fields as Clinic['customProfessionalFields']) ?? [],
    professionalFieldConfig:  (r.professional_field_config as Clinic['professionalFieldConfig']) ?? {},
    anamnesisFields:          (r.anamnesis_fields as Clinic['anamnesisFields']) ?? [],
    onboardingCompleted:      (r.onboarding_completed as boolean) ?? false,
    createdAt:                r.created_at as string,
    modulesEnabled:           (r.modules_enabled as string[]) ?? [],
    billingOverrideEnabled:   (r.billing_override_enabled as boolean) ?? false,
    paymentsEnabled:          ((r.payments_enabled as boolean) ?? false) || ((r.billing_override_enabled as boolean) ?? false),
    asaasCustomerId:          (r.asaas_customer_id as string) ?? null,
    asaasSubscriptionId:      (r.asaas_subscription_id as string) ?? null,
    subscriptionStatus:       (r.subscription_status as Clinic['subscriptionStatus']) ?? null,
    subscriptionTier:         (r.subscription_tier as Clinic['subscriptionTier']) ?? 'trial',
    trialEndsAt:              (r.trial_ends_at as string) ?? null,
    whatsappEnabled:          (r.whatsapp_enabled as boolean) ?? false,
    whatsappPhoneNumberId:    (r.whatsapp_phone_number_id as string) ?? null,
    whatsappPhoneDisplay:     (r.whatsapp_phone_display as string) ?? null,
    whatsappWabaId:           (r.whatsapp_waba_id as string) ?? null,
    whatsappVerifyToken:      (r.whatsapp_verify_token as string) ?? null,
    waRemindersd1:            (r.wa_reminders_d1 as boolean) ?? true,
    waRemindersd0:            (r.wa_reminders_d0 as boolean) ?? true,
    waReminderD1Text:         (r.wa_reminder_d1_text as string | null) ?? null,
    waReminderD0Text:         (r.wa_reminder_d0_text as string | null) ?? null,
    waProfessionalAgenda:     (r.wa_professional_agenda as boolean) ?? false,
    waAttendantInbox:         (r.wa_attendant_inbox as boolean) ?? true,
    waAiModel:                (r.wa_ai_model as string) ?? 'google/gemini-2.0-flash-exp:free',
    waAiCustomPrompt:         (r.wa_ai_custom_prompt as string | null) ?? null,
    waAiAllowSchedule:        (r.wa_ai_allow_schedule as boolean) ?? false,
    waAiAllowConfirm:         (r.wa_ai_allow_confirm as boolean) ?? true,
    waAiAllowCancel:          (r.wa_ai_allow_cancel as boolean) ?? true,
    allowProfessionalSelection: (r.allow_professional_selection as boolean) ?? true,
    allowSelfRegistration:    (r.allow_self_registration as boolean) ?? true,
    acceptedPaymentMethods:   (r.accepted_payment_methods as string[]) ?? ['cash','pix','credit_card','debit_card'],
    paymentTiming:            (r.payment_timing as Clinic['paymentTiming']) ?? 'flexible',
    cancellationHours:        (r.cancellation_hours as number) ?? 24,
  }
}

// ─── ServiceType ───────────────────────────────────────────────
export function mapServiceType(row: Record<string, unknown>): ServiceType {
  return {
    id:              row.id as string,
    clinicId:        row.clinic_id as string,
    name:            row.name as string,
    durationMinutes: (row.duration_minutes as number) ?? 30,
    priceCents:      (row.price_cents as number) ?? null,
    color:           (row.color as string) ?? '#0d9488',
    active:          (row.active as boolean) ?? true,
    createdAt:       row.created_at as string,
  }
}

// ─── Patient ─────────────────────────────────────────────────────────────────────────────

export function mapPatient(row: Record<string, unknown>): Patient {
  return {
    id:                   row.id as string,
    clinicId:             row.clinic_id as string,
    userId:               (row.user_id as string) ?? null,
    name:                 row.name as string,
    cpf:                  (row.cpf as string) ?? null,
    rg:                   (row.rg as string) ?? null,
    birthDate:            (row.birth_date as string) ?? null,
    sex:                  (row.sex as Patient['sex']) ?? null,
    phone:                (row.phone as string) ?? null,
    email:                (row.email as string) ?? null,
    addressStreet:        (row.address_street as string) ?? null,
    addressNumber:        (row.address_number as string) ?? null,
    addressComplement:    (row.address_complement as string) ?? null,
    addressNeighborhood:  (row.address_neighborhood as string) ?? null,
    addressCity:          (row.address_city as string) ?? null,
    addressState:         (row.address_state as string) ?? null,
    addressZip:           (row.address_zip as string) ?? null,
    notes:                (row.notes as string) ?? null,
    customFields:         (row.custom_fields as Record<string, unknown>) ?? {},
    anamnesisData:        (row.anamnesis_data as Record<string, unknown>) ?? {},
    createdAt:            row.created_at as string,
  }
}

// ─── Professional ─────────────────────────────────────────────────────────────

export function mapProfessional(r: Record<string, unknown>): Professional {
  return {
    id:           r.id as string,
    clinicId:     r.clinic_id as string,
    userId:       (r.user_id as string) ?? null,
    name:         r.name as string,
    specialty:    (r.specialty as string) ?? null,
    councilId:    (r.council_id as string) ?? null,
    phone:        (r.phone as string) ?? null,
    email:        (r.email as string) ?? null,
    photoUrl:     (r.photo_url as string) ?? null,
    bio:          (r.bio as string) ?? null,
    active:       r.active as boolean,
    customFields: (r.custom_fields as Record<string, unknown>) ?? {},
    createdAt:    r.created_at as string,
  }
}
