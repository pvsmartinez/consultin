/**
 * Edge Function: whatsapp-platform-agent
 *
 * Conversational onboarding bot for Consultin's own WhatsApp number.
 *
 * Handles three flows:
 *   A) CREATE CLINIC — search for similar names → confirm → create immediately (no review)
 *                      → send email invite → notify Pedro on Telegram
 *   B) JOIN CLINIC   — staff join via a 6-char join code shared by the clinic owner
 *   C) CONFIGURE BOT — existing clinic admins configure their WA bot via chat
 *
 * Memory: wa_platform_users (per phone) + wa_platform_messages (rolling history).
 * A mini tool-loop is used for search_clinics so the AI can search before acting.
 * Called by whatsapp-webhook when phone_number_id === PLATFORM_PHONE_NUMBER_ID.
 *
 * Required env vars (auto-injected or via `supabase secrets set`):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   OPENROUTER_API_KEY
 *   PLATFORM_PHONE_NUMBER_ID, PLATFORM_WA_TOKEN
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_PEDRO_CHAT_ID
 *   SITE_URL  (e.g. https://consultin.pmatz.com)
 */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { T, COL }       from '../_shared/tables.ts'
import {
  buildCrossClinicConflictReply,
  evaluateProfileProvisioning,
  findExactClinicNameConflict,
  mergeRoles,
  resolvePlatformFastPath,
} from './logic.ts'

const SUPABASE_URL       = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SRK       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')!
const PLATFORM_PHONE_ID  = Deno.env.get('PLATFORM_PHONE_NUMBER_ID') ?? ''
const PLATFORM_WA_TOKEN  = Deno.env.get('PLATFORM_WA_TOKEN') ?? ''
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''
const TELEGRAM_CHAT_ID   = Deno.env.get('TELEGRAM_PEDRO_CHAT_ID') ?? ''
const SITE_URL           = (Deno.env.get('SITE_URL') ?? 'https://consultin.pmatz.com').replace(/\/$/, '')

// ─── Permission defaults (mirrors frontend ROLE_PERMISSIONS) ─────────────────
const PERM_DEFAULTS: Record<string, Record<string, boolean>> = {
  admin:        { canViewPatients: true,  canManagePatients: true,  canManageAgenda: true,  canManageProfessionals: true,  canViewFinancial: true,  canManageSettings: true,  canViewWhatsApp: true,  canManageOwnAvailability: false },
  receptionist: { canViewPatients: true,  canManagePatients: true,  canManageAgenda: true,  canManageProfessionals: false, canViewFinancial: true,  canManageSettings: false, canViewWhatsApp: true,  canManageOwnAvailability: false },
  professional: { canViewPatients: true,  canManagePatients: false, canManageAgenda: true,  canManageProfessionals: false, canViewFinancial: false, canManageSettings: false, canViewWhatsApp: false, canManageOwnAvailability: true  },
}

function computeUserPermissions(roles: string[], overrides: Record<string, boolean>): Record<string, boolean> {
  const keys   = Object.keys(PERM_DEFAULTS.admin)
  const merged = Object.fromEntries(keys.map(k => [k, roles.some(r => PERM_DEFAULTS[r]?.[k] === true)]))
  return { ...merged, ...overrides }
}

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'
const META_GRAPH_BASE = 'https://graph.facebook.com/v21.0'

// ─── Action names ────────────────────────────────────────────────────────────
// Single source of truth: used in both buildSystemPrompt() and executeSideEffect().
// If you add a new action, add it here first — the TypeScript compiler will then
// flag every place that needs to handle it.
const A = {
  // Utility
  REPLY:                        'reply',
  REPLY_WITH_BUTTONS:           'reply_with_buttons',
  SAVE_INFO:                    'save_info',
  // Onboarding — clinic creation
  SEARCH_CLINICS:               'search_clinics',
  CREATE_CLINIC_NOW:            'create_clinic_now',
  // Onboarding — join / request
  VERIFY_JOIN_CODE:             'verify_join_code',
  JOIN_CLINIC:                  'join_clinic',
  REQUEST_CLINIC_MEMBERSHIP:    'request_clinic_membership',
  // Staff management
  APPROVE_STAFF_REQUEST:        'approve_staff_request',
  REJECT_STAFF_REQUEST:         'reject_staff_request',
  INVITE_STAFF_DIRECTLY:        'invite_staff_directly',
  UPDATE_MEMBER_PERMISSIONS:    'update_member_permissions',
  // Appointments
  UPDATE_APPOINTMENT_STATUS:    'update_appointment_status',
  RESCHEDULE_APPOINTMENT:       'reschedule_appointment',
  SCHEDULE_APPOINTMENT:         'schedule_appointment',
  SEARCH_AVAILABLE_SLOTS:       'search_available_slots',
  // Patients
  SEARCH_PATIENTS:              'search_patients',
  CREATE_PATIENT:               'create_patient',
  // Clinic config
  CONFIGURE_BOT:                'configure_bot',
  // Profile & team
  UPDATE_OWN_PROFILE:           'update_own_profile',
  MANAGE_PROFESSIONAL:          'manage_professional',
  MANAGE_SERVICE_TYPE:          'manage_service_type',
  MANAGE_ROOM:                  'manage_room',
  CLOSE_ROOM:                   'close_room',
  UPDATE_OWN_AVAILABILITY:      'update_own_availability',
} as const

type ActionName = typeof A[keyof typeof A]

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlatformAgentRequest {
  fromPhone:    string
  messageText:  string
  waMessageId?: string
  buttonReplyId?: string
}

interface PlatformBotState {
  pendingJoinCode?: string | null
  lastVerifiedJoinCode?: {
    code: string
    found: boolean
    clinicId?: string | null
    clinicName?: string | null
  } | null
}

interface PlatformUser {
  id:             string
  phone:          string
  name:           string | null
  email:          string | null
  linked_user_id: string | null
  notes:          string | null
  bot_state:      PlatformBotState | null
}

interface ClinicInfo {
  id:       string
  name:     string
  role:     string
  joinCode?: string
}

interface ExistingProfileSnapshot {
  clinicId: string | null
  clinicName: string | null
  roles: string[]
}

interface AuthProvisioningResult {
  userId: string | null
  createdNewAuthUser: boolean
}

interface ClinicBotConfig {
  wa_ai_model:          string | null
  wa_ai_custom_prompt:  string | null
  wa_ai_allow_schedule: boolean
  wa_ai_allow_confirm:  boolean
  wa_ai_allow_cancel:   boolean
}

interface PlatformAction {
  action:             ActionName
  replyText:          string
  // reply_with_buttons
  buttons?:           { id: string; title: string }[]
  // save_info
  name?:              string
  email?:             string
  // search_clinics (tool call)
  clinicName?:        string
  // create_clinic_now
  responsibleName?:   string
  phone?:             string
  // verify_join_code / join_clinic
  joinCode?:          string
  role?:              string    // 'professional' | 'receptionist'
  // configure_bot
  clinicId?:          string
  customPrompt?:      string
  clearCustomPrompt?: boolean
  allowSchedule?:     boolean
  allowConfirm?:      boolean
  allowCancel?:       boolean
  aiModel?:           string
  // request_clinic_membership / approve_staff_request / reject / invite_staff_directly
  requestId?:         string
  staffName?:         string
  staffEmail?:        string
  staffPhone?:        string
  // ── Management: appointments ─────────────────────────────────────────────
  appointmentId?:      string
  newStatus?:          string   // confirmed | completed | cancelled | no_show
  startsAt?:           string   // ISO 8601
  endsAt?:             string
  appointmentNotes?:   string
  // ── Management: patients ─────────────────────────────────────────────────
  patientQuery?:       string
  patientId?:          string
  patientName?:        string
  patientPhone?:       string
  patientBirthDate?:   string
  // ── Management: scheduling ───────────────────────────────────────────────
  professionalId?:     string
  searchDate?:         string   // YYYY-MM-DD
  durationMinutes?:    number
  serviceTypeId?:      string
  // ── Management: team / permissions ───────────────────────────────────────
  memberId?:           string
  permissionKey?:      string
  permissionValue?:    boolean
  // ── Management: own profile ──────────────────────────────────────────────
  profileName?:        string
  profilePhone?:       string
  // ── Management: service types ────────────────────────────────────────────
  serviceTypeName?:    string
  serviceTypePriceCents?: number
  serviceTypeDuration?:   number
  serviceTypeColor?:   string
  deleteServiceType?:  boolean
  // ── Management: professionals ────────────────────────────────────────────
  professionalName?:   string
  specialty?:          string
  councilId?:          string
  professionalEmail?:  string
  professionalPhone?:  string
  activeProfessional?: boolean
  // ── Management: rooms ────────────────────────────────────────────────────
  roomId?:             string
  roomName?:           string
  roomColor?:          string
  activeRoom?:         boolean
  closeDate?:          string   // YYYY-MM-DD
  // ── Management: availability ─────────────────────────────────────────────
  availabilitySlots?:  { weekday: number; start_time: string; end_time: string; active: boolean; room_id?: string }[]
}

interface AgendaItem {
  id:               string
  startsAt:         string
  endsAt:           string
  status:           string
  patientName:      string
  patientPhone:     string | null
  professionalName: string
  serviceType:      string | null
  chargeCents:      number | null
}

interface PeriodFinancialSnapshot {
  label:             string
  scheduled:         number
  confirmed:         number
  completed:         number
  cancelled:         number
  totalChargedCents: number
  totalPaidCents:    number
  uniquePatients:    number
  newPatients:       number
  topProfessionalName: string | null
  topProfessionalCount: number
}

const FINANCIAL_PAGE_SIZE = 1000

interface TeamMemberInfo {
  userId: string
  name:   string
  roles:  string[]
  phone:  string | null
}

interface ServiceTypeInfo {
  id:              string
  name:            string
  durationMinutes: number
  priceCents:      number | null
}

interface RoomInfo {
  id:   string
  name: string
}

interface ClinicSnapshot {
  todayLabel:       string
  tomorrowLabel:    string
  todayAgenda:      AgendaItem[]
  tomorrowAgenda:   AgendaItem[]
  financial:        PeriodFinancialSnapshot | null
  weekFinancial:    PeriodFinancialSnapshot | null
  monthFinancial:   PeriodFinancialSnapshot | null
  team:             TeamMemberInfo[]
  serviceTypes:     ServiceTypeInfo[]
  rooms:            RoomInfo[]
  myProfessionalId: string | null
}

function buildDeterministicAdminReply(
  messageText: string,
  snapshot: ClinicSnapshot | null,
  permissions: Record<string, boolean>,
): string | null {
  if (!snapshot || !permissions.canViewFinancial) return null

  const text = messageText.toLowerCase()
  const wantsMonth = /(m[eê]s|mensal|este m[eê]s)/i.test(text)
  const wantsWeek = /(semana|semanal|essa semana|esta semana)/i.test(text)
  const wantsToday = /(hoje|de hoje|do dia|dia de hoje)/i.test(text)

  const period = wantsMonth
    ? snapshot.monthFinancial
    : wantsWeek
      ? snapshot.weekFinancial
      : wantsToday
        ? snapshot.financial
        : null

  if (/(quem.*mais atendeu|quem atendeu mais|profissional destaque|profissional.*mais consultas|mais atendeu)/i.test(text)) {
    if (!period) return 'Ainda não tenho dados suficientes desse período para apontar um profissional destaque.'
    if (!period.topProfessionalName) return 'Ainda não tenho atendimentos suficientes nesse período para apontar um profissional destaque.'
    return `${wantsMonth ? 'No mês' : wantsWeek ? 'Na semana' : 'Hoje'}, quem mais atendeu foi ${period.topProfessionalName} com ${period.topProfessionalCount} atendimento${period.topProfessionalCount > 1 ? 's' : ''}.`
  }

  if (/(pacientes novos|novos pacientes|quantos pacientes novos|qtd de pacientes novos)/i.test(text)) {
    if (!period) return 'Ainda não tenho esse dado consolidado para esse período.'
    return `${wantsMonth ? 'No mês' : wantsWeek ? 'Na semana' : 'Hoje'}, vocês tiveram ${period.newPatients} paciente${period.newPatients === 1 ? '' : 's'} novo${period.newPatients === 1 ? '' : 's'}.`
  }

  if (/(faturamento|receita|cobrado|recebido|quanto entrou|quanto faturou|quanto recebeu)/i.test(text)) {
    if (!period) return null
    const periodLabel = wantsMonth ? 'No mês' : wantsWeek ? 'Na semana' : 'Hoje'
    return [
      `${periodLabel}, o resumo financeiro é:`,
      `• Cobrado: ${formatCentsBRL(period.totalChargedCents)}`,
      `• Recebido: ${formatCentsBRL(period.totalPaidCents)}`,
      `• Consultas concluídas: ${period.completed}`,
      `• Canceladas/faltas: ${period.cancelled}`,
    ].join('\n')
  }

  if (/(resumo.*(m[eê]s|semana|hoje)|como foi.*(m[eê]s|semana)|fechamento.*(m[eê]s|semana))/i.test(text)) {
    if (!period) return null
    const extra = `\n• Novos pacientes: ${period.newPatients}`
    const topProfessional = period.topProfessionalName
      ? `\n• Profissional destaque: ${period.topProfessionalName} (${period.topProfessionalCount})`
      : ''
    return [
      `${wantsMonth ? 'Resumo do mês' : wantsWeek ? 'Resumo da semana' : 'Resumo de hoje'}:`,
      `• Consultas: ${period.scheduled + period.confirmed + period.completed + period.cancelled}`,
      `• Concluídas: ${period.completed}`,
      `• Pacientes únicos: ${period.uniquePatients}`,
      `• Cobrado: ${formatCentsBRL(period.totalChargedCents)}`,
      `• Recebido: ${formatCentsBRL(period.totalPaidCents)}`,
    ].join('\n') + extra + topProfessional
  }

  return null
}

