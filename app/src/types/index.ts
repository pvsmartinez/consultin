// ─── Clinic ──────────────────────────────────────────────────────────────────
export interface WorkingHours {
  start: string  // "08:00"
  end: string    // "18:00"
}

export interface Clinic {
  id: string
  name: string
  cnpj: string | null
  phone: string | null
  email: string | null
  address: string | null
  city: string | null
  state: string | null
  slotDurationMinutes: number
  workingHours: Partial<Record<'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun', WorkingHours>>
  // Patient form config
  customPatientFields: CustomFieldDef[]
  patientFieldConfig: FieldConfig
  // Professional form config
  customProfessionalFields: CustomFieldDef[]
  professionalFieldConfig: FieldConfig
  // Anamnese configurável
  anamnesisFields: CustomFieldDef[]
  // Patient registration & payment policies
  allowSelfRegistration: boolean
  acceptedPaymentMethods: string[]  // ['cash','pix','credit_card','debit_card']
  paymentTiming: 'before_appointment' | 'after_appointment' | 'flexible'
  cancellationHours: number         // hours before appt. 0=always, -1=never
  // Onboarding
  onboardingCompleted: boolean
  createdAt: string
  // Asaas billing
  paymentsEnabled: boolean
  asaasCustomerId: string | null
  asaasSubscriptionId: string | null
  subscriptionStatus: 'ACTIVE' | 'OVERDUE' | 'INACTIVE' | 'EXPIRED' | null
  // WhatsApp Business
  whatsappEnabled: boolean
  whatsappPhoneNumberId: string | null
  whatsappPhoneDisplay: string | null
  whatsappWabaId: string | null
  whatsappVerifyToken: string | null
  waRemindersd1: boolean
  waRemindersd0: boolean
  waProfessionalAgenda: boolean
  waAttendantInbox: boolean
  waAiModel: string
  waAiCustomPrompt: string | null
  waAiAllowSchedule: boolean
  waAiAllowConfirm: boolean
  waAiAllowCancel: boolean
  // Booking config
  allowProfessionalSelection: boolean
}

// ─── Custom fields (clinic-defined) ──────────────────────────────────────────
export type CustomFieldType = 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'boolean'

export interface CustomFieldDef {
  key: string
  label: string
  type: CustomFieldType
  required: boolean
  options?: string[]   // only for 'select' and 'multiselect'
}

// ─── Built-in field toggle config ────────────────────────────────────────────
// Record<fieldKey, boolean> — missing key means true (visible by default)
export type FieldConfig = Record<string, boolean>

/** Built-in patient fields that clinics can toggle on/off (name is always on) */
export const PATIENT_BUILTIN_FIELDS: { key: string; label: string; group: string }[] = [
  { key: 'cpf',         label: 'CPF',               group: 'Dados Pessoais' },
  { key: 'rg',          label: 'RG',                group: 'Dados Pessoais' },
  { key: 'birthDate',   label: 'Data de nascimento', group: 'Dados Pessoais' },
  { key: 'sex',         label: 'Sexo',              group: 'Dados Pessoais' },
  { key: 'phone',       label: 'Telefone / WhatsApp', group: 'Contato' },
  { key: 'email',       label: 'E-mail',            group: 'Contato' },
  { key: 'address',     label: 'Endereço completo',  group: 'Endereço' },
  { key: 'notes',       label: 'Observações',        group: 'Observações' },
]

/** Built-in professional fields that clinics can toggle on/off (name is always on) */
export const PROFESSIONAL_BUILTIN_FIELDS: { key: string; label: string }[] = [
  { key: 'specialty',  label: 'Especialidade' },
  { key: 'councilId',  label: 'Conselho (CRM / CRO / CREFITO)' },
  { key: 'phone',      label: 'Telefone' },
  { key: 'email',      label: 'E-mail' },
]

// ─── Patient ─────────────────────────────────────────────────────────────────
export type Sex = 'M' | 'F' | 'O'

export const SEX_LABELS: Record<Sex, string> = {
  M: 'Masculino',
  F: 'Feminino',
  O: 'Outro',
}

