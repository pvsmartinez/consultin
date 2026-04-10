/**
 * Canonical table and column name constants for Consultin edge functions.
 *
 * Use these instead of raw strings in `.from()` and `.select()` calls so that
 * a typo or rename is caught in one place rather than silently breaking queries.
 *
 * Import example:
 *   import { T, COL } from '../_shared/tables.ts'
 *   supabase.from(T.APPOINTMENTS).select(`id, ${COL.APPOINTMENTS.CHARGE_AMOUNT_CENTS}`)
 */

// ─── Table names ─────────────────────────────────────────────────────────────

export const T = {
  APPOINTMENTS:         'appointments',
  AVAILABILITY_SLOTS:   'availability_slots',
  CLINIC_INVITES:       'clinic_invites',
  CLINIC_NOTIFICATIONS: 'clinic_notifications',
  CLINIC_ROOMS:         'clinic_rooms',
  CLINIC_SIGNUP_REQUESTS: 'clinic_signup_requests',
  CLINIC_STAFF_REQUESTS: 'clinic_staff_requests',
  CLINICS:              'clinics',
  NOTIFICATION_LOG:     'notification_log',
  PATIENTS:             'patients',
  PROFESSIONALS:        'professionals',
  ROOM_CLOSURES:        'room_closures',
  SERVICE_TYPES:        'service_types',
  USER_PROFILES:        'user_profiles',
  WA_PLATFORM_MESSAGES: 'wa_platform_messages',
  WA_PLATFORM_USERS:    'wa_platform_users',
  WHATSAPP_FAQS:        'whatsapp_faqs',
  WHATSAPP_MESSAGES:    'whatsapp_messages',
  WHATSAPP_OTPS:        'whatsapp_otps',
  WHATSAPP_SESSIONS:    'whatsapp_sessions',
  WHATSAPP_TEMPLATES:   'whatsapp_templates',
} as const

// ─── Column names (only tables with history of typos / renames) ───────────────

export const COL = {
  APPOINTMENTS: {
    ID:                   'id',
    CLINIC_ID:            'clinic_id',
    PATIENT_ID:           'patient_id',
    PROFESSIONAL_ID:      'professional_id',
    SERVICE_TYPE_ID:      'service_type_id',
    ROOM_ID:              'room_id',
    STARTS_AT:            'starts_at',
    ENDS_AT:              'ends_at',
    STATUS:               'status',
    NOTES:                'notes',
    CHARGE_AMOUNT_CENTS:  'charge_amount_cents',   // ← NOT charge_cents
    PAID_AMOUNT_CENTS:    'paid_amount_cents',
    PAID_AT:              'paid_at',
    PAYMENT_METHOD:       'payment_method',
    PROFESSIONAL_FEE_CENTS: 'professional_fee_cents',
  },

  USER_PROFILES: {
    ID:                   'id',
    CLINIC_ID:            'clinic_id',
    NAME:                 'name',
    PHONE:                'phone',
    ROLES:                'roles',                  // ← array, NOT role (singular)
    PERMISSION_OVERRIDES: 'permission_overrides',
    IS_SUPER_ADMIN:       'is_super_admin',
    NOTIFICATION_PHONE:   'notification_phone',
  },

  CLINICS: {
    ID:                       'id',
    NAME:                     'name',
    JOIN_CODE:                'join_code',
    MODULES_ENABLED:          'modules_enabled',
    SUBSCRIPTION_TIER:        'subscription_tier',
    SUBSCRIPTION_STATUS:      'subscription_status',
    TRIAL_ENDS_AT:            'trial_ends_at',
    BILLING_OVERRIDE_ENABLED: 'billing_override_enabled',
    WA_AI_MODEL:              'wa_ai_model',
    WA_AI_CUSTOM_PROMPT:      'wa_ai_custom_prompt',
    WA_AI_ALLOW_SCHEDULE:     'wa_ai_allow_schedule',
    WA_AI_ALLOW_CONFIRM:      'wa_ai_allow_confirm',
    WA_AI_ALLOW_CANCEL:       'wa_ai_allow_cancel',
    WHATSAPP_ENABLED:         'whatsapp_enabled',
    WHATSAPP_PHONE_NUMBER_ID: 'whatsapp_phone_number_id',
  },

  AVAILABILITY_SLOTS: {
    ID:              'id',
    CLINIC_ID:       'clinic_id',
    PROFESSIONAL_ID: 'professional_id',
    ROOM_ID:         'room_id',
    WEEKDAY:         'weekday',
    START_TIME:      'start_time',
    END_TIME:        'end_time',
    ACTIVE:          'active',
  },

  CLINIC_ROOMS: {
    ID:        'id',
    CLINIC_ID: 'clinic_id',
    NAME:      'name',
    COLOR:     'color',
    ACTIVE:    'active',
  },

  SERVICE_TYPES: {
    ID:               'id',
    CLINIC_ID:        'clinic_id',
    NAME:             'name',
    DURATION_MINUTES: 'duration_minutes',
    PRICE_CENTS:      'price_cents',
    ACTIVE:           'active',
    COLOR:            'color',
  },

  PROFESSIONALS: {
    ID:         'id',
    CLINIC_ID:  'clinic_id',
    NAME:       'name',
    EMAIL:      'email',
    PHONE:      'phone',
    SPECIALTY:  'specialty',
    COUNCIL_ID: 'council_id',
    ACTIVE:     'active',
  },

  PATIENTS: {
    ID:         'id',
    CLINIC_ID:  'clinic_id',
    NAME:       'name',
    PHONE:      'phone',
    EMAIL:      'email',
    CPF:        'cpf',
    BIRTH_DATE: 'birth_date',
    NOTES:      'notes',
  },

  CLINIC_STAFF_REQUESTS: {
    ID:              'id',
    CLINIC_ID:       'clinic_id',
    REQUESTER_NAME:  'requester_name',
    REQUESTER_EMAIL: 'requester_email',
    REQUESTER_PHONE: 'requester_phone',
    ROLE:            'role',               // singular — this table has role (string), not roles (array)
    STATUS:          'status',
    REQUESTED_AT:    'requested_at',
    REVIEWED_AT:     'reviewed_at',
    REVIEWED_BY:     'reviewed_by',
  },
} as const