interface StaffRequest {
  id:              string
  clinic_id:       string
  clinic_name:     string
  requester_name:  string
  requester_email: string
  requester_phone: string
  role:            string
}

function normalizePlatformBotState(raw: unknown): PlatformBotState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}

  const state = raw as Record<string, unknown>
  const pendingJoinCode = typeof state.pendingJoinCode === 'string'
    ? state.pendingJoinCode.trim().toUpperCase()
    : null

  const verifiedRaw = state.lastVerifiedJoinCode
  let lastVerifiedJoinCode: PlatformBotState['lastVerifiedJoinCode'] = null
  if (verifiedRaw && typeof verifiedRaw === 'object' && !Array.isArray(verifiedRaw)) {
    const verified = verifiedRaw as Record<string, unknown>
    if (typeof verified.code === 'string' && typeof verified.found === 'boolean') {
      lastVerifiedJoinCode = {
        code:       verified.code.trim().toUpperCase(),
        found:      verified.found,
        clinicId:   typeof verified.clinicId === 'string' ? verified.clinicId : null,
        clinicName: typeof verified.clinicName === 'string' ? verified.clinicName : null,
      }
    }
  }

  return {
    pendingJoinCode: /^[A-Z0-9]{6}$/.test(pendingJoinCode ?? '') ? pendingJoinCode : null,
    lastVerifiedJoinCode,
  }
}

async function savePlatformBotState(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  botState: PlatformBotState,
): Promise<void> {
  await supabase
    .from(T.WA_PLATFORM_USERS)
    .update({ bot_state: botState })
    .eq('id', userId)
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SRK, { auth: { persistSession: false } })

  let body: PlatformAgentRequest
  try { body = await req.json() }
  catch { return new Response('Bad JSON', { status: 400 }) }

  const { fromPhone, messageText } = body
  if (!fromPhone?.trim() || !messageText?.trim()) return new Response('Bad Request', { status: 400 })

  // ── Find or create platform user ──────────────────────────────────────────
  const { data: existingUser } = await supabase
    .from(T.WA_PLATFORM_USERS)
    .select('id, phone, name, email, linked_user_id, notes, bot_state')
    .eq('phone', fromPhone)
    .maybeSingle()

  let user: PlatformUser
  if (existingUser) {
    user = {
      ...(existingUser as PlatformUser),
      bot_state: normalizePlatformBotState((existingUser as Record<string, unknown>).bot_state),
    }
  } else {
    const { data: newUser, error } = await supabase
      .from(T.WA_PLATFORM_USERS)
      .insert({ phone: fromPhone })
      .select('id, phone, name, email, linked_user_id, notes, bot_state')
      .single()
    if (error || !newUser) {
      console.error('[platform-agent] Failed to create user:', error)
      return new Response('Internal error', { status: 500 })
    }
    user = {
      ...(newUser as PlatformUser),
      bot_state: normalizePlatformBotState((newUser as Record<string, unknown>).bot_state),
    }
  }

  // ── Save the incoming message ─────────────────────────────────────────────
  await supabase.from(T.WA_PLATFORM_MESSAGES).insert({
    platform_user_id: user.id,
    role:             'user',
    content:          messageText,
  })

  // ── Cross-reference phone against user_profiles ───────────────────────────
  let linkedClinics: ClinicInfo[] = []

  if (!user.linked_user_id) {
    const last9 = fromPhone.replace(/\D/g, '').slice(-9)
    const { data: profile } = await supabase
      .from(T.USER_PROFILES)
      .select('id, name, roles, clinic_id, clinics(name, join_code)')
      .ilike('phone', `%${last9}`)
      .maybeSingle()

    if (profile) {
      const pr = profile as {
        id: string; name: string; roles: string[]
        clinic_id: string | null
        clinics: { name: string; join_code: string } | null
      }
      await supabase
        .from(T.WA_PLATFORM_USERS)
        .update({ linked_user_id: pr.id, name: user.name ?? pr.name })
        .eq('id', user.id)
      user = { ...user, linked_user_id: pr.id, name: user.name ?? pr.name }
      if (pr.clinic_id && pr.clinics?.name) {
        const primaryRole = (pr.roles ?? []).includes('admin') ? 'admin'
          : (pr.roles ?? []).includes('receptionist') ? 'receptionist'
          : (pr.roles ?? [])[0] ?? 'professional'
        linkedClinics = [{
          id:       pr.clinic_id,
          name:     pr.clinics.name,
          role:     primaryRole,
          joinCode: pr.clinics.join_code,
        }]
      }
    }
  } else {
    const { data: profiles } = await supabase
      .from(T.USER_PROFILES)
      .select('roles, clinic_id, clinics(name, join_code)')
      .eq('id', user.linked_user_id)

    linkedClinics = ((profiles ?? []) as {
      roles: string[]; clinic_id: string | null
      clinics: { name: string; join_code: string } | null
    }[])
      .filter(p => p.clinic_id && p.clinics?.name)
      .map(p => {
        const primaryRole = (p.roles ?? []).includes('admin') ? 'admin'
          : (p.roles ?? []).includes('receptionist') ? 'receptionist'
          : (p.roles ?? [])[0] ?? 'professional'
        return {
          id:       p.clinic_id!,
          name:     p.clinics!.name,
          role:     primaryRole,
          joinCode: p.clinics!.join_code,
        }
      })
  }

  // ── Load bot config for the first admin clinic ────────────────────────────
  const adminClinic = linkedClinics.find(c => c.role === 'admin') ?? linkedClinics[0] ?? null
  let botConfig: ClinicBotConfig | null = null

  if (adminClinic) {
    const { data: cfg } = await supabase
      .from(T.CLINICS)
      .select('wa_ai_model, wa_ai_custom_prompt, wa_ai_allow_schedule, wa_ai_allow_confirm, wa_ai_allow_cancel')
      .eq('id', adminClinic.id)
      .single()
    if (cfg) botConfig = cfg as ClinicBotConfig
  }

  // ── Fetch pending staff requests (shown to admins only) ────────────────────────
  let pendingRequests: StaffRequest[] = []
  const adminClinicIds = linkedClinics.filter(c => c.role === 'admin').map(c => c.id)
  if (adminClinicIds.length > 0) {
    const { data: reqRows } = await supabase
      .from(T.CLINIC_STAFF_REQUESTS)
      .select('id, clinic_id, requester_name, requester_email, requester_phone, role, clinics(name)')
      .in('clinic_id', adminClinicIds)
      .eq('status', 'pending')
      .order('requested_at', { ascending: true })
    pendingRequests = ((reqRows ?? []) as Record<string, unknown>[]).map(r => ({
      id:              r.id              as string,
      clinic_id:       r.clinic_id       as string,
      clinic_name:     (r.clinics as { name: string } | null)?.name ?? '?',
      requester_name:  r.requester_name  as string,
      requester_email: r.requester_email as string,
      requester_phone: r.requester_phone as string,
      role:            r.role            as string,
    }))
  }

  // ── Load user profile + permissions ──────────────────────────────────────
  const primaryClinic = adminClinic ?? linkedClinics[0] ?? null
  let userRoles: string[] = []
  let userPermissions: Record<string, boolean> = computeUserPermissions([], {})

  if (user.linked_user_id && primaryClinic) {
    const { data: profile } = await supabase
      .from(T.USER_PROFILES)
      .select('roles, permission_overrides')
      .eq('id', user.linked_user_id)
      .eq('clinic_id', primaryClinic.id)
      .maybeSingle()
    if (profile) {
      const p = profile as { roles: string[]; permission_overrides: Record<string, boolean> }
      userRoles       = Array.isArray(p.roles) ? p.roles : []
      userPermissions = computeUserPermissions(userRoles, p.permission_overrides ?? {})
    }
  }

  // ── Load clinic snapshot (agenda, financial, team) ────────────────────────
  let snapshot: ClinicSnapshot | null = null
  if (primaryClinic && user.linked_user_id) {
    snapshot = await loadClinicSnapshot(supabase, primaryClinic.id, user.email, userRoles)
  }

  // ── Load rolling history (last 16, excluding the message we just inserted) ─
  const { data: msgRows } = await supabase
    .from(T.WA_PLATFORM_MESSAGES)
    .select('role, content')
    .eq('platform_user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(16)

  const history = ((msgRows ?? []) as { role: string; content: string }[])
    .reverse()
    .slice(0, -1)

  const isFirstMessage = history.length === 0
  const fastPath = resolvePlatformFastPath({
    buttonReplyId: body.buttonReplyId,
    messageText,
    pendingJoinCode: user.bot_state?.pendingJoinCode,
    siteUrl: SITE_URL,
  })

  if (fastPath) {
    if (fastPath.nextPendingJoinCode) {
      const nextBotState = {
        ...normalizePlatformBotState(user.bot_state),
        pendingJoinCode: fastPath.nextPendingJoinCode,
      }
      await savePlatformBotState(supabase, user.id, nextBotState)
      user = { ...user, bot_state: nextBotState }
    }

    await supabase.from(T.WA_PLATFORM_MESSAGES).insert({
      platform_user_id: user.id,
      role:             'assistant',
      content:          fastPath.replyText,
    })

    if (fastPath.mode === 'interactive' && fastPath.buttons && fastPath.buttons.length > 0) {
      await sendWAInteractive(fromPhone, fastPath.replyText, fastPath.buttons)
    } else {
      await sendWA(fromPhone, fastPath.replyText)
    }

    return new Response('OK', { status: 200 })
  }

  // ── Typing indicator (fire-and-forget) ──────────────────────────────────
  if (body.waMessageId) {
    sendPlatformTypingIndicator(body.waMessageId)
  }

    const deterministicReply = buildDeterministicAdminReply(messageText, snapshot, userPermissions)
    if (deterministicReply) {
      await supabase.from(T.WA_PLATFORM_MESSAGES).insert({
        platform_user_id: user.id,
        role:             'assistant',
        content:          deterministicReply,
      })
      await sendWA(fromPhone, deterministicReply)
      return new Response('OK', { status: 200 })
    }

  // ── Progress message for slow actions ────────────────────────────────────
  // Shown before the AI reply arrives; only for actions with meaningful latency
  const PROGRESS_MSG: Partial<Record<ActionName, string>> = {
    [A.CREATE_CLINIC_NOW]:     '⏳ Criando sua clínica e preparando o acesso…',
    [A.JOIN_CLINIC]:           '⏳ Verificando o código e configurando seu acesso…',
    [A.INVITE_STAFF_DIRECTLY]: '⏳ Enviando o convite de acesso…',
    [A.SCHEDULE_APPOINTMENT]:  '⏳ Agendando consulta…',
    [A.RESCHEDULE_APPOINTMENT]:'⏳ Alterando horário…',
  }

  // ── Run AI ────────────────────────────────────────────────────────────────
  const action = await runAgent(
    user, linkedClinics, adminClinic, botConfig,
    history, messageText, isFirstMessage, supabase,
    pendingRequests, userRoles, userPermissions, snapshot, primaryClinic,
  )

  // ── Save assistant reply ──────────────────────────────────────────────────
  if (action.replyText) {
    await supabase.from(T.WA_PLATFORM_MESSAGES).insert({
      platform_user_id: user.id,
      role:             'assistant',
      content:          action.replyText,
    })
  }

  // ── Send progress message for slow actions (before executing) ────────────
  const progressMsg = PROGRESS_MSG[action.action]
  if (progressMsg) {
    await sendWA(fromPhone, progressMsg)
  }

  // ── Execute side effects (may override the AI reply) ─────────────────────
  const replyOverride = await executeSideEffect(action, user, adminClinic, linkedClinics, fromPhone, supabase, pendingRequests, userPermissions, primaryClinic)

  // ── Send WhatsApp reply ───────────────────────────────────────────────────
  const finalReply = replyOverride ?? action.replyText
  if (finalReply) {
    if (action.action === A.REPLY_WITH_BUTTONS && action.buttons && action.buttons.length > 0) {
      await sendWAInteractive(fromPhone, finalReply, action.buttons)
    } else {
      await sendWA(fromPhone, finalReply)
    }
  }

  return new Response('OK', { status: 200 })
})