export interface Patient {
  id: string
  clinicId: string
  userId: string | null       // auth.users.id — set when patient has a portal account
  // Core fields
  name: string
  cpf: string | null
  rg: string | null
  birthDate: string | null      // YYYY-MM-DD
  sex: Sex | null
  phone: string | null
  email: string | null
  // Address
  addressStreet: string | null
  addressNumber: string | null
  addressComplement: string | null
  addressNeighborhood: string | null
  addressCity: string | null
  addressState: string | null
  addressZip: string | null     // CEP
  notes: string | null
  // Flexible per-clinic extras
  customFields: Record<string, unknown>
  // Anamnese (respostas do paciente às perguntas configuradas pela clínica)
  anamnesisData: Record<string, unknown>
  createdAt: string
}

// anamnesisData is managed separately — not part of the patient creation/edit form
export type PatientInput = Omit<Patient, 'id' | 'clinicId' | 'createdAt' | 'anamnesisData'>

// ─── Professional ────────────────────────────────────────────────────────────
export interface Professional {
  id: string
  clinicId: string
  userId: string | null      // auth.users.id — set when professional accepted invite
  name: string
  specialty: string | null
  councilId: string | null     // CRM / CRO / CREFITO etc.
  phone: string | null
  email: string | null
  active: boolean
  customFields: Record<string, unknown>
  createdAt: string
}

export type ProfessionalInput = Omit<Professional, 'id' | 'clinicId' | 'userId' | 'createdAt'>

// Junction: one user ↔ one clinic (professionals can work at multiple clinics)
export interface UserClinicMembership {
  id: string
  userId: string
  clinicId: string
  clinicName?: string  // joined from clinics
  professionalId: string | null
  active: boolean
  createdAt: string
}

// ─── Appointment ─────────────────────────────────────────────────────────────
export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'no_show'

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled:  'Agendado',
  confirmed:  'Confirmado',
  completed:  'Realizado',
  cancelled:  'Cancelado',
  no_show:    'Não compareceu',
}

export const APPOINTMENT_STATUS_COLORS: Record<AppointmentStatus, string> = {
  scheduled:  'bg-blue-100 text-blue-700',
  confirmed:  'bg-green-100 text-green-700',
  completed:  'bg-gray-100 text-gray-600',
  cancelled:  'bg-red-100 text-red-600',
  no_show:    'bg-yellow-100 text-yellow-700',
}

// ─── Service Type (appointment type with price + duration + color) ──────────
export interface ServiceType {
  id: string
  clinicId: string
  name: string
  durationMinutes: number
  priceCents: number | null   // null = define at booking
  color: string               // hex
  active: boolean
  createdAt: string
}

export type ServiceTypeInput = Omit<ServiceType, 'id' | 'clinicId' | 'createdAt'>

export const SERVICE_TYPE_COLORS = [
  '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#f59e0b', '#22c55e', '#14b8a6', '#64748b',
]

// Accepted payment method options (configurable per clinic)
export const PAYMENT_METHOD_OPTIONS: { value: string; label: string }[] = [
  { value: 'cash',          label: 'Dinheiro' },
  { value: 'pix',           label: 'Pix' },
  { value: 'credit_card',   label: 'Cartão de crédito' },
  { value: 'debit_card',    label: 'Cartão de débito' },
  { value: 'transfer',      label: 'Transferência bancária' },
  { value: 'insurance',     label: 'Convênio' },
]

export const PAYMENT_TIMING_LABELS: Record<string, string> = {
  before_appointment: 'Antes da consulta (no agendamento)',
  after_appointment:  'Após a consulta',
  flexible:           'Flexível (a combinar)',
}

// ─── Clinic Room ────────────────────────────────────────────────────────────
export interface ClinicRoom {
  id: string
  clinicId: string
  name: string
  color: string  // hex, e.g. #6366f1
  active: boolean
  createdAt: string
}

export interface WhatsappFaq {
  id: string
  clinicId: string
  question: string
  answer: string
  active: boolean
  sortOrder: number
  createdAt: string
}