// ─── AI agent ────────────────────────────────────────────────────────────────

async function runAgent(
  user:            PlatformUser,
  linkedClinics:   ClinicInfo[],
  adminClinic:     ClinicInfo | null,
  botConfig:       ClinicBotConfig | null,
  history:         { role: string; content: string }[],
  messageText:     string,
  isFirstMessage:  boolean,
  supabase:        ReturnType<typeof createClient>,
  pendingRequests: StaffRequest[],
  userRoles:       string[],
  userPermissions: Record<string, boolean>,
  snapshot:        ClinicSnapshot | null,
  primaryClinic:   ClinicInfo | null,
  toolResult?:     string,   // generic injected result from any tool call
): Promise<PlatformAction> {

  const systemPrompt = buildSystemPrompt(
    user, linkedClinics, adminClinic, botConfig, isFirstMessage,
    pendingRequests, userRoles, userPermissions, snapshot,
  )

  const extraContext = toolResult
    ? [{ role: 'system' as const, content: `[TOOL RESULT — use this to reply NOW with action:reply. Do NOT call any search/tool action again.]\n${toolResult}` }]
    : []

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-12),
    ...extraContext,
    { role: 'user', content: messageText },
  ]

  const orRes = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://consultin.app',
      'X-Title':      'Consultin Platform Bot',
    },
    body: JSON.stringify({
      model:       'google/gemma-4-31b-it',
      messages,
      temperature: 0.3,
      max_tokens:  800,
    }),
  })

  const fallback: PlatformAction = {
    action:    A.REPLY,
    replyText: '😅 Tive um problema aqui. Pode tentar de novo em instantes?',
  }

  if (!orRes.ok) {
    console.error('[platform-agent] OpenRouter error:', await orRes.text())
    return fallback
  }

  const rawContent = (await orRes.json())?.choices?.[0]?.message?.content ?? ''
  const cleaned = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()

  let action: PlatformAction
  try {
    action = JSON.parse(cleaned) as PlatformAction
  } catch {
    console.error('[platform-agent] JSON parse error:', rawContent)
    return fallback
  }

  // ── Safeguard: if second pass returns a tool action, force a plain reply ──
  if (toolResult && [A.SEARCH_CLINICS,A.SEARCH_PATIENTS,A.SEARCH_AVAILABLE_SLOTS,A.CREATE_PATIENT].includes(action.action)) {
    console.warn('[platform-agent] model returned tool action on tool-result pass:', action.action)
    return { action: A.REPLY, replyText: action.replyText || '😅 Não consegui processar. Pode tentar de novo?' }
  }

  // ── Tool loops (only on first pass) ──────────────────────────────────────
  if (!toolResult) {
    function reRun(result: string): Promise<PlatformAction> {
      return runAgent(
        user, linkedClinics, adminClinic, botConfig,
        history, messageText, isFirstMessage, supabase,
        pendingRequests, userRoles, userPermissions, snapshot, primaryClinic,
        result,
      )
    }

    // search_clinics
    if (action.action === A.SEARCH_CLINICS && action.clinicName) {
      const results = await searchClinics(supabase, action.clinicName)
      const text = results.length > 0
        ? `Clinics similar to "${action.clinicName}":\n` +
          results.map((c, i) => `  ${i + 1}. "${c.name}" (id:${c.id})`).join('\n') +
          `\n\nAsk if one is theirs. YES → join code flow. NO → create new clinic.`
        : `No clinics found similar to "${action.clinicName}". Tell user and offer to create a new clinic.`
      return reRun(text)
    }

    // search_patients
    if (action.action === A.SEARCH_PATIENTS && action.patientQuery && primaryClinic) {
      const results = await searchPatients(supabase, primaryClinic.id, action.patientQuery)
      const text = results.length > 0
        ? `PATIENTS FOUND for "${action.patientQuery}":\n` +
          results.map((p, i) => `  ${i + 1}. ${p.name} | ${p.phone ?? '—'} | CPF:${p.cpf ?? '—'} | ID:${p.id}`).join('\n') +
          `\nConfirm with user which patient to use. Then use the patientId for scheduling.`
        : `No patients found for "${action.patientQuery}". Ask if they want to create a new patient (use create_patient action).`
      return reRun(text)
    }

    // search_available_slots
    if (action.action === A.SEARCH_AVAILABLE_SLOTS && action.professionalId && action.searchDate && primaryClinic) {
      const dur   = action.durationMinutes ?? 30
      const slots = await computeAvailableSlots(supabase, primaryClinic.id, action.professionalId, action.searchDate, dur)
      const text  = slots.length > 0
        ? `AVAILABLE SLOTS on ${action.searchDate} (${dur}min each):\n` +
          slots.map((s, i) => `  ${i + 1}. ${s}`).join('\n') +
          `\nPresent options to user, then schedule with startsAt/endsAt in ISO 8601 (BRT = UTC-3).`
        : `No available slots for ${action.searchDate} (${dur}min). Suggest another date.`
      return reRun(text)
    }

    // create_patient (tool loop so we get the ID back for scheduling)
    if (action.action === A.CREATE_PATIENT && action.patientName && primaryClinic) {
      const newId = await doCreatePatient(supabase, primaryClinic.id, action)
      const text  = newId
        ? `Patient created. Name: "${action.patientName}", patientId: "${newId}". Now use this ID to schedule the appointment with schedule_appointment.`
        : `Failed to create patient — may already exist. Search with search_patients.`
      return reRun(text)
    }
  }

  return action
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(
  user:            PlatformUser,
  linkedClinics:   ClinicInfo[],
  adminClinic:     ClinicInfo | null,
  botConfig:       ClinicBotConfig | null,
  isFirstMessage:  boolean,
  pendingRequests: StaffRequest[],
  userRoles:       string[],
  userPermissions: Record<string, boolean>,
  snapshot:        ClinicSnapshot | null,
): string {
  const hasClinic = linkedClinics.length > 0
  const clinic    = adminClinic ?? linkedClinics[0] ?? null
  const hasAdmin  = linkedClinics.some(c => c.role === 'admin')

  // ── MANAGEMENT MODE ────────────────────────────────────────────────────────
  if (hasClinic && snapshot) {
    const roleLabel = userRoles.includes('admin') ? 'Admin'
      : userRoles.includes('receptionist')        ? 'Recepcionista'
      : userRoles.includes('professional')        ? 'Profissional'
      : 'Membro'

    const P = userPermissions
    const ctx: string[] = [
      `CLÍNICA: ${clinic!.name} | USUÁRIO: ${user.name ?? user.phone} (${roleLabel})`,
      ``,
    ]

    ctx.push(formatAgendaForPrompt(snapshot.todayAgenda, `📅 HOJE (${snapshot.todayLabel})`))
    ctx.push(``)
    if (snapshot.tomorrowAgenda.length > 0) {
      ctx.push(formatAgendaForPrompt(snapshot.tomorrowAgenda, `📅 AMANHÃ (${snapshot.tomorrowLabel})`))
      ctx.push(``)
    }

    if (P.canViewFinancial && snapshot.financial) {
      const f = snapshot.financial
      ctx.push(
        `💰 FINANCEIRO HOJE: Agendado:${f.scheduled} | Confirmado:${f.confirmed} | Concluído:${f.completed} | Cancelado:${f.cancelled}`,
        `   Cobrado: ${formatCentsBRL(f.totalChargedCents)} | Recebido: ${formatCentsBRL(f.totalPaidCents)} | Pacientes: ${f.uniquePatients}`,
        ``,
      )
    }

    if (P.canViewFinancial && snapshot.weekFinancial) {
      const f = snapshot.weekFinancial
      ctx.push(
        `📊 RESUMO DA SEMANA (${f.label}): Consultas:${f.scheduled + f.confirmed + f.completed + f.cancelled} | Concluídas:${f.completed} | Canceladas:${f.cancelled}`,
        `   Cobrado: ${formatCentsBRL(f.totalChargedCents)} | Recebido: ${formatCentsBRL(f.totalPaidCents)} | Pacientes únicos: ${f.uniquePatients} | Novos pacientes: ${f.newPatients}`,
        f.topProfessionalName ? `   Profissional destaque: ${f.topProfessionalName} (${f.topProfessionalCount} atend.)` : `   Profissional destaque: sem dados ainda`,
        ``,
      )
    }

    if (P.canViewFinancial && snapshot.monthFinancial) {
      const f = snapshot.monthFinancial
      ctx.push(
        `🗓 RESUMO DO MÊS (${f.label}): Consultas:${f.scheduled + f.confirmed + f.completed + f.cancelled} | Concluídas:${f.completed} | Canceladas:${f.cancelled}`,
        `   Cobrado: ${formatCentsBRL(f.totalChargedCents)} | Recebido: ${formatCentsBRL(f.totalPaidCents)} | Pacientes únicos: ${f.uniquePatients} | Novos pacientes: ${f.newPatients}`,
        f.topProfessionalName ? `   Profissional destaque: ${f.topProfessionalName} (${f.topProfessionalCount} atend.)` : `   Profissional destaque: sem dados ainda`,
        ``,
      )
    }

    if (P.canManageProfessionals && snapshot.team.length > 0) {
      ctx.push(`👥 EQUIPE:`)
      for (const m of snapshot.team) {
        ctx.push(`  [${m.userId}] ${m.name} | ${(m.roles ?? []).join('+')} | ${m.phone ?? '—'}`)
      }
      ctx.push(``)
    }

    if (snapshot.serviceTypes.length > 0) {
      ctx.push(`🗂 SERVIÇOS: ` + snapshot.serviceTypes.map(s =>
        `${s.name}(${s.durationMinutes}min${s.priceCents ? `|${formatCentsBRL(s.priceCents)}` : ''})[${s.id}]`
      ).join(' | '))
      ctx.push(``)
    }

    if (snapshot.rooms.length > 0) {
      ctx.push(`🚪 SALAS: ` + snapshot.rooms.map(r => `${r.name}[${r.id}]`).join(' | '))
      ctx.push(``)
    }

    if (pendingRequests.length > 0) {
      ctx.push(`⏳ SOLICITAÇÕES PENDENTES (${pendingRequests.length}):`)
      pendingRequests.forEach((r, i) => {
        const rl = r.role === 'receptionist' ? 'recepcionista' : 'profissional'
        ctx.push(`  [${i + 1}] ID:${r.id} | ${r.requester_name} | ${r.requester_email} | ${r.requester_phone} | ${rl} → ${r.clinic_name}`)
      })
      ctx.push(``)
    }

    if (hasAdmin && botConfig) {
      ctx.push(`🤖 BOT: model:${botConfig.wa_ai_model ?? 'default'} | agendar:${botConfig.wa_ai_allow_schedule ? 'sim' : 'não'} | confirmar:${botConfig.wa_ai_allow_confirm ? 'sim' : 'não'} | cancelar:${botConfig.wa_ai_allow_cancel ? 'sim' : 'não'}`)
      ctx.push(``)
    }

    // Actions reference
    const acts = [
      `{ "action": "reply", "replyText": "..." }`,
      `{ "action": "reply_with_buttons", "replyText": "...", "buttons": [{"id":"open_dashboard","title":"Abrir painel"},{"id":"view_pricing","title":"Ver preços"}] }`,
    ]
    if (P.canManageAgenda) acts.push(
      `{ "action": "update_appointment_status", "appointmentId": "ID_FROM_CONTEXT", "newStatus": "confirmed|completed|cancelled|no_show", "replyText": "..." }`,
      `{ "action": "reschedule_appointment", "appointmentId": "...", "startsAt": "ISO8601", "endsAt": "ISO8601", "replyText": "..." }`,
      `{ "action": "schedule_appointment", "patientId": "...", "professionalId": "...", "startsAt": "ISO8601", "endsAt": "ISO8601", "serviceTypeId": "...", "appointmentNotes": "...", "replyText": "..." }`,
      `{ "action": "search_available_slots", "professionalId": "...", "searchDate": "YYYY-MM-DD", "durationMinutes": 30, "replyText": "Verificando horários..." }  ← TOOL LOOP`,
    )
    if (P.canViewPatients) acts.push(
      `{ "action": "search_patients", "patientQuery": "nome ou CPF", "replyText": "Buscando..." }  ← TOOL LOOP`,
    )
    if (P.canManagePatients) acts.push(
      `{ "action": "create_patient", "patientName": "...", "patientPhone": "...", "patientBirthDate": "YYYY-MM-DD", "replyText": "..." }  ← TOOL LOOP`,
    )
    acts.push(`{ "action": "update_own_profile", "profileName": "...", "profilePhone": "...", "replyText": "..." }`)
    if (hasAdmin) acts.push(
      `{ "action": "update_member_permissions", "memberId": "USER_ID", "permissionKey": "canViewFinancial|canManageAgenda|canManagePatients|canManageProfessionals|canViewFinancial|canManageSettings", "permissionValue": true, "replyText": "..." }`,
      `{ "action": "approve_staff_request", "requestId": "...", "replyText": "..." }`,
      `{ "action": "reject_staff_request", "requestId": "...", "replyText": "..." }`,
      `{ "action": "invite_staff_directly", "staffName": "...", "staffEmail": "...", "staffPhone": "...", "role": "professional|receptionist", "replyText": "..." }`,
      `{ "action": "configure_bot", "clinicId": "...", "customPrompt": "...", "allowSchedule": true, "allowConfirm": true, "allowCancel": true, "aiModel": "...", "replyText": "..." }`,
    )
    if (P.canManageProfessionals) acts.push(
      `{ "action": "manage_professional", "professionalName": "...", "specialty": "...", "councilId": "...", "professionalEmail": "...", "professionalPhone": "...", "replyText": "..." }`,
      `{ "action": "manage_service_type", "serviceTypeName": "...", "serviceTypeDuration": 30, "serviceTypePriceCents": 15000, "serviceTypeColor": "#3b82f6", "replyText": "..." }`,
      `{ "action": "manage_room", "roomName": "...", "roomColor": "#6366f1", "replyText": "..." }`,
      `{ "action": "close_room", "roomId": "...", "closeDate": "YYYY-MM-DD", "replyText": "..." }`,
    )
    if (P.canManageOwnAvailability) acts.push(
      `{ "action": "update_own_availability", "availabilitySlots": [{"weekday":1,"start_time":"09:00","end_time":"17:00","active":true},...], "replyText": "..." }`,
      `  weekday: 1=Segunda...5=Sexta, 6=Sábado, 7=Domingo`,
    )

    const firstName = user.name ? user.name.split(' ')[0] : null

    return [
      `You are Helen, the WhatsApp assistant for Consultin (clinic management platform, Brazil). You help clinic staff and owners manage their work directly from WhatsApp.`,
      `This number is for CLINIC STAFF AND OWNERS — never for patients.`,
      ``,
      ...ctx,
      `PERSONALITY: You are Helen — warm, direct, like a helpful colleague on WhatsApp. Short messages. Use the person's first name occasionally. Reply in PT-BR.`,
      ``,
      ...(isFirstMessage ? [
        `FIRST MESSAGE RULE: Greet ${firstName ? firstName : 'the person'} by first name. Mention the clinic *${clinic?.name ?? 'their clinic'}* by name. Show a SHORT menu (4–5 bullets max) from WHAT YOU CAN HELP WITH below — only the most relevant to their role. End with "Como posso ajudar hoje?" or similar. Max 5 lines total. Warm but not over the top.`,
        ``,
      ] : []),
      `WHAT YOU CAN HELP WITH:`,
      P.canManageAgenda ? `• Agenda: confirmar [nome/nº], concluir, cancelar, remarcar, agendar nova consulta` : '',
      P.canViewPatients ? `• Pacientes: buscar por nome/CPF` : '',
      P.canManagePatients ? `• Pacientes: cadastrar novo paciente` : '',
      P.canViewFinancial ? `• Financeiro: resumo do dia, da semana e do mês, com novos pacientes e profissional destaque` : '',
      hasAdmin ? `• Equipe: aprovar/reprovar solicitações (use IDs de SOLICITAÇÕES PENDENTES), convidar diretamente, ajustar permissões` : '',
      hasAdmin ? `• Bot: configurar personalidade e permissões do bot da clínica` : '',
      P.canManageProfessionals ? `• Profissionais: adicionar/editar profissionais, serviços, salas` : '',
      P.canManageOwnAvailability ? `• Disponibilidade: definir/alterar minha grade de horários semanal` : '',
      `• Perfil: atualizar meu nome ou telefone`,
      ``,
      `RULES:`,
      `1. IDs de consulta ficam no contexto — NUNCA mostre IDs ao usuário; referencie por nome+horário.`,
      `2. Para "confirmar João" → encontre o ID no contexto de HOJE e use update_appointment_status.`,
      `3. Para agendar: use search_available_slots antes de schedule_appointment.`,
      `4. Para paciente não encontrado em cache: use search_patients. Para criar: create_patient (tool loop).`,
      `5. Horários em America/Sao_Paulo (BRT = UTC-3). ISO8601 com offset: "2026-04-08T09:00:00-03:00"`,
      `6. Se o usuário pedir link do painel/preços/suporte, envie o link direto na resposta (não pergunte se pode enviar).`,
      `7. Use reply_with_buttons quando houver 2-3 próximos passos claros para reduzir atrito.`,
      `8. Respond ONLY with valid JSON matching an action below.`,
      ``,
      `ACTIONS:`,
      ...acts,
    ].filter(Boolean).join('\n')
  }

  // ── ONBOARDING MODE (no clinic yet) ───────────────────────────────────────
  const firstMsgBlock = isFirstMessage ? [
    `FIRST MESSAGE RULE (their very first contact with Consultin via WhatsApp):`,
    `Introduce yourself as Helen from Consultin. Give a one-sentence pitch of what Consultin does. Then ask what brings them — present 3 numbered options:`,
    `  1️⃣ Quero criar minha clínica`,
    `  2️⃣ Tenho um código de acesso (entrar na equipe)`,
    `  3️⃣ Só estou conhecendo o Consultin`,
    `Keep it 3–4 lines. 1–2 emojis ok. Friendly, not corporate.`,
    `Example tone (vary it, don't copy literally): "Oi! 👋 Sou a Helen do Consultin — a gente ajuda clínicas a gerenciar agenda, pacientes e equipe, com um bot de WhatsApp que atende seus pacientes sozinho. O que te traz aqui?\n\n1️⃣ Criar minha clínica\n2️⃣ Entrar na equipe (tenho um código)\n3️⃣ Só estou conhecendo"`,
    ``,
  ] : []

  const pendingReqLines: string[] = []
  if (pendingRequests.length > 0) {
    pendingReqLines.push(``, `PENDING STAFF REQUESTS (${pendingRequests.length}):`)
    pendingRequests.forEach((r, i) => {
      pendingReqLines.push(
        `  [${i + 1}] ${r.requester_name} | ${r.requester_email} | ${r.requester_phone} | ${r.role} → ${r.clinic_name}  ID:${r.id}`,
      )
    })
    pendingReqLines.push(``, `User can say "APROVAR 1" or "REPROVAR João". Match to correct request ID.`)
  }

  const joinCodeLine = adminClinic?.joinCode
    ? `- Join code for staff: *${adminClinic.joinCode}*`
    : ''

  return [
    `You are Helen, the WhatsApp assistant for Consultin — a clinic management platform built for Brazil.`,
    `Consultin helps clinics manage scheduling, patients, team, and finances — plus a WhatsApp bot that handles patient inquiries automatically. Works for dental, aesthetic, physio, medical, and other clinic types.`,
    `This is Consultin's official WhatsApp channel for clinic owners, staff, and interested prospects. NOT a channel for patients.`,
    ``,
    `KNOWN ABOUT THIS PERSON:`,
    `- Phone: ${user.phone} | Name: ${user.name ?? 'unknown'} | Email: ${user.email ?? 'unknown'}`,
    linkedClinics.length > 0 ? `- Clinics: ${linkedClinics.map(c => `${c.name} (${c.role})`).join(', ')}` : `- Clinics: none yet`,
    joinCodeLine,
    ...pendingReqLines,
    ``,
    `PERSONALITY: You are Helen — friendly, a bit like a smart friend who works at Consultin. Speak PT-BR (or match the user's language if they write in English). Concise and natural (this is WhatsApp — no walls of text). One emoji per message is fine. Never robotic. Be a helpful guide, not just an FAQ.`,
    ``,
    ...firstMsgBlock,
    `COMMON SITUATIONS — read the message and adapt tone accordingly:`,
    `• "o que é o Consultin?" / "do que se trata?" / "me fala mais" → Elevator pitch in 3–4 lines: agenda, pacientes, WhatsApp bot que atende pacientes automaticamente, financeiro. Close with "Quer testar grátis? Crio sua clínica em 2 minutos."`,
    `• "quanto custa?" / "tem plano grátis?" / "preço?" → Tem período de teste gratuito; planos pagos desbloqueiam recursos avançados. Ver detalhes: ${SITE_URL}/precos. Pergunte: "Quer começar agora?"`,
    `• "tem painel?" / "manda o link" / "como acesso?" → envie o link direto: ${SITE_URL}. Se ajudar, use reply_with_buttons com "Abrir painel" + "Ver preços".`,
    `• "recebi esse número" / "quem é você?" / confused user → Explain: this is Consultin's official channel for clinic owners and staff — not for patients. Ask if they own or work at a clinic.`,
    `• User mentions their specialty (dentista, fisioterapeuta, psicólogo, esteticista etc.) → Acknowledge that Consultin works great for that specialty. Then offer to create their clinic (FLOW A).`,
    `• User sends or mentions a 6-char code (letters+numbers) → Jump to FLOW B immediately, no re-introduction needed.`,
    `• "quero criar minha clínica" (directly) → Skip intro, go straight to FLOW A (ask clinic name).`,
    `• If user's name is already known (in KNOWN ABOUT THIS PERSON above) → Use it naturally in replies.`,
    ``,
    `FLOWS:`,
    `FLOW A — New clinic: ask clinic name → search_clinics → confirm no match → ask responsible's name + email → create_clinic_now`,
    `FLOW B — Join via code: user gives 6-char code → verify_join_code → ask email + role → join_clinic`,
    `FLOW D — Request without code: search_clinics → confirm clinic → collect name+email+role → request_clinic_membership`,
    ...(hasAdmin ? [
      `FLOW E — Approve/reject requests: "APROVAR [name/nº]" → approve_staff_request | "REPROVAR" → reject_staff_request`,
      `FLOW F — Invite directly: collect name+email+phone+role → invite_staff_directly`,
    ] : []),
    ``,
    `ACTIONS (respond with EXACTLY ONE JSON object):`,
    `{ "action": "reply", "replyText": "..." }`,
    `{ "action": "reply_with_buttons", "replyText": "...", "buttons": [{"id":"open_dashboard","title":"Abrir painel"},{"id":"view_pricing","title":"Ver preços"}] }`,
    `{ "action": "save_info", "name": "...", "email": "...", "replyText": "..." }`,
    `{ "action": "search_clinics", "clinicName": "...", "replyText": "Deixa eu verificar..." }  ← TOOL LOOP`,
    `{ "action": "create_clinic_now", "clinicName": "...", "responsibleName": "...", "email": "...", "phone": "...", "replyText": "..." }`,
    `{ "action": "verify_join_code", "joinCode": "ABC123", "replyText": "Verificando..." }`,
    `{ "action": "join_clinic", "joinCode": "...", "email": "...", "role": "professional|receptionist", "replyText": "..." }`,
    `{ "action": "request_clinic_membership", "clinicId": "...", "role": "professional|receptionist", "replyText": "..." }`,
    ...(hasAdmin ? [
      `{ "action": "approve_staff_request", "requestId": "...", "replyText": "..." }`,
      `{ "action": "reject_staff_request", "requestId": "...", "replyText": "..." }`,
      `{ "action": "invite_staff_directly", "staffName": "...", "staffEmail": "...", "staffPhone": "...", "role": "professional", "replyText": "..." }`,
    ] : []),
    ``,
    `RULES: 1. Never create clinic without searching first. 2. Need email before create_clinic_now. 3. Never invent IDs. 4. JSON only.`,
  ].filter(l => l !== '').join('\n')
}

// ─── Side effect executor ─────────────────────────────────────────────────────

async function executeSideEffect(
  action:          PlatformAction,
  user:            PlatformUser,
  adminClinic:     ClinicInfo | null,
  linkedClinics:   ClinicInfo[],
  fromPhone:       string,
  supabase:        ReturnType<typeof createClient>,
  pendingRequests: StaffRequest[],
  userPermissions: Record<string, boolean>,
  primaryClinic:   ClinicInfo | null,
): Promise<string | null> {  // returns non-null to override the AI's replyText

  // ── save_info ─────────────────────────────────────────────────────────────
  if (action.action === A.SAVE_INFO) {
    const updates: Record<string, unknown> = {}
    if (action.name?.trim())  updates.name  = action.name.trim()
    if (action.email?.trim()) updates.email = action.email.trim().toLowerCase()
    if (Object.keys(updates).length > 0) {
      await supabase.from(T.WA_PLATFORM_USERS).update(updates).eq('id', user.id)
    }
    return null
  }

  // ── search_clinics / verify_join_code — handled in tool loop, no DB side effect ──
  if (action.action === A.SEARCH_CLINICS) return null

  if (action.action === A.VERIFY_JOIN_CODE && action.joinCode) {
    const { data: clinic } = await supabase
      .from(T.CLINICS)
      .select('id, name')
      .eq('join_code', action.joinCode.toUpperCase())
      .maybeSingle()
    const nextBotState = {
      ...normalizePlatformBotState(user.bot_state),
      lastVerifiedJoinCode: clinic
        ? {
            code:       action.joinCode.toUpperCase(),
            found:      true,
            clinicId:   (clinic as { id: string }).id,
            clinicName: (clinic as { name: string }).name,
          }
        : {
            code:  action.joinCode.toUpperCase(),
            found: false,
          },
    }
    await savePlatformBotState(supabase, user.id, nextBotState)
    return null
  }

  // ── create_clinic_now ─────────────────────────────────────────────────────
  if (action.action === A.CREATE_CLINIC_NOW) {
    const clinicName      = action.clinicName?.trim() ?? ''
    const responsibleName = (action.responsibleName ?? user.name ?? '').trim()
    const email           = (action.email ?? user.email ?? '').trim().toLowerCase()
    const phone           = (action.phone ?? fromPhone).trim()

    if (!clinicName || !email) {
      console.warn('[platform-agent] create_clinic_now: missing clinicName or email', { clinicName, email })
      return null
    }

    const similarClinics = await searchClinics(supabase, clinicName)
    const exactConflict = findExactClinicNameConflict(clinicName, similarClinics)
    if (exactConflict) {
      return [
        `⚠️ Encontrei uma clínica com nome muito parecido: *${exactConflict.name}*.`,
        '',
        'Para evitar duplicidade, eu não vou criar outra clínica automaticamente com esse nome agora.',
        'Se for a mesma clínica, peça o código de acesso ao responsável.',
        'Se for outra operação, me mande um nome diferente para seguir com segurança.',
      ].join('\n')
    }

    // 1. Create clinic row (join_code auto-generated by DB default)
    const { data: newClinic, error: clinicErr } = await supabase
      .from(T.CLINICS)
      .insert({ name: clinicName, phone })
      .select('id, join_code')
      .single()

    if (clinicErr || !newClinic) {
      console.error('[platform-agent] clinic insert error:', clinicErr)
      return null
    }

    const authProvision = await resolveAuthUserForInvite(supabase, email)
    if (!authProvision.userId) {
      await rollbackCreatedClinic(supabase, {
        clinicId: newClinic.id,
        userId: authProvision.userId,
        deleteInvitedUser: authProvision.createdNewAuthUser,
      })
      return '😅 Não consegui preparar o acesso por e-mail com segurança. Tente novamente em instantes.'
    }

    const profileProvision = await provisionPrimaryProfileSafely(supabase, {
      userId: authProvision.userId,
      targetClinicId: newClinic.id,
      targetClinicName: clinicName,
      displayName: responsibleName || email,
      email,
      phone: phone || null,
      requestedRoles: ['admin'],
      operation: 'create_clinic',
    })

    if (!profileProvision.ok) {
      await rollbackCreatedClinic(supabase, {
        clinicId: newClinic.id,
        userId: authProvision.userId,
        deleteInvitedUser: authProvision.createdNewAuthUser,
      })
      return profileProvision.replyText
    }

    await supabase.from(T.WA_PLATFORM_USERS).update({
      linked_user_id: authProvision.userId,
      name:           (user.name ?? responsibleName) || null,
      email,
      bot_state:      {},
    }).eq('id', user.id)

    // 5. Notify Pedro on Telegram
    await notifyTelegram([
      `🏥 *Nova clínica criada via Bot WhatsApp*`,
      ``,
      `*Clínica:* ${clinicName}`,
      `*Responsável:* ${responsibleName || '—'}`,
      `*E-mail:* ${email}`,
      `*Telefone:* ${phone}`,
      `*Código de equipe:* \`${newClinic.join_code}\``,
      `*ID:* \`${newClinic.id}\``,
    ])

    // 6. Override AI reply with rich onboarding welcome
    const name = responsibleName || email
    return [
      `✅ Tudo pronto, *${name}*! A clínica *${clinicName}* foi criada.`,
      ``,
      `📧 Você vai receber um e-mail em *${email}* para definir sua senha e acessar o painel completo em ${SITE_URL.replace(/^https?:\/\//, '')}`,
      ``,
      `*O que você já pode fazer por aqui no WhatsApp:*`,
      ``,
      `👥 *Equipe* — Convidar profissionais e recepcionistas`,
      `   _"convidar Dr. João Silva, joao@clinica.com, profissional"_`,
      ``,
      `🗓️ *Agenda* — Ver e gerenciar consultas`,
      `   _"minha agenda de amanhã"_`,
      ``,
      `👤 *Pacientes* — Cadastrar e buscar`,
      `   _"cadastrar paciente Maria, 11 99999-0000"_`,
      ``,
      `⚙️ *Configurar o bot de pacientes* — Quando você configurar o WhatsApp da clínica, posso ajustar o assistente`,
      ``,
      `🔑 *Código para sua equipe entrar:* \`${newClinic.join_code}\``,
      `   Compartilhe com quem precisa acessar a clínica.`,
      ``,
      `O que quer fazer primeiro?`,
    ].join('\n')
  }

  // ── join_clinic ───────────────────────────────────────────────────────────
  if (action.action === A.JOIN_CLINIC) {
    const joinCode = action.joinCode?.trim().toUpperCase() ?? ''
    const email    = (action.email ?? user.email ?? '').trim().toLowerCase()
    const role     = action.role === 'receptionist' ? 'receptionist' : 'professional'

    if (!joinCode || !email) {
      console.warn('[platform-agent] join_clinic: missing joinCode or email', { joinCode, email })
      return null
    }

    const { data: clinic } = await supabase
      .from(T.CLINICS)
      .select('id, name')
      .eq('join_code', joinCode)
      .maybeSingle()

    if (!clinic) {
      console.warn('[platform-agent] join_clinic: code not found', joinCode)
      return null
    }

    const authProvision = await resolveAuthUserForInvite(supabase, email)
    if (!authProvision.userId) {
      return '😅 Não consegui preparar seu acesso por e-mail agora. Tente novamente em instantes.'
    }

    const profileProvision = await provisionPrimaryProfileSafely(supabase, {
      userId: authProvision.userId,
      targetClinicId: clinic.id,
      targetClinicName: clinic.name,
      displayName: user.name ?? email,
      email,
      phone: fromPhone || null,
      requestedRoles: [role],
      operation: 'join_clinic',
    })

    if (!profileProvision.ok) {
      if (authProvision.createdNewAuthUser) {
        try {
          await supabase.auth.admin.deleteUser(authProvision.userId)
        } catch (error) {
          console.error('[platform-agent] deleteUser join rollback error:', error)
        }
      }
      return profileProvision.replyText
    }

    await supabase.from(T.WA_PLATFORM_USERS).update({
      linked_user_id: authProvision.userId,
      email,
      bot_state:      {},
    }).eq('id', user.id)

    await notifyTelegram([
      `👤 *Novo membro via Bot WhatsApp*`,
      ``,
      `*Clínica:* ${clinic.name}`,
      `*E-mail:* ${email}`,
      `*Função:* ${role}`,
      `*Telefone:* ${user.phone}`,
    ])

    const memberName = user.name || email
    const roleLabel  = role === 'receptionist' ? 'recepcionista' : 'profissional'
    return [
      `✅ Pronto, *${memberName}*! Você agora faz parte da clínica *${clinic.name}* como *${roleLabel}*.`,
      ``,
      `📧 Verifique seu e-mail *${email}* para definir sua senha e acessar o painel em ${SITE_URL.replace(/^https?:\/\//, '')}`,
      ``,
      `*O que você pode fazer aqui:*`,
      role === 'professional'
        ? `🗓️ _"minha agenda"_ — Ver suas consultas do dia\n✅ _"concluir consulta do João"_ — Atualizar status\n👤 _"buscar paciente Maria"_ — Encontrar paciente`
        : `🗓️ _"agenda de hoje"_ — Ver agenda da clínica\n👤 _"cadastrar paciente novo"_ — Registrar paciente\n🗓️ _"agendar Jo\u00e3o às 14h com Dr. Ana"_ — Novo agendamento`,
      ``,
      `Como posso te ajudar?`,
    ].join('\n')
  }

  // ── request_clinic_membership ─────────────────────────────────────────────
  if (action.action === A.REQUEST_CLINIC_MEMBERSHIP) {
    const clinicId = action.clinicId?.trim() ?? ''
    const role     = action.role === 'receptionist' ? 'receptionist' : 'professional'
    const reqName  = (action.staffName ?? user.name ?? '').trim()
    const reqEmail = (action.staffEmail ?? user.email ?? '').trim().toLowerCase()

    if (!clinicId || !reqEmail || !reqName) {
      console.warn('[platform-agent] request_clinic_membership: missing fields', { clinicId, reqEmail, reqName })
      return null
    }

    const { data: clinic } = await supabase
      .from(T.CLINICS)
      .select('id, name')
      .eq('id', clinicId)
      .maybeSingle()

    if (!clinic) { console.warn('[platform-agent] request_clinic_membership: clinic not found', clinicId); return }
    const cl = clinic as { id: string; name: string }

    const { error: reqErr } = await supabase
      .from(T.CLINIC_STAFF_REQUESTS)
      .insert({ clinic_id: cl.id, requester_name: reqName, requester_email: reqEmail, requester_phone: fromPhone, role })

    if (reqErr) { console.error('[platform-agent] request_clinic_membership: insert error:', reqErr); return }

    // Notify clinic admins via platform WA
    const adminPhones = await findAdminPhonesForClinic(supabase, cl.id)
    const roleLabel   = role === 'receptionist' ? 'recepcionista' : 'profissional'
    const notifyMsg   = [
      `👤 *Nova solicitação de equipe* para *${cl.name}*`,
      ``,
      `*Nome:* ${reqName}`,
      `*E-mail:* ${reqEmail}`,
      `*WhatsApp:* ${fromPhone}`,
      `*Função desejada:* ${roleLabel}`,
      ``,
      `Para aprovar, responda *APROVAR* aqui.`,
      `Para recusar, responda *REPROVAR*.`,
    ].join('\n')

    for (const adminPhone of adminPhones) {
      await sendWA(adminPhone, notifyMsg)
    }
    return null
  }

  // ── approve_staff_request ─────────────────────────────────────────────────
  if (action.action === A.APPROVE_STAFF_REQUEST && action.requestId) {
    const { data: req } = await supabase
      .from(T.CLINIC_STAFF_REQUESTS)
      .select('id, clinic_id, requester_name, requester_email, requester_phone, role, clinics(name)')
      .eq('id', action.requestId)
      .eq('status', 'pending')
      .maybeSingle()

    if (!req) { console.warn('[platform-agent] approve_staff_request: not found or not pending:', action.requestId); return }

    const r         = req as Record<string, unknown>
    const clinicName = (r.clinics as { name: string } | null)?.name ?? '?'

    try {
      await inviteStaffWithWA({
        supabase,
        staffEmail: r.requester_email as string,
        staffPhone: r.requester_phone as string,
        staffName:  r.requester_name  as string,
        clinicId:   r.clinic_id       as string,
        clinicName,
        role:       r.role            as string,
      })
    } catch (error) {
      console.error('[platform-agent] approve_staff_request invite error:', error)
      return typeof error === 'object' && error && 'message' in error
        ? String((error as { message: unknown }).message)
        : '😅 Não consegui aprovar esse acesso com segurança agora. Tente novamente em instantes.'
    }

    await supabase
      .from(T.CLINIC_STAFF_REQUESTS)
      .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: user.linked_user_id })
      .eq('id', action.requestId)
    return null
  }

  // ── reject_staff_request ──────────────────────────────────────────────────
  if (action.action === A.REJECT_STAFF_REQUEST && action.requestId) {
    const { data: req } = await supabase
      .from(T.CLINIC_STAFF_REQUESTS)
      .select('id, requester_name, requester_phone, clinics(name)')
      .eq('id', action.requestId)
      .eq('status', 'pending')
      .maybeSingle()

    if (!req) { console.warn('[platform-agent] reject_staff_request: not found:', action.requestId); return }

    const r         = req as Record<string, unknown>
    const clinicName = (r.clinics as { name: string } | null)?.name ?? '?'
    const firstName  = (r.requester_name as string)?.split(' ')[0] ?? ''

    await supabase
      .from(T.CLINIC_STAFF_REQUESTS)
      .update({ status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: user.linked_user_id })
      .eq('id', action.requestId)

    await sendWA(
      r.requester_phone as string,
      `Olá${firstName ? `, ${firstName}` : ''}. 👋\n\nSua solicitação para fazer parte da equipe da *${clinicName}* não foi aprovada desta vez.\n\nSe tiver dúvidas, fale diretamente com a clínica.`,
    )
    return null
  }

  // ── invite_staff_directly ─────────────────────────────────────────────────
  if (action.action === A.INVITE_STAFF_DIRECTLY) {
    const staffEmail = (action.staffEmail ?? '').trim().toLowerCase()
    const staffPhone = (action.staffPhone ?? '').trim()
    const staffName  = (action.staffName  ?? '').trim()
    const role       = action.role === 'receptionist' ? 'receptionist' : 'professional'

    if (!staffEmail || !staffPhone || !adminClinic) {
      console.warn('[platform-agent] invite_staff_directly: missing fields or no admin clinic')
      return null
    }

    try {
      await inviteStaffWithWA({
        supabase, staffEmail, staffPhone, staffName,
        clinicId:   adminClinic.id,
        clinicName: adminClinic.name,
        role,
      })
    } catch (error) {
      console.error('[platform-agent] invite_staff_directly error:', error)
      return typeof error === 'object' && error && 'message' in error
        ? String((error as { message: unknown }).message)
        : '😅 Não consegui enviar esse convite com segurança agora. Tente novamente em instantes.'
    }

    await notifyTelegram([
      `👤 *Funcionário convidado via Bot WhatsApp*`,
      ``,
      `*Clínica:* ${adminClinic.name}`,
      `*Nome:* ${staffName || '—'}`,
      `*E-mail:* ${staffEmail}`,
      `*Telefone:* ${staffPhone}`,
      `*Função:* ${role}`,
    ])
    return null
  }

  // ── update_appointment_status ─────────────────────────────────────────────
  if (action.action === A.UPDATE_APPOINTMENT_STATUS) {
    if (!userPermissions.canManageAgenda || !primaryClinic || !action.appointmentId || !action.newStatus) return
    const { error } = await supabase
      .from(T.APPOINTMENTS)
      .update({ status: action.newStatus })
      .eq('id', action.appointmentId)
      .eq('clinic_id', primaryClinic.id)
    if (error) console.error('[platform-agent] update_appointment_status:', error)
    return null
  }

  // ── reschedule_appointment ────────────────────────────────────────────────
  if (action.action === A.RESCHEDULE_APPOINTMENT) {
    if (!userPermissions.canManageAgenda || !primaryClinic || !action.appointmentId) return
    const updates: Record<string, unknown> = {}
    if (action.startsAt) updates.starts_at = action.startsAt
    if (action.endsAt)   updates.ends_at   = action.endsAt
    if (Object.keys(updates).length > 0) {
      const { error } = await supabase
        .from(T.APPOINTMENTS)
        .update(updates)
        .eq('id', action.appointmentId)
        .eq('clinic_id', primaryClinic.id)
      if (error) console.error('[platform-agent] reschedule_appointment:', error)
    }
    return null
  }

  // ── schedule_appointment ──────────────────────────────────────────────────
  if (action.action === A.SCHEDULE_APPOINTMENT) {
    if (!userPermissions.canManageAgenda || !primaryClinic || !action.patientId || !action.professionalId || !action.startsAt || !action.endsAt) return
    const { error } = await supabase
      .from(T.APPOINTMENTS)
      .insert({
        clinic_id:       primaryClinic.id,
        patient_id:      action.patientId,
        professional_id: action.professionalId,
        starts_at:       action.startsAt,
        ends_at:         action.endsAt,
        service_type_id: action.serviceTypeId ?? null,
        notes:           action.appointmentNotes ?? null,
        status:          'scheduled',
      })
    if (error) console.error('[platform-agent] schedule_appointment:', error)
    return null
  }

  // ── update_own_profile ────────────────────────────────────────────────────
  if (action.action === A.UPDATE_OWN_PROFILE) {
    const updates: Record<string, unknown> = {}
    if (action.profileName?.trim())  updates.name  = action.profileName.trim()
    if (action.profilePhone?.trim()) updates.phone = action.profilePhone.trim()
    if (Object.keys(updates).length === 0) return
    if (user.linked_user_id && primaryClinic) {
      await supabase.from(T.USER_PROFILES).update(updates).eq('id', user.linked_user_id).eq('clinic_id', primaryClinic.id)
    }
    if (action.profileName?.trim()) {
      await supabase.from(T.WA_PLATFORM_USERS).update({ name: action.profileName.trim() }).eq('id', user.id)
    }
    return null
  }

  // ── update_member_permissions ─────────────────────────────────────────────
  if (action.action === A.UPDATE_MEMBER_PERMISSIONS) {
    if (!userPermissions.canManageSettings || !primaryClinic || !action.memberId || !action.permissionKey) return
    const { data: existing } = await supabase
      .from(T.USER_PROFILES)
      .select('permission_overrides')
      .eq('id', action.memberId)
      .eq('clinic_id', primaryClinic.id)
      .maybeSingle()
    const curr    = (existing as { permission_overrides?: Record<string, boolean> } | null)?.permission_overrides ?? {}
    const updated = { ...curr, [action.permissionKey]: action.permissionValue ?? false }
    await supabase
      .from(T.USER_PROFILES)
      .update({ permission_overrides: updated })
      .eq('id', action.memberId)
      .eq('clinic_id', primaryClinic.id)
    return null
  }

  // ── manage_professional ───────────────────────────────────────────────────
  if (action.action === A.MANAGE_PROFESSIONAL) {
    if (!userPermissions.canManageProfessionals || !primaryClinic) return
    const row: Record<string, unknown> = { clinic_id: primaryClinic.id }
    if (action.professionalName?.trim())  row.name       = action.professionalName.trim()
    if (action.specialty?.trim())         row.specialty  = action.specialty.trim()
    if (action.councilId?.trim())         row.council_id = action.councilId.trim()
    if (action.professionalEmail?.trim()) row.email      = action.professionalEmail.trim().toLowerCase()
    if (action.professionalPhone?.trim()) row.phone      = action.professionalPhone.trim()
    if (typeof action.activeProfessional === 'boolean') row.active = action.activeProfessional
    if (action.professionalId) {
      const { error } = await supabase.from(T.PROFESSIONALS).update(row).eq('id', action.professionalId).eq('clinic_id', primaryClinic.id)
      if (error) console.error('[platform-agent] manage_professional update:', error)
    } else {
      const { error } = await supabase.from(T.PROFESSIONALS).insert(row)
      if (error) console.error('[platform-agent] manage_professional insert:', error)
    }
    return null
  }

  // ── manage_service_type ───────────────────────────────────────────────────
  if (action.action === A.MANAGE_SERVICE_TYPE) {
    if (!userPermissions.canManageProfessionals || !primaryClinic) return
    const row: Record<string, unknown> = { clinic_id: primaryClinic.id }
    if (action.serviceTypeName?.trim())              row.name             = action.serviceTypeName.trim()
    if (action.serviceTypeDuration)                  row.duration_minutes = action.serviceTypeDuration
    if (typeof action.serviceTypePriceCents === 'number') row.price_cents = action.serviceTypePriceCents
    if (action.serviceTypeColor?.trim())             row.color            = action.serviceTypeColor.trim()
    if (action.serviceTypeId) {
      const { error } = await supabase.from(T.SERVICE_TYPES).update(row).eq('id', action.serviceTypeId).eq('clinic_id', primaryClinic.id)
      if (error) console.error('[platform-agent] manage_service_type update:', error)
    } else {
      const { error } = await supabase.from(T.SERVICE_TYPES).insert(row)
      if (error) console.error('[platform-agent] manage_service_type insert:', error)
    }
    return null
  }

  // ── manage_room ───────────────────────────────────────────────────────────
  if (action.action === A.MANAGE_ROOM) {
    if (!userPermissions.canManageSettings || !primaryClinic) return
    const row: Record<string, unknown> = { clinic_id: primaryClinic.id }
    if (action.roomName?.trim())  row.name  = action.roomName.trim()
    if (action.roomColor?.trim()) row.color = action.roomColor.trim()
    if (typeof action.activeRoom === 'boolean') row.active = action.activeRoom
    if (action.roomId) {
      const { error } = await supabase.from(T.CLINIC_ROOMS).update(row).eq('id', action.roomId).eq('clinic_id', primaryClinic.id)
      if (error) console.error('[platform-agent] manage_room update:', error)
    } else {
      const { error } = await supabase.from(T.CLINIC_ROOMS).insert(row)
      if (error) console.error('[platform-agent] manage_room insert:', error)
    }
    return null
  }

  // ── close_room ────────────────────────────────────────────────────────────
  if (action.action === A.CLOSE_ROOM) {
    if (!userPermissions.canManageSettings || !primaryClinic || !action.roomId || !action.closeDate) return
    const { error } = await supabase.from(T.ROOM_CLOSURES).insert({
      clinic_id: primaryClinic.id,
      room_id:   action.roomId,
      date:      action.closeDate,
    })
    if (error) console.error('[platform-agent] close_room:', error)
    return null
  }

  // ── update_own_availability ───────────────────────────────────────────────
  if (action.action === A.UPDATE_OWN_AVAILABILITY) {
    if (!userPermissions.canManageOwnAvailability || !primaryClinic || !action.availabilitySlots || !user.linked_user_id) return
    const { data: profRow } = await supabase
      .from(T.PROFESSIONALS)
      .select('id')
      .eq('clinic_id', primaryClinic.id)
      .or(`email.ilike.${(user.email ?? '').toLowerCase()},phone.ilike.%${fromPhone.slice(-9)}`)
      .limit(1)
      .maybeSingle()
    if (!profRow) { console.warn('[platform-agent] update_own_availability: no professional row found'); return }
    const profId = (profRow as { id: string }).id
    await supabase.from(T.AVAILABILITY_SLOTS).delete().eq('professional_id', profId).eq('clinic_id', primaryClinic.id)
    if (action.availabilitySlots.length > 0) {
      const rows = action.availabilitySlots.map(s => ({
        clinic_id:       primaryClinic.id,
        professional_id: profId,
        weekday:         s.weekday,
        start_time:      s.start_time,
        end_time:        s.end_time,
        active:          s.active ?? true,
        room_id:         s.room_id ?? null,
      }))
      const { error } = await supabase.from(T.AVAILABILITY_SLOTS).insert(rows)
      if (error) console.error('[platform-agent] update_own_availability insert:', error)
    }
    return null
  }

  // ── configure_bot ─────────────────────────────────────────────────────────
  if (action.action === A.CONFIGURE_BOT) {
    const targetClinicId = action.clinicId ?? adminClinic?.id ?? null
    if (!targetClinicId) return

    const isAuthorised = linkedClinics.some(c => c.id === targetClinicId && c.role === 'admin')
    if (!isAuthorised) {
      console.warn('[platform-agent] configure_bot: user not authorised for', targetClinicId)
      return null
    }

    const updates: Record<string, unknown> = {}
    if (action.clearCustomPrompt === true) {
      updates.wa_ai_custom_prompt = null
    } else if (typeof action.customPrompt === 'string') {
      updates.wa_ai_custom_prompt = action.customPrompt.trim() || null
    }
    if (typeof action.allowSchedule === 'boolean') updates.wa_ai_allow_schedule = action.allowSchedule
    if (typeof action.allowConfirm  === 'boolean') updates.wa_ai_allow_confirm  = action.allowConfirm
    if (typeof action.allowCancel   === 'boolean') updates.wa_ai_allow_cancel   = action.allowCancel
    if (typeof action.aiModel === 'string' && action.aiModel.trim()) {
      updates.wa_ai_model = action.aiModel.trim()
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase.from(T.CLINICS).update(updates).eq('id', targetClinicId)
      if (error) console.error('[platform-agent] configure_bot update error:', error)
    }
  }
  return null
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