export interface Appointment {
  id: string
  clinicId: string
  patientId: string
  professionalId: string
  startsAt: string              // ISO 8601 UTC
  endsAt: string
  status: AppointmentStatus
  notes: string | null
  roomId: string | null         // FK to clinic_rooms
  serviceTypeId: string | null  // FK to service_types
  chargeAmountCents: number | null
  paidAmountCents: number | null
  professionalFeeCents: number | null
  paidAt: string | null
  paymentMethod: string | null  // manual payment method (cash, pix, credit_card, ...)
  createdAt: string
  // Joined relations (fetched with select)
  patient?: Pick<Patient, 'id' | 'name' | 'phone' | 'cpf'>
  professional?: Pick<Professional, 'id' | 'name' | 'specialty'>
  clinicRoom?: Pick<ClinicRoom, 'id' | 'name' | 'color'>
}

// ─── Availability slot ────────────────────────────────────────────────────────
export interface AvailabilitySlot {
  id: string
  clinicId: string
  professionalId: string
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6   // 0=Sun … 6=Sat
  startTime: string   // "HH:MM"
  endTime: string
  active: boolean
  roomId: string | null       // optional room assignment
  weekParity: 'even' | 'odd' | null  // null=every week, even/odd ISO week parity
}

// ─── Auth ────────────────────────────────────────────────────────────────────

/**
 * admin        → clínica admin  — full access to all features
 * receptionist → atendente      — agenda + cadastro, no financial settings
 * professional → médico/dentista — own schedule + patient history
 * patient      → paciente       — own appointments + own profile only
 */
export type UserRole = 'admin' | 'receptionist' | 'professional' | 'patient'

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin:         'Administrador',
  receptionist:  'Atendente',
  professional:  'Profissional',
  patient:       'Paciente',
}

export interface UserProfile {
  id: string
  clinicId: string | null  // null for super admins not yet assigned to a clinic
  roles: UserRole[]
  name: string
  isSuperAdmin: boolean
  avatarUrl: string | null
  permissionOverrides: Partial<Record<string, boolean>>  // per-user overrides on top of role defaults
}

// Role priority for display and RLS fallback (highest first)
const ROLE_PRIORITY: UserRole[] = ['admin', 'receptionist', 'professional', 'patient']

/** Returns the highest-privilege role from a roles array. */
export function primaryRole(roles: UserRole[] | undefined | null): UserRole {
  if (!Array.isArray(roles)) return 'patient'
  for (const r of ROLE_PRIORITY) {
    if (roles.includes(r)) return r
  }
  return 'patient'
}

/** Returns merged permission map — true if ANY role grants the permission, then overrides applied. */
export function mergedPermissions(
  roles: UserRole[] | undefined | null,
  overrides: Partial<Record<string, boolean>> = {},
): Record<string, boolean> {
  if (!Array.isArray(roles)) return Object.fromEntries(Object.keys(ROLE_PERMISSIONS.admin).map(k => [k, overrides[k] ?? false]))
  const keys = Object.keys(ROLE_PERMISSIONS.admin)
  const base = Object.fromEntries(
    keys.map(k => [k, roles.some(r => (ROLE_PERMISSIONS[r] as Record<string, boolean>)[k] === true)])
  )
  // Per-user overrides win over role defaults
  const overrideEntries = Object.entries(overrides).filter(
    (entry): entry is [string, boolean] => entry[1] !== undefined
  )
  return { ...base, ...Object.fromEntries(overrideEntries) }
}

// What each role is allowed to do
export const ROLE_PERMISSIONS = {
  admin: {
    canViewPatients:       true,
    canManagePatients:     true,
    canManageAgenda:       true,
    canManageProfessionals: true,
    canViewFinancial:      true,
    canManageSettings:     true,
    canViewWhatsApp:       true,  // inbox: admin always
    canManageOwnAvailability: false,
  },
  receptionist: {
    canViewPatients:       true,
    canManagePatients:     true,
    canManageAgenda:       true,
    canManageProfessionals: false,
    canViewFinancial:      true,   // recepcionista opera o caixa da clínica
    canManageSettings:     false,
    canViewWhatsApp:       true,  // inbox: receptionist is primary user
    canManageOwnAvailability: false,
  },
  professional: {
    canViewPatients:       true,
    canManagePatients:     false,
    canManageAgenda:       true,
    canManageProfessionals: false,
    canViewFinancial:      false,
    canManageSettings:     false,
    canViewWhatsApp:       false,
    canManageOwnAvailability: true,  // professional self-manages their schedule
  },
  patient: {
    canViewPatients:       false,
    canManagePatients:     false,
    canManageAgenda:       false,
    canManageProfessionals: false,
    canViewFinancial:      false,
    canManageSettings:     false,
    canViewWhatsApp:       false,
    canManageOwnAvailability: false,
  },
} satisfies Record<UserRole, Record<string, boolean>>

/** Typed key for any permission in ROLE_PERMISSIONS */
export type PermissionKey = keyof typeof ROLE_PERMISSIONS['admin']

/** Human-readable labels for each permission (used in admin UI) */
export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  canViewPatients:          'Ver pacientes',
  canManagePatients:        'Editar pacientes',
  canManageAgenda:          'Gerenciar agenda',
  canManageProfessionals:   'Gerenciar profissionais',
  canViewFinancial:         'Ver financeiro',
  canManageSettings:        'Configurações da clínica',
  canViewWhatsApp:          'Caixa de entrada WhatsApp',
  canManageOwnAvailability: 'Gerenciar própria disponibilidade',
}

// ─── Clinic Invite ────────────────────────────────────────────────────────────
export interface ClinicInvite {
  id: string
  clinicId: string
  clinicName?: string   // joined from clinics table
  email: string
  roles: UserRole[]
  name: string | null
  invitedBy: string | null
  usedAt: string | null
  createdAt: string
}

// ─── Generated Supabase schema types (auto-generated — do not edit by hand) ───
// Re-run: SUPABASE_ACCESS_TOKEN=<PAT> npx supabase@2 gen types typescript --project-id bpipnidvqygjjfhwfhtv > src/types/database.ts
export type { Database, Json } from './database'

// ─── Asaas Billing ───────────────────────────────────────────────────────────
export type AsaasBillingType = 'PIX' | 'CREDIT_CARD' | 'BOLETO' | 'UNDEFINED'
export type SubscriptionStatus = 'ACTIVE' | 'OVERDUE' | 'INACTIVE' | 'EXPIRED'

export type PaymentStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'RECEIVED'
  | 'OVERDUE'
  | 'REFUNDED'
  | 'CANCELLED'

export type TransferStatus = 'PENDING' | 'TRANSFERRED' | 'FAILED' | 'NOT_APPLICABLE'
export type BankAccountType = 'CONTA_CORRENTE' | 'CONTA_POUPANCA' | 'CONTA_SALARIO'

export interface ProfessionalBankAccount {
  id: string
  clinicId: string
  professionalId: string
  bankCode: string
  bankName: string
  accountType: BankAccountType
  agency: string
  agencyDigit: string | null
  account: string
  accountDigit: string | null
  ownerName: string
  ownerCpfCnpj: string
  asaasTransferId: string | null
  active: boolean
  createdAt: string
}

export type ProfessionalBankAccountInput = Omit<
  ProfessionalBankAccount,
  'id' | 'clinicId' | 'asaasTransferId' | 'createdAt'
>

export interface AppointmentPayment {
  id: string
  clinicId: string
  appointmentId: string
  asaasChargeId: string | null
  paymentMethod: AsaasBillingType | null
  status: PaymentStatus
  amountCents: number
  pixKey: string | null
  pixExpiresAt: string | null
  paidAt: string | null
  transferStatus: TransferStatus
  transferAmountCents: number | null
  asaasTransferId: string | null
  transferredAt: string | null
  notes: string | null
  createdAt: string
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING:   'Pendente',
  CONFIRMED: 'Confirmado',
  RECEIVED:  'Recebido',
  OVERDUE:   'Vencido',
  REFUNDED:  'Estornado',
  CANCELLED: 'Cancelado',
}

export const PAYMENT_STATUS_COLORS: Record<PaymentStatus, string> = {
  PENDING:   'bg-yellow-100 text-yellow-700',
  CONFIRMED: 'bg-blue-100 text-blue-700',
  RECEIVED:  'bg-green-100 text-green-700',
  OVERDUE:   'bg-red-100 text-red-700',
  REFUNDED:  'bg-gray-100 text-gray-500',
  CANCELLED: 'bg-gray-100 text-gray-500',
}