// ─── loadClinicSnapshot ───────────────────────────────────────────────────────

async function loadClinicSnapshot(
  supabase:  ReturnType<typeof createClient>,
  clinicId:  string,
  userEmail: string | null,
  userRoles: string[],
): Promise<ClinicSnapshot> {
  const now     = new Date()
  const brtNow  = new Date(now.getTime() - 3 * 60 * 60 * 1000)
  const todayStr = brtNow.toISOString().slice(0, 10)       // YYYY-MM-DD BRT
  const tomorrowStr = new Date(brtNow.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const fmt = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  const todayLabel    = fmt(brtNow)
  const tomorrowLabel = fmt(new Date(brtNow.getTime() + 24 * 60 * 60 * 1000))
  const monthLabel    = `${String(brtNow.getUTCMonth() + 1).padStart(2, '0')}/${brtNow.getUTCFullYear()}`

  const weekStart = new Date(brtNow)
  weekStart.setUTCDate(brtNow.getUTCDate() - ((brtNow.getUTCDay() + 6) % 7))
  weekStart.setUTCHours(0, 0, 0, 0)
  const weekEnd = new Date(weekStart)
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6)
  weekEnd.setUTCHours(23, 59, 59, 999)

  const monthStart = new Date(Date.UTC(brtNow.getUTCFullYear(), brtNow.getUTCMonth(), 1, 0, 0, 0, 0))
  const monthEnd = new Date(Date.UTC(brtNow.getUTCFullYear(), brtNow.getUTCMonth() + 1, 0, 23, 59, 59, 999))
  const todayStart = new Date(brtNow)
  todayStart.setUTCHours(0, 0, 0, 0)
  const todayEnd = new Date(brtNow)
  todayEnd.setUTCHours(23, 59, 59, 999)

  // Find my professional row (for professional role: filter agenda to own appointments)
  let myProfessionalId: string | null = null
  if (userRoles.includes('professional') && userEmail) {
    const { data: profRow } = await supabase
      .from(T.PROFESSIONALS)
      .select('id')
      .eq('clinic_id', clinicId)
      .ilike('email', userEmail)
      .limit(1)
      .maybeSingle()
    if (profRow) myProfessionalId = (profRow as { id: string }).id
  }

  // Load agenda (today + tomorrow)
  const loadAgenda = async (dateStr: string): Promise<AgendaItem[]> => {
    let q = supabase
      .from(T.APPOINTMENTS)
      .select('id, starts_at, ends_at, status, patients(name, phone), professionals(name), service_types(name), charge_amount_cents')
      .eq('clinic_id', clinicId)
      .gte('starts_at', `${dateStr}T00:00:00Z`)
      .lt('starts_at',  `${dateStr}T23:59:59Z`)
      .order('starts_at', { ascending: true })
      .limit(30)
    if (myProfessionalId) q = q.eq('professional_id', myProfessionalId)
    const { data } = await q
    return ((data ?? []) as Record<string, unknown>[]).map(a => ({
      id:               a.id                    as string,
      startsAt:         a.starts_at             as string,
      endsAt:           a.ends_at               as string,
      status:           a.status                as string,
      patientName:      (a.patients as { name: string } | null)?.name ?? '—',
      patientPhone:     (a.patients as { phone?: string } | null)?.phone ?? null,
      professionalName: (a.professionals as { name: string } | null)?.name ?? '—',
      serviceType:      (a.service_types as { name: string } | null)?.name ?? null,
      chargeCents:      (a.charge_amount_cents  as number | null),
    }))
  }

  const [todayAgenda, tomorrowAgenda] = await Promise.all([
    loadAgenda(todayStr),
    loadAgenda(tomorrowStr),
  ])

  const loadFinancialSnapshot = async (
    startIso: string,
    endIso: string,
    label: string,
  ): Promise<PeriodFinancialSnapshot | null> => {
    const rows: Array<{
      status: string
      charge_amount_cents: number | null
      paid_amount_cents: number | null
      patient_id: string | null
      patient: { id: string; created_at: string | null } | null
      professional: { id: string; name: string } | null
    }> = []

    for (let page = 0; ; page += 1) {
      let query = supabase
        .from(T.APPOINTMENTS)
        .select('status, charge_amount_cents, paid_amount_cents, patient_id, patient:patients(id, created_at), professional:professionals(id, name)')
        .eq('clinic_id', clinicId)
        .gte('starts_at', startIso)
        .lte('starts_at', endIso)
        .order('starts_at', { ascending: true })
        .range(page * FINANCIAL_PAGE_SIZE, ((page + 1) * FINANCIAL_PAGE_SIZE) - 1)
      if (myProfessionalId) query = query.eq('professional_id', myProfessionalId)

      const { data, error } = await query
      if (error) throw error

      const batch = (data ?? []) as typeof rows
      rows.push(...batch)

      if (batch.length < FINANCIAL_PAGE_SIZE) break
    }

    let newPatientsCount = 0
    if (myProfessionalId) {
      newPatientsCount = new Set(
        rows
          .filter(row => {
            const createdAt = row.patient?.created_at
            return !!createdAt && createdAt >= startIso && createdAt <= endIso
          })
          .map(row => row.patient_id)
          .filter(Boolean),
      ).size
    } else {
      const { count } = await supabase
        .from(T.PATIENTS)
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .gte('created_at', startIso)
        .lte('created_at', endIso)
      newPatientsCount = count ?? 0
    }

    const professionalCounts = new Map<string, { name: string; count: number }>()
    for (const row of rows) {
      if (!row.professional?.id) continue
      const current = professionalCounts.get(row.professional.id)
      professionalCounts.set(row.professional.id, {
        name: row.professional.name,
        count: (current?.count ?? 0) + 1,
      })
    }
    const topProfessional = [...professionalCounts.values()].sort((a, b) => b.count - a.count)[0] ?? null

    return {
      label,
      scheduled:         rows.filter(r => r.status === 'scheduled').length,
      confirmed:         rows.filter(r => r.status === 'confirmed').length,
      completed:         rows.filter(r => r.status === 'completed').length,
      cancelled:         rows.filter(r => ['cancelled', 'no_show'].includes(r.status)).length,
      totalChargedCents: rows.reduce((sum, row) => sum + (row.charge_amount_cents ?? 0), 0),
      totalPaidCents:    rows.reduce((sum, row) => sum + (row.paid_amount_cents ?? 0), 0),
      uniquePatients:    new Set(rows.map(row => row.patient_id).filter(Boolean)).size,
      newPatients:       newPatientsCount ?? 0,
      topProfessionalName: topProfessional?.name ?? null,
      topProfessionalCount: topProfessional?.count ?? 0,
    }
  }

  const [financial, weekFinancial, monthFinancial] = await Promise.all([
    loadFinancialSnapshot(todayStart.toISOString(), todayEnd.toISOString(), todayLabel),
    loadFinancialSnapshot(weekStart.toISOString(), weekEnd.toISOString(), `${fmt(weekStart)} a ${fmt(weekEnd)}`),
    loadFinancialSnapshot(monthStart.toISOString(), monthEnd.toISOString(), monthLabel),
  ])

  // Team (admins only)
  let team: TeamMemberInfo[] = []
  if (userRoles.includes('admin')) {
    const { data: profiles } = await supabase
      .from(T.USER_PROFILES)
      .select('id, name, roles, phone')
      .eq('clinic_id', clinicId)
      .limit(20)
    team = ((profiles ?? []) as { id: string; name: string; roles: string[]; phone: string | null }[]).map(p => ({
      userId: p.id,
      name:   p.name,
      roles:  Array.isArray(p.roles) ? p.roles : [],
      phone:  p.phone,
    }))
  }

  // Service types
  const { data: stRows } = await supabase
    .from(T.SERVICE_TYPES)
    .select('id, name, duration_minutes, price_cents')
    .eq('clinic_id', clinicId)
    .eq('active', true)
    .order('name')
    .limit(20)
  const serviceTypes: ServiceTypeInfo[] = ((stRows ?? []) as Record<string, unknown>[]).map(s => ({
    id:              s.id              as string,
    name:            s.name            as string,
    durationMinutes: s.duration_minutes as number,
    priceCents:      s.price_cents     as number | null,
  }))

  // Rooms
  const { data: roomRows } = await supabase
    .from(T.CLINIC_ROOMS)
    .select('id, name')
    .eq('clinic_id', clinicId)
    .eq('active', true)
    .limit(10)
  const rooms: RoomInfo[] = ((roomRows ?? []) as { id: string; name: string }[]).map(r => ({
    id:   r.id,
    name: r.name,
  }))

  return {
    todayLabel,
    tomorrowLabel,
    todayAgenda,
    tomorrowAgenda,
    financial,
    weekFinancial,
    monthFinancial,
    team,
    serviceTypes,
    rooms,
    myProfessionalId,
  }
}

// ─── computeAvailableSlots ────────────────────────────────────────────────────

async function computeAvailableSlots(
  supabase:        ReturnType<typeof createClient>,
  clinicId:        string,
  professionalId:  string,
  dateStr:         string,  // YYYY-MM-DD (BRT local date)
  durationMinutes: number,
): Promise<string[]> {
  // Convert dateStr to weekday (1=Mon...7=Sun)
  const parts  = dateStr.split('-').map(Number)
  const d      = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]))
  const jsSun0 = d.getUTCDay()  // 0=Sun
  const weekday = jsSun0 === 0 ? 7 : jsSun0  // 1=Mon ... 7=Sun

  const { data: slots } = await supabase
    .from(T.AVAILABILITY_SLOTS)
    .select('start_time, end_time')
    .eq('clinic_id', clinicId)
    .eq('professional_id', professionalId)
    .eq('weekday', weekday)
    .eq('active', true)

  if (!slots || slots.length === 0) return []

  // Load existing appointments for that date (UTC day covers entire BRT local day)
  const utcDayStart = `${dateStr}T03:00:00Z`
  const utcDayEnd   = new Date(d.getTime() + 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000).toISOString()
  const { data: appts } = await supabase
    .from(T.APPOINTMENTS)
    .select('starts_at, ends_at')
    .eq('professional_id', professionalId)
    .gte('starts_at', utcDayStart)
    .lt('starts_at',  utcDayEnd)
    .not('status', 'in', '(cancelled,no_show)')

  // Convert appointments to BRT minutes-since-midnight
  const busy = ((appts ?? []) as { starts_at: string; ends_at: string }[]).map(a => {
    const s = new Date(a.starts_at)
    const e = new Date(a.ends_at)
    const sMin = ((s.getUTCHours() - 3 + 24) % 24) * 60 + s.getUTCMinutes()
    const eMin = ((e.getUTCHours() - 3 + 24) % 24) * 60 + e.getUTCMinutes()
    return { start: sMin, end: eMin }
  })

  const free: string[] = []
  for (const slot of (slots as { start_time: string; end_time: string }[])) {
    const [sh, sm] = slot.start_time.split(':').map(Number)
    const [eh, em] = slot.end_time.split(':').map(Number)
    const slotStart = sh * 60 + sm
    const slotEnd   = eh * 60 + em
    let cursor = slotStart
    while (cursor + durationMinutes <= slotEnd) {
      const blockEnd = cursor + durationMinutes
      const isBusy   = busy.some(b => cursor < b.end && blockEnd > b.start)
      if (!isBusy) {
        free.push(`${String(Math.floor(cursor / 60)).padStart(2, '0')}:${String(cursor % 60).padStart(2, '0')}`)
      }
      cursor += durationMinutes
    }
  }
  return free
}