export const TRANSFER_STATUS_LABELS: Record<TransferStatus, string> = {
  PENDING:        'Aguardando',
  TRANSFERRED:    'Repassado',
  FAILED:         'Falhou',
  NOT_APPLICABLE: 'N/A',
}

export const BANK_LIST: { code: string; name: string }[] = [
  { code: '001', name: 'Banco do Brasil' },
  { code: '033', name: 'Santander' },
  { code: '077', name: 'Inter' },
  { code: '104', name: 'Caixa Econômica Federal' },
  { code: '208', name: 'BTG Pactual' },
  { code: '237', name: 'Bradesco' },
  { code: '260', name: 'Nu Pagamentos (Nubank)' },
  { code: '290', name: 'PagSeguro' },
  { code: '341', name: 'Itaú' },
  { code: '336', name: 'C6 Bank' },
  { code: '380', name: 'PicPay' },
  { code: '422', name: 'Safra' },
  { code: '623', name: 'Pan' },
  { code: '655', name: 'Votorantim' },
  { code: '735', name: 'Neon' },
  { code: '748', name: 'Sicredi' },
  { code: '756', name: 'Sicoob' },
  { code: '021', name: 'Banestes' },
  { code: '041', name: 'Banrisul' },
  { code: '212', name: 'Banco Original' },
]

// ─── WhatsApp ─────────────────────────────────────────────────────────────────

export type WhatsAppSessionStatus = 'ai' | 'human' | 'resolved'

export interface WhatsAppSession {
  id: string
  clinicId: string
  patientId: string | null
  waPhone: string
  status: WhatsAppSessionStatus
  aiDraft: string | null
  lastMessageAt: string
  createdAt: string
  // joined
  patientName?: string | null
}

export type WhatsAppMessageDirection = 'inbound' | 'outbound'
export type WhatsAppMessageType     = 'text' | 'template' | 'interactive' | 'image' | 'document' | 'audio'
export type WhatsAppSentBy          = 'patient' | 'ai' | 'attendant' | 'system'
export type WhatsAppDeliveryStatus  = 'sent' | 'delivered' | 'read' | 'failed'

export interface WhatsAppMessage {
  id: string
  sessionId: string
  clinicId: string
  direction: WhatsAppMessageDirection
  waMessageId: string | null
  body: string | null   // null after LGPD retention purge
  messageType: WhatsAppMessageType
  sentBy: WhatsAppSentBy
  deliveryStatus: WhatsAppDeliveryStatus | null
  createdAt: string
}

export interface WhatsAppTemplate {
  id: string
  clinicId: string
  templateKey: string
  metaTemplateName: string
  language: string
  bodyPreview: string
  enabled: boolean
  createdAt: string
}

/** Available OpenRouter models for WhatsApp AI agent */
export const WA_AI_MODELS: { value: string; label: string; free?: boolean }[] = [
  { value: 'google/gemini-2.0-flash-exp:free',          label: 'Gemini 2.0 Flash (Google) — gratuito ✓',  free: true },
  { value: 'google/gemini-flash-1.5-8b:free',           label: 'Gemini Flash 1.5 8B (Google) — gratuito ✓', free: true },
  { value: 'meta-llama/llama-3.3-70b-instruct:free',    label: 'Llama 3.3 70B (Meta) — gratuito ✓',        free: true },
  { value: 'deepseek/deepseek-chat:free',               label: 'DeepSeek V3 — gratuito ✓',                  free: true },
  { value: 'openai/gpt-4o-mini',                        label: 'GPT-4o Mini (OpenAI)' },
  { value: 'google/gemini-flash-1.5',                   label: 'Gemini Flash 1.5 (Google)' },
  { value: 'anthropic/claude-3-haiku',                  label: 'Claude 3 Haiku (Anthropic)' },
]

// ─── Patient Records (notes + attachments) ────────────────────────────────────
export type RecordType = 'note' | 'attachment'

export interface PatientRecord {
  id: string
  clinicId: string
  patientId: string
  appointmentId: string | null
  createdBy: string             // user_profiles.id
  createdByName: string | null  // joined from user_profiles.name
  type: RecordType
  content: string | null        // text content for notes
  fileName: string | null       // original filename for attachments
  filePath: string | null       // path inside "patient-files" bucket
  fileMime: string | null
  fileSize: number | null
  createdAt: string
}