// ─── searchPatients ───────────────────────────────────────────────────────────

async function searchPatients(
  supabase:  ReturnType<typeof createClient>,
  clinicId:  string,
  query:     string,
): Promise<{ id: string; name: string; phone: string | null; cpf: string | null }[]> {
  const term = query.trim().replace(/[%_]/g, '')
  const { data } = await supabase
    .from(T.PATIENTS)
    .select('id, name, phone, cpf')
    .eq('clinic_id', clinicId)
    .or(`name.ilike.%${term}%,cpf.ilike.%${term}%,phone.ilike.%${term}%`)
    .order('name')
    .limit(8)
  return (data ?? []) as { id: string; name: string; phone: string | null; cpf: string | null }[]
}

// ─── doCreatePatient ──────────────────────────────────────────────────────────

async function doCreatePatient(
  supabase:  ReturnType<typeof createClient>,
  clinicId:  string,
  action:    PlatformAction,
): Promise<string | null> {
  if (!action.patientName?.trim()) return null
  const row: Record<string, unknown> = {
    clinic_id: clinicId,
    name:      action.patientName.trim(),
  }
  if (action.patientPhone?.trim())     row.phone      = action.patientPhone.trim()
  if (action.patientBirthDate?.trim()) row.birth_date = action.patientBirthDate.trim()
  const { data, error } = await supabase.from(T.PATIENTS).insert(row).select('id').single()
  if (error) { console.error('[platform-agent] doCreatePatient:', error); return null }
  return (data as { id: string }).id
}

async function resolveAuthUserForInvite(
  supabase: ReturnType<typeof createClient>,
  email: string,
): Promise<AuthProvisioningResult> {
  const inviteRes = await fetch(`${SUPABASE_URL}/auth/v1/invite`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey:          SUPABASE_SRK,
      Authorization:   `Bearer ${SUPABASE_SRK}`,
    },
    body: JSON.stringify({
      email,
      data: { redirect_to: `${SITE_URL}/nova-senha` },
    }),
  })

  if (inviteRes.ok) {
    return {
      userId: (await inviteRes.json())?.id ?? null,
      createdNewAuthUser: true,
    }
  }

  const errText = await inviteRes.text()
  console.warn('[platform-agent] invite response (fallback to existing user lookup):', errText)
  const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  const existing = (users ?? []).find((candidate: { email?: string }) => candidate.email === email)

  return {
    userId: existing?.id ?? null,
    createdNewAuthUser: false,
  }
}

async function loadExistingProfileSnapshot(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<ExistingProfileSnapshot | null> {
  const { data: profile } = await supabase
    .from(T.USER_PROFILES)
    .select('clinic_id, roles, clinics(name)')
    .eq('id', userId)
    .maybeSingle()

  if (!profile) return null

  const row = profile as { clinic_id: string | null; roles: string[] | null; clinics: { name: string } | null }
  return {
    clinicId: row.clinic_id,
    clinicName: row.clinics?.name ?? null,
    roles: Array.isArray(row.roles) ? row.roles : [],
  }
}

async function ensureUserClinicMembership(
  supabase: ReturnType<typeof createClient>,
  params: {
    userId: string
    clinicId: string
    role: string
    email: string
    phone: string | null
  },
): Promise<void> {
  let professionalId: string | null = null

  if (params.role === 'professional') {
    const phoneDigits = params.phone?.replace(/\D/g, '') ?? ''
    const last9 = phoneDigits.slice(-9)
    let professionalQuery = supabase
      .from(T.PROFESSIONALS)
      .select('id, user_id')
      .eq('clinic_id', params.clinicId)
      .eq('active', true)
      .limit(1)

    if (params.email) {
      professionalQuery = professionalQuery.ilike('email', params.email)
    } else if (last9) {
      professionalQuery = professionalQuery.ilike('phone', `%${last9}%`)
    } else {
      professionalQuery = professionalQuery.eq('id', '__no_match__')
    }

    const { data: professional } = await professionalQuery.maybeSingle()
    const professionalRow = professional as { id: string; user_id?: string | null } | null
    if (professionalRow) {
      professionalId = professionalRow.id
      if (!professionalRow.user_id || professionalRow.user_id === params.userId) {
        await supabase
          .from(T.PROFESSIONALS)
          .update({ user_id: params.userId })
          .eq('id', professionalRow.id)
          .eq('clinic_id', params.clinicId)
      }
    }
  }

  await supabase
    .from(T.USER_CLINIC_MEMBERSHIPS)
    .upsert({
      user_id: params.userId,
      clinic_id: params.clinicId,
      professional_id: professionalId,
      active: true,
    }, { onConflict: 'user_id,clinic_id' })
}

async function provisionPrimaryProfileSafely(
  supabase: ReturnType<typeof createClient>,
  params: {
    userId: string
    targetClinicId: string
    targetClinicName: string
    displayName: string
    email: string
    phone: string | null
    requestedRoles: string[]
    operation: 'create_clinic' | 'join_clinic'
  },
): Promise<{ ok: true; roles: string[] } | { ok: false; replyText: string }> {
  const existingProfile = await loadExistingProfileSnapshot(supabase, params.userId)
  const guard = evaluateProfileProvisioning(existingProfile, params.targetClinicId, params.requestedRoles)

  if (guard.kind === 'cross_clinic_conflict') {
    return {
      ok: false,
      replyText: buildCrossClinicConflictReply({
        email: params.email,
        existingClinicName: existingProfile?.clinicName ?? null,
        targetClinicName: params.targetClinicName,
        operation: params.operation,
      }),
    }
  }

  const nextRoles = guard.mergedRoles ?? params.requestedRoles
  const { error: profileError } = await supabase.from(T.USER_PROFILES).upsert({
    id:        params.userId,
    name:      params.displayName,
    roles:     nextRoles,
    clinic_id: params.targetClinicId,
    phone:     params.phone,
  })

  if (profileError) {
    console.error('[platform-agent] profile provisioning error:', profileError)
    return {
      ok: false,
      replyText: '😅 Não consegui concluir o acesso com segurança agora. Tente novamente em instantes ou use outro e-mail.',
    }
  }

  await ensureUserClinicMembership(supabase, {
    userId: params.userId,
    clinicId: params.targetClinicId,
    role: params.requestedRoles[0] ?? 'professional',
    email: params.email,
    phone: params.phone,
  })

  return { ok: true, roles: nextRoles }
}

async function rollbackCreatedClinic(
  supabase: ReturnType<typeof createClient>,
  params: { clinicId: string; userId: string | null; deleteInvitedUser: boolean },
): Promise<void> {
  await supabase.from(T.CLINICS).delete().eq('id', params.clinicId)
  if (params.deleteInvitedUser && params.userId) {
    try {
      await supabase.auth.admin.deleteUser(params.userId)
    } catch (error) {
      console.error('[platform-agent] deleteUser rollback error:', error)
    }
  }
}

// ─── formatAgendaForPrompt ────────────────────────────────────────────────────

function formatAgendaForPrompt(items: AgendaItem[], label: string): string {
  if (items.length === 0) return `${label}: nenhum agendamento`
  const icons: Record<string, string> = { scheduled: '⚪', confirmed: '🔵', completed: '✅', cancelled: '❌', no_show: '🚫' }
  return [
    `${label} (${items.length} agendamentos):`,
    ...items.map((a, i) => {
      const brtStart = new Date(a.startsAt)
      const hh = String((brtStart.getUTCHours() - 3 + 24) % 24).padStart(2, '0')
      const mm = String(brtStart.getUTCMinutes()).padStart(2, '0')
      const icon = icons[a.status] ?? '•'
      const price = a.chargeCents ? ` | ${formatCentsBRL(a.chargeCents)}` : ''
      return `  [${i + 1}] ID:${a.id} ${icon} ${hh}:${mm} | ${a.patientName} | ${a.professionalName}${a.serviceType ? ` | ${a.serviceType}` : ''}${price}`
    }),
  ].join('\n')
}

// ─── formatCentsBRL ───────────────────────────────────────────────────────────

function formatCentsBRL(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`
}

// ─────────────────────────────────────────────────────────────────────────────

async function searchClinics(
  supabase: ReturnType<typeof createClient>,
  name: string,
): Promise<{ id: string; name: string }[]> {
  // Use the first meaningful word as the search term
  const words = name.trim().split(/\s+/).filter(w => w.length > 2)
  const term  = words[0] ?? name.trim()

  const { data } = await supabase
    .from(T.CLINICS)
    .select('id, name')
    .ilike('name', `%${term}%`)
    .limit(5)

  return (data ?? []) as { id: string; name: string }[]
}

// ─── Find admin WhatsApp phones for a clinic ──────────────────────────────────

async function findAdminPhonesForClinic(
  supabase:  ReturnType<typeof createClient>,
  clinicId:  string,
): Promise<string[]> {
  // 1. Find all admin user_ids for this clinic
  const { data: profiles } = await supabase
    .from(T.USER_PROFILES)
    .select('id')
    .eq('clinic_id', clinicId)
    .contains('roles', ['admin'])

  const adminIds = ((profiles ?? []) as { id: string }[]).map(p => p.id)
  if (adminIds.length === 0) return []

  // 2. Cross-reference against wa_platform_users
  const { data: waUsers } = await supabase
    .from(T.WA_PLATFORM_USERS)
    .select('phone')
    .in('linked_user_id', adminIds)

  return ((waUsers ?? []) as { phone: string }[]).map(u => u.phone)
}

// ─── Invite staff: email invite + WhatsApp welcome message ───────────────────

async function inviteStaffWithWA(opts: {
  supabase:   ReturnType<typeof createClient>
  staffEmail: string
  staffPhone: string
  staffName:  string
  clinicId:   string
  clinicName: string
  role:       string
}): Promise<void> {
  const { supabase, staffEmail, staffPhone, staffName, clinicId, clinicName, role } = opts
  const firstName = staffName.split(' ')[0] || staffEmail

  const authProvision = await resolveAuthUserForInvite(supabase, staffEmail)
  if (!authProvision.userId) {
    throw new Error('Failed to provision auth user for staff invite')
  }

  const profileProvision = await provisionPrimaryProfileSafely(supabase, {
    userId: authProvision.userId,
    targetClinicId: clinicId,
    targetClinicName: clinicName,
    displayName: staffName || staffEmail,
    email: staffEmail,
    phone: staffPhone,
    requestedRoles: [role],
    operation: 'join_clinic',
  })

  if (!profileProvision.ok) {
    if (authProvision.createdNewAuthUser) {
      try {
        await supabase.auth.admin.deleteUser(authProvision.userId)
      } catch (error) {
        console.error('[platform-agent] deleteUser direct-invite rollback error:', error)
      }
    }
    throw new Error(profileProvision.replyText)
  }

  // 2. Send WhatsApp invite message
  await sendWA(
    staffPhone,
    [
      `Olá, ${firstName}! 👋`,
      ``,
      `Você foi convidado(a) para fazer parte da equipe da *${clinicName}* no *Consultin*.`,
      ``,
      `Verifique seu e-mail *${staffEmail}* para criar sua senha e acessar o painel em:`,
      `👉 ${SITE_URL}`,
      ``,
      `Qualquer dúvida, é só responder aqui. 😊`,
    ].join('\n'),
  )
}

// ─── Typing indicator ────────────────────────────────────────────────────────

/**
 * Shows the 3-dot typing indicator to the user while the AI is processing.
 * Fire-and-forget — never throw.
 */
async function sendPlatformTypingIndicator(waMessageId: string): Promise<void> {
  if (!PLATFORM_PHONE_ID || !PLATFORM_WA_TOKEN) return
  try {
    await fetch(`${META_GRAPH_BASE}/${PLATFORM_PHONE_ID}/messages`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${PLATFORM_WA_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status:            'read',
        message_id:        waMessageId,
        typing_indicator:  { type: 'text' },
      }),
    })
  } catch { /* best-effort */ }
}

// ─── Telegram notification ──────────────────────────────────────────────────

async function notifyTelegram(lines: string[]): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id:    TELEGRAM_CHAT_ID,
        text:       lines.join('\n'),
        parse_mode: 'Markdown',
      }),
    })
  } catch (e) {
    console.error('[platform-agent] Telegram error (non-fatal):', e)
  }
}

// ─── WhatsApp send ────────────────────────────────────────────────────────────

async function sendWA(toPhone: string, text: string): Promise<void> {
  if (!PLATFORM_PHONE_ID || !PLATFORM_WA_TOKEN) {
    console.warn('[platform-agent] WA credentials not set — skipping send')
    return
  }
  const res = await fetch(`${META_GRAPH_BASE}/${PLATFORM_PHONE_ID}/messages`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${PLATFORM_WA_TOKEN}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to:                toPhone,
      type:              'text',
      text:              { body: text, preview_url: false },
    }),
  })
  if (!res.ok) console.error('[platform-agent] WA send error:', await res.text())
}

async function sendWAInteractive(
  toPhone: string,
  text: string,
  buttons: { id: string; title: string }[],
): Promise<void> {
  if (!PLATFORM_PHONE_ID || !PLATFORM_WA_TOKEN) {
    console.warn('[platform-agent] WA credentials not set — skipping send')
    return
  }

  const safeButtons = buttons
    .slice(0, 3)
    .map((b, i) => ({
      type: 'reply' as const,
      reply: {
        id: (b.id?.trim() || `btn_${i + 1}`).slice(0, 256),
        title: (b.title?.trim() || `Opção ${i + 1}`).slice(0, 20),
      },
    }))

  if (safeButtons.length === 0) {
    await sendWA(toPhone, text)
    return
  }

  const res = await fetch(`${META_GRAPH_BASE}/${PLATFORM_PHONE_ID}/messages`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${PLATFORM_WA_TOKEN}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to:                toPhone,
      type:              'interactive',
      interactive: {
        type: 'button',
        body: { text: text.slice(0, 1024) },
        action: { buttons: safeButtons },
      },
    }),
  })

  if (!res.ok) {
    console.error('[platform-agent] WA interactive send error:', await res.text())
    await sendWA(toPhone, text)
  }
}
