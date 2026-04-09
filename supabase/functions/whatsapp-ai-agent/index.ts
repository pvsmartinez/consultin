/**
 * Edge Function: whatsapp-ai-agent
 *
 * Processes an inbound WhatsApp message and decides what action to take.
 * Routes to patient or staff mode based on actor_type.
 *
 * ── PATIENT MODE ──────────────────────────────────────────────────────────────
 * Actions the AI can return:
 *   reply               — plain text response
 *   confirm_appointment — confirm an existing upcoming appointment
 *   cancel_appointment  — cancel an existing upcoming appointment
 *   reschedule_request  — cancel current + show new available slots
 *   book_appointment    — create a new appointment (webhook executes INSERT)
 *   patient_checkin     — patient arrives at clinic ("cheguei", "estou chegando")
 *   register_patient    — register unknown user as new patient
 *   escalate            — hand off to human attendant
 *
 * ── STAFF MODE ────────────────────────────────────────────────────────────────
 * For professional / receptionist / admin actors (identified by phone in
 * professionals or user_profiles tables).
 * Read-only queries (agenda, rooms, slots) are injected into the prompt;
 * the LLM returns structured action JSON.
 * State-changing actions:
 *   staff_mark_completed     — mark appointment as completed (triggers satisfaction survey)
 *   staff_mark_noshow        — mark appointment as no-show
 *   staff_cancel_appointment — cancel an appointment
 *   staff_book_for_patient   — book a new appointment for a patient
 *   staff_find_patient       — search patient by name (webhook resolves + replies with list)
 *   escalate                 — when request can't be handled
 *
 * Multi-day support: detectRequestedDate() parses "amanhã", "sexta", "05/04" etc.
 * Multi-day range: detectRequestedDateRange() parses "semana", "seg a sex", "próximos 3 dias"
 *
 * Called by whatsapp-webhook. Uses OpenRouter with clinic's configured model.
 */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL       = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SRK       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')!
const OPENROUTER_BASE    = 'https://openrouter.ai/api/v1'
const SITE_URL           = 'https://consultin.pmatz.com'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentRequest {
  clinicId:        string
  sessionId:       string
  patientId?:      string | null
  professionalId?: string | null
  actorType:       'patient' | 'professional' | 'receptionist' | 'admin' | 'unknown'
  message:         string
  history:         { role: 'user' | 'assistant'; content: string }[]
  staffUserId?:    string | null
}

interface ClinicRow {
  name:                   string
  phone:                  string | null
  address:                string | null
  city:                   string | null
  state:                  string | null
  wa_ai_model:            string | null
  working_hours:          unknown
  slot_duration_minutes:  number
  wa_ai_custom_prompt:    string | null
  wa_ai_allow_schedule:   boolean | null
  wa_ai_allow_confirm:    boolean | null
  wa_ai_allow_cancel:     boolean | null
  subscription_tier:      string | null
  subscription_status:    string | null
  trial_ends_at:          string | null
  billing_override_enabled: boolean | null
}

interface SlotOption {
  professionalId:   string
  professionalName: string
  specialty:        string | null
  startsAt:         string  // ISO UTC
  endsAt:           string  // ISO UTC
  displayDate:      string  // e.g. "Seg 07/04"
  displayTime:      string  // e.g. "09:00"
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SRK)

  let body: AgentRequest
  try { body = await req.json() }
  catch { return jsonError('Invalid JSON', 400) }

  const { clinicId, sessionId, actorType, message, history } = body

  // ── Fetch clinic context ─────────────────────────────────────────────────
  const { data: clinic } = await supabase
    .from('clinics')
    .select('name, phone, address, city, state, wa_ai_model, working_hours, slot_duration_minutes, wa_ai_custom_prompt, wa_ai_allow_schedule, wa_ai_allow_confirm, wa_ai_allow_cancel, subscription_tier, subscription_status, trial_ends_at, billing_override_enabled')
    .eq('id', clinicId)
    .single()

  if (!clinic) return jsonError('Clinic not found', 404)

  // ── Route to patient or staff mode ────────────────────────────────────────
  const isStaff = actorType === 'professional' || actorType === 'admin' || actorType === 'receptionist'

  if (isStaff) {
    return handleStaffMessage(supabase, body, clinic as ClinicRow, sessionId)
  } else {
    return handlePatientMessage(supabase, body, clinic as ClinicRow, sessionId)
  }
})

// ─── PATIENT MODE ─────────────────────────────────────────────────────────────

async function handlePatientMessage(
  supabase: ReturnType<typeof createClient>,
  body:     AgentRequest,
  clinic:   ClinicRow,
  sessionId: string,
) {
  const { clinicId, patientId, message, history } = body

  const allowConfirm  = clinic.wa_ai_allow_confirm  !== false
  const allowCancel   = clinic.wa_ai_allow_cancel   !== false
  const allowSchedule = clinic.wa_ai_allow_schedule === true

  // ── Fetch FAQ + upcoming appointments in parallel ─────────────────────────
  const [{ data: faqRows }, { data: appts }] = await Promise.all([
    supabase
      .from('whatsapp_faqs')
      .select('question, answer')
      .eq('clinic_id', clinicId)
      .eq('active', true)
      .order('sort_order')
      .order('created_at'),
    patientId
      ? supabase
          .from('appointments')
          .select('id, starts_at, professionals(name)')
          .eq('patient_id', patientId)
          .in('status', ['scheduled', 'confirmed'])
          .gte('starts_at', new Date().toISOString())
          .order('starts_at', { ascending: true })
          .limit(3)
      : Promise.resolve({ data: [] }),
  ])

  const pendingAppts = ((appts ?? []) as { id: string; starts_at: string; professionals: { name: string } | null }[])
    .map(a => ({
      id:               a.id,
      starts_at:        a.starts_at,
      professional_name: (a.professionals as { name: string })?.name ?? 'Profissional',
    }))

  // ── Fetch available slots (only when scheduling enabled) ──────────────────
  let availableSlotsText = ''
  if (allowSchedule) {
    const slots = await findAvailableSlots(supabase, clinicId, clinic.slot_duration_minutes)
    if (slots.length > 0) {
      availableSlotsText = [
        '',
        'Horários disponíveis para agendamento (próximas 2 semanas):',
        ...slots.map((s, i) =>
          `  ${i + 1}. ${s.displayDate} às ${s.displayTime} — ${s.professionalName}${s.specialty ? ` (${s.specialty})` : ''} [profId:${s.professionalId}|start:${s.startsAt}|end:${s.endsAt}]`,
        ),
      ].join('\n')
    } else {
      availableSlotsText = '\nNão há horários disponíveis nas próximas 2 semanas.'
    }
  }

  // ── Build system prompt ───────────────────────────────────────────────────
  const faqSection = faqRows && faqRows.length > 0
    ? '\nPerguntas frequentes:\n' +
      (faqRows as { question: string; answer: string }[])
        .map(f => `P: ${f.question}\nR: ${f.answer}`)
        .join('\n')
    : ''

  const allowedActions = [
    `- { "action": "reply", "replyText": "..." }`,
    allowConfirm && `- { "action": "confirm_appointment", "appointmentId": "...", "replyText": "..." }`,
    allowCancel  && `- { "action": "cancel_appointment",  "appointmentId": "...", "replyText": "..." }`,
    allowCancel  && `- { "action": "reschedule_request", "appointmentId": "...", "replyText": "..." } — cancelar e já oferecer novos horários`,
    allowSchedule && `- { "action": "book_appointment", "professionalId": "...", "startsAt": "ISO-datetime", "endsAt": "ISO-datetime", "replyText": "..." }`,
    patientId && `- { "action": "patient_checkin", "appointmentId": "...", "replyText": "..." } — paciente diz que chegou/está chegando`,
    !patientId && `- { "action": "register_patient", "patientName": "...", "replyText": "..." }`,
    `- { "action": "escalate", "replyText": "..." }`,
  ].filter(Boolean).join('\n')

  const rules = [
    allowConfirm
      ? '1. Se o paciente confirmar uma consulta → use confirm_appointment com o appointmentId correto.'
      : '1. Se o paciente quiser confirmar → use escalate (atendente irá confirmar).',
    allowCancel
      ? '2. Se o paciente cancelar SEM querer remarcar → use cancel_appointment com o appointmentId correto.'
      : '2. Se o paciente quiser cancelar → use escalate.',
    allowCancel && allowSchedule
      ? '3. Se o paciente quiser REMARCAR (cancelar e agendar outro horário) → use reschedule_request com o appointmentId atual. O webhook cancela e oferece novos slots automaticamente.'
      : '3. Para remarcar → use escalate.',
    allowSchedule
      ? '4. Se o paciente quiser agendar NOVO → liste os horários disponíveis e peça confirmação. Ao confirmar, use book_appointment com os dados do slot escolhido (profId, startsAt, endsAt estão entre colchetes na lista de horários).'
      : '4. Se o paciente quiser agendar → use escalate (não há agendamento automático nesta clínica).',
    patientId
      ? '5. Se o paciente disser que chegou, está chegando, está na recepção, está esperando → use patient_checkin com o próximo appointmentId (o mais próximo).'
      : '5. Paciente não cadastrado — não há check-in.',
    !patientId
      ? '6. Se o paciente não estiver cadastrado e quiser fazer algo → pergunte o nome completo e use register_patient.'
      : '6. Paciente já está cadastrado.',
    '7. Nunca invente appointmentIds ou dados clínicos. Use apenas o que está no contexto.',
    '8. Para perguntas médicas, sensíveis ou complexas → use escalate.',
    '9. Responda APENAS com JSON válido. Sem texto extra fora do JSON.',
  ].filter(Boolean).join('\n')

  const systemPrompt = [
    `Você é o assistente virtual WhatsApp da clínica "${clinic.name}" no Brasil.`,
    `Responda sempre em Português do Brasil, de forma breve e amigável (máx 3 parágrafos).`,
    clinic.wa_ai_custom_prompt ? `\n${clinic.wa_ai_custom_prompt}` : '',
    `\nInformações da clínica:`,
    `- Endereço: ${clinic.address ?? 'não informado'}, ${clinic.city ?? ''} - ${clinic.state ?? ''}`,
    `- Telefone: ${clinic.phone ?? 'não informado'}`,
    faqSection,
    availableSlotsText,
    `\nPróximas consultas do paciente:`,
    pendingAppts.length > 0
      ? pendingAppts.map(a =>
          `- ID:${a.id} | ${fmtDateTimeBR(a.starts_at)} com ${a.professional_name}`,
        ).join('\n')
      : '- Nenhuma consulta agendada.',
    buildQuotaNotice(clinic),
    buildPatientLinks(),
    `\nAções disponíveis (retorne APENAS um desses JSONs):`,
    allowedActions,
    `\nRegras:`,
    rules,
  ].join('\n')

  return callLLM(clinic, systemPrompt, history, message, sessionId, supabase, patientId)
}

// ─── STAFF MODE ───────────────────────────────────────────────────────────────

async function handleStaffMessage(
  supabase:   ReturnType<typeof createClient>,
  body:       AgentRequest,
  clinic:     ClinicRow,
  sessionId:  string,
) {
  const { clinicId, professionalId, actorType, message, history } = body

  // ── Detect which date(s) the staff is asking about ───────────────────────
  const dateRange    = detectRequestedDateRange(message)
  const requestedDate = dateRange.start
  const rangeDays    = dateRange.days  // 1 = single day, >1 = multi-day range

  const dayStart = new Date(requestedDate)
  dayStart.setHours(0, 0, 0, 0)
  const rangeEnd = new Date(dayStart)
  rangeEnd.setDate(rangeEnd.getDate() + rangeDays)

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const isToday = dayStart.getTime() === today.getTime() && rangeDays === 1

  // ── Pre-fetch agenda, rooms, and slots (if booking) in parallel ───────────
  const [{ data: dayAppts }, { data: rooms }, { data: staffProf }, { data: profs }] = await Promise.all([
    supabase
      .from('appointments')
      .select('id, starts_at, ends_at, status, patients(name), professionals(name), clinic_rooms(id, name), service_types(name)')
      .eq('clinic_id', clinicId)
      .gte('starts_at', dayStart.toISOString())
      .lt('starts_at', rangeEnd.toISOString())
      .not('status', 'in', '("cancelled","no_show")')
      .order('starts_at', { ascending: true }),
    supabase
      .from('clinic_rooms')
      .select('id, name')
      .eq('clinic_id', clinicId)
      .eq('active', true),
    professionalId
      ? supabase.from('professionals').select('id, name, specialty').eq('id', professionalId).single()
      : Promise.resolve({ data: null }),
    // Fetch active professionals for staff booking
    supabase
      .from('professionals')
      .select('id, name, specialty')
      .eq('clinic_id', clinicId)
      .eq('active', true),
  ])

  // ── Format agenda ─────────────────────────────────────────────────────────
  const staffName = (staffProf as { name?: string } | null)?.name ?? 'Equipe'
  const apptRows = (dayAppts ?? []) as AppointmentRow[]

  const byProf: Record<string, { profName: string; appts: AppointmentRow[] }> = {}
  for (const a of apptRows) {
    const pName = (a.professionals as { name: string })?.name ?? 'Sem profissional'
    if (!byProf[pName]) byProf[pName] = { profName: pName, appts: [] }
    byProf[pName].appts.push(a)
  }

  const agendaLines: string[] = []
  for (const group of Object.values(byProf)) {
    agendaLines.push(`*${group.profName}*`)
    for (const a of group.appts) {
      const time    = rangeDays > 1 ? fmtDateTimeBR(a.starts_at) : fmtTimeBR(a.starts_at)
      const patient = (a.patients as { name: string })?.name ?? 'Paciente'
      const service = (a.service_types as { name: string })?.name ?? ''
      const room    = (a.clinic_rooms as { name: string })?.name ?? ''
      const status  = a.status === 'confirmed' ? '✅' : a.status === 'completed' ? '☑️' : '🕐'
      agendaLines.push(
        `  ${status} ${time} → ${patient}${service ? ` _(${service})_` : ''}${room ? ` — ${room}` : ''} [ID:${a.id}]`,
      )
    }
  }
  const dayLabel = isToday
    ? 'HOJE'
    : rangeDays > 1
      ? `${requestedDate.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }).toUpperCase()} (+${rangeDays - 1} dias)`
      : requestedDate.toLocaleDateString('pt-BR', {
          weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo',
        }).toUpperCase()
  const agendaText = agendaLines.length > 0
    ? agendaLines.join('\n')
    : `Nenhuma consulta agendada para ${isToday ? 'hoje' : 'esse dia'}.`

  // ── Format rooms status (only meaningful for today) ───────────────────────
  const now = new Date()
  const occupiedRoomIds = new Set(
    isToday
      ? apptRows
          .filter(a => new Date(a.starts_at) <= now && new Date(a.ends_at ?? a.starts_at) >= now)
          .map(a => (a.clinic_rooms as { id: string } | null)?.id)
          .filter(Boolean)
      : [],
  )
  const roomLines = (rooms ?? []).map((r: { id: string; name: string }) =>
    `  ${occupiedRoomIds.has(r.id) ? '🔴' : '🟢'} ${r.name}${isToday ? ` — ${occupiedRoomIds.has(r.id) ? 'ocupada agora' : 'livre'}` : ''}`,
  )
  const roomsText = roomLines.length > 0 ? roomLines.join('\n') : 'Nenhuma sala cadastrada.'

  // ── Available slots for the requested day (for booking) ───────────────────
  const slots = await findAvailableSlots(supabase, clinicId, clinic.slot_duration_minutes, 20, requestedDate)
  const slotsText = slots.length > 0
    ? [
        '',
        `Horários disponíveis para ${isToday ? 'hoje' : dayLabel.toLowerCase()}:`,
        ...slots.map((s, i) =>
          `  ${i + 1}. ${s.displayTime} — ${s.professionalName}${s.specialty ? ` (${s.specialty})` : ''} [profId:${s.professionalId}|start:${s.startsAt}|end:${s.endsAt}]`,
        ),
      ].join('\n')
    : `\nNenhum horário disponível para ${isToday ? 'hoje' : dayLabel.toLowerCase()}.`

  // ── Professionals list (for booking by name) ──────────────────────────────
  const profsText = (profs ?? []).length > 0
    ? '\nProfissionais ativos: ' + (profs as { id: string; name: string }[])
        .map(p => `${p.name} [id:${p.id}]`)
        .join(', ')
    : ''

  // ── Date context ──────────────────────────────────────────────────────────
  const todayFormatted = now.toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  })

  // ── Staff allowed actions ─────────────────────────────────────────────────
  const allowedActions = [
    `- { "action": "reply", "replyText": "..." } — responder com informações`,
    `- { "action": "staff_confirm_appointment", "appointmentId": "...", "replyText": "..." } — confirmar presença do paciente`,
    `- { "action": "staff_mark_completed", "appointmentId": "...", "replyText": "..." } — marcar como concluída (dispara pesquisa de satisfação ao paciente)`,
    `- { "action": "staff_mark_noshow", "appointmentId": "...", "replyText": "..." } — registrar falta`,
    `- { "action": "staff_cancel_appointment", "appointmentId": "...", "replyText": "..." } — cancelar consulta`,
    `- { "action": "staff_reschedule_appointment", "appointmentId": "...", "professionalId": "...", "startsAt": "ISO", "endsAt": "ISO", "replyText": "..." } — remarcar consulta para novo horário (use slots disponíveis acima)`,
    `- { "action": "staff_find_patient", "patientName": "...", "replyText": "..." } — buscar paciente por nome`,
    `- { "action": "staff_create_patient", "patientName": "...", "patientPhone": "...", "replyText": "..." } — cadastrar novo paciente quando não encontrado`,
    `- { "action": "staff_book_for_patient", "targetPatientId": "...", "professionalId": "...", "startsAt": "ISO", "endsAt": "ISO", "replyText": "..." } — agendar para paciente`,
    `- { "action": "escalate", "replyText": "..." } — não consegui processar`,
  ].join('\n')

  const rules = [
    '1. Para consultas, use os IDs entre [ID:...] na agenda.',
    '2. "confirmar", "confirmo", "va comparecer" → staff_confirm_appointment.',
    '3. Para agendar: identifique o paciente PRIMEIRO. Se o paciente está na agenda, o id já está lá. Se não, use staff_find_patient.',
    '4. Se staff_find_patient não achar ninguém, use staff_create_patient para cadastrar. Depois use staff_book_for_patient com o patientId retornado.',
    '5. Para REMARCAR: use staff_reschedule_appointment com o appointmentId original e o novo startsAt/endsAt dos slots disponíveis.',
    '6. Se o slot pedido não estiver disponível, use reply para pedir outro horário.',
    '7. "concluir", "finalizar", "completar" → staff_mark_completed. Envia pesquisa de satisfação ao paciente.',
    '8. "faltou", "no-show", "não compareceu" → staff_mark_noshow.',
    '9. Nunca invente IDs ou dados. Use apenas o que está no contexto.',
    '10. Responda APENAS com JSON válido. Sem texto extra.',
  ].join('\n')

  const systemPrompt = [
    `Você é o assistente interno WhatsApp da clínica "${clinic.name}" para ${staffName} (${actorType}).`,
    `Hoje é ${todayFormatted}. Responda em Português do Brasil, de forma direta e objetiva.`,
    clinic.wa_ai_custom_prompt ? `\n${clinic.wa_ai_custom_prompt}` : '',
    `\n=== AGENDA — ${dayLabel} ===`,
    agendaText,
    `\n=== SALAS ===`,
    roomsText,
    slotsText,
    profsText,
    buildQuotaNotice(clinic),
    buildStaffLinks(),
    `\nAções disponíveis (retorne APENAS um desses JSONs):`,
    allowedActions,
    `\nRegras:`,
    rules,
  ].join('\n')

  return callLLM(clinic, systemPrompt, history, message, sessionId, supabase, null)
}

// ─── LLM call (shared) ────────────────────────────────────────────────────────

/**
 * Site shortcut links to inject into the staff system prompt.
 * The AI will share these contextually when the user asks to view/manage something.
 */
function buildStaffLinks(): string {
  return [
    '\n=== ATALHOS DO SITE ===',
    'Quando o usuário quiser ver ou gerenciar algo no site, envie o link direto (junto com a resposta):',
    `- Agenda completa: ${SITE_URL}/agenda`,
    `- Minha agenda: ${SITE_URL}/minha-agenda`,
    `- Minha disponibilidade: ${SITE_URL}/minha-disponibilidade`,
    `- Pacientes: ${SITE_URL}/pacientes`,
    `- Equipe/funcionários: ${SITE_URL}/equipe`,
    `- Financeiro: ${SITE_URL}/financeiro`,
    `- Configurações: ${SITE_URL}/configuracoes`,
    `- Assinatura/plano: ${SITE_URL}/assinatura`,
  ].join('\n')
}

/**
 * Site shortcut links to inject into the patient system prompt.
 */
function buildPatientLinks(): string {
  return [
    '\n=== ATALHOS DO SITE ===',
    'Quando relevante, envie o link direto para o paciente acessar no site:',
    `- Minhas consultas: ${SITE_URL}/minhas-consultas`,
    `- Agendar consulta: ${SITE_URL}/agendar`,
    `- Meu perfil: ${SITE_URL}/meu-perfil`,
  ].join('\n')
}

/**
 * Returns a notice string to inject into the system prompt when the clinic is
 * near or over their monthly appointment quota. Empty string if not applicable.
 */
function buildQuotaNotice(clinic: ClinicRow): string {
  const LIMITS: Record<string, number | null> = { trial: null, basic: 40, professional: 100, unlimited: null }
  const tier  = clinic.subscription_tier ?? 'trial'
  const limit = LIMITS[tier] ?? null
  if (!limit) return ''

  const hasActive = clinic.subscription_status === 'ACTIVE' || !!clinic.billing_override_enabled
  if (!hasActive) return ''

  // We don't have the real-time used count here (would require a DB query per message).
  // Instead, include the limit so the AI can mention it if the user asks.
  const tierLabels: Record<string, string> = { basic: 'Básico', professional: 'Profissional' }
  return `\n=== PLANO ===\nPlano: ${tierLabels[tier] ?? tier} — até ${limit} consultas/mês.\nSe o limit for atingido, novos agendamentos são bloqueados. Quando relevante, informe ao usuário que o upgrade está em: https://consultin.pmatz.com/configuracoes`
}

async function callLLM(
  clinic:    ClinicRow,
  systemPrompt: string,
  history:   { role: 'user' | 'assistant'; content: string }[],
  message:   string,
  sessionId: string,
  supabase:  ReturnType<typeof createClient>,
  patientId: string | null | undefined,
) {
  const model           = clinic.wa_ai_model ?? 'google/gemma-4-31b-it'
  const supportsJsonMode = (model as string).startsWith('openai/')

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-12),
    { role: 'user', content: message },
  ]

  const orRes = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://consultin.app',
      'X-Title':      'Consultin WhatsApp Agent',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      max_tokens:  1024,
      ...(supportsJsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  })

  if (!orRes.ok) {
    console.error('[ai-agent] OpenRouter error:', await orRes.text())
    return json({
      action: 'escalate',
      replyText: 'Estou com dificuldades no momento. Um atendente irá responder em breve! 😊',
    })
  }

  const orBody     = await orRes.json()
  const rawContent = orBody?.choices?.[0]?.message?.content ?? ''

  // ── Parse AI response ─────────────────────────────────────────────────────
  // Strip markdown code fences if the model wrapped JSON in ```json...```
  const cleaned = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    console.error('[ai-agent] Failed to parse AI JSON:', rawContent)
    return json({
      action: 'escalate',
      replyText: 'Não entendi sua mensagem. Um atendente irá te ajudar! 😊',
    })
  }

  // ── Validate patient-owned appointmentId ──────────────────────────────────
  if (
    (parsed.action === 'confirm_appointment' || parsed.action === 'cancel_appointment') &&
    parsed.appointmentId &&
    patientId
  ) {
    const { data: appt } = await supabase
      .from('appointments')
      .select('id')
      .eq('id', parsed.appointmentId as string)
      .eq('patient_id', patientId)
      .maybeSingle()

    if (!appt) {
      return json({
        action: 'escalate',
        replyText: 'Não encontrei essa consulta. Um atendente irá verificar! 😊',
      })
    }
  }

  // ── Store AI draft in session when escalating ─────────────────────────────
  if (parsed.action === 'escalate' && parsed.replyText) {
    await supabase
      .from('whatsapp_sessions')
      .update({ ai_draft: parsed.replyText })
      .eq('id', sessionId)
  }

  return json(parsed)
}

// ─── Date detection helpers ───────────────────────────────────────────────────

/**
 * Parse a natural language date reference from a staff message.
 * Returns { start: Date, days: number } for the requested range.
 * Default: today, 1 day.
 */
function detectRequestedDateRange(message: string): { start: Date; days: number } {
  const now = new Date()
  const today = new Date(now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }))
  const single = (d: Date) => ({ start: d, days: 1 })

  const lower = message.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // strip accents

  // Multi-day ranges
  if (/semana\b/.test(lower)) {
    // "essa semana" / "da semana" → from today until end of week (Sunday)
    const daysUntilSunday = ((7 - today.getDay()) % 7) || 7
    const days = Math.min(daysUntilSunday, 7)
    return { start: today, days }
  }
  if (/proximos?\s+(\d+)\s+dias?/.test(lower)) {
    const m = lower.match(/proximos?\s+(\d+)\s+dias?/)!
    return { start: today, days: Math.min(parseInt(m[1]), 14) }
  }
  // "seg(unda) a sex(ta)" / "segunda até sexta" range
  const weekdays: Record<string, number> = {
    domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6,
    dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6,
  }
  const rangeMatch = lower.match(/(\w+)\s+(?:a|ate)\s+(\w+)/)
  if (rangeMatch) {
    const fromDay = weekdays[rangeMatch[1]]
    const toDay   = weekdays[rangeMatch[2]]
    if (fromDay !== undefined && toDay !== undefined) {
      const diff = (fromDay - today.getDay() + 7) % 7
      const start = new Date(today); start.setDate(start.getDate() + diff)
      const days  = ((toDay - fromDay + 7) % 7) + 1
      return { start, days: Math.min(days, 7) }
    }
  }

  // Single-day references
  if (/\bamanha\b/.test(lower)) {
    const d = new Date(today); d.setDate(d.getDate() + 1); return single(d)
  }
  if (/depois de amanha/.test(lower)) {
    const d = new Date(today); d.setDate(d.getDate() + 2); return single(d)
  }
  for (const [name, wd] of Object.entries(weekdays)) {
    if (lower.includes(name)) {
      const diff = (wd - today.getDay() + 7) % 7 || 7
      const d = new Date(today); d.setDate(d.getDate() + diff); return single(d)
    }
  }
  // Explicit date "DD/MM" or "DD/MM/YYYY"
  const dateMatch = lower.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/)
  if (dateMatch) {
    const day   = parseInt(dateMatch[1])
    const month = parseInt(dateMatch[2]) - 1
    const year  = dateMatch[3]
      ? (dateMatch[3].length === 2 ? 2000 + parseInt(dateMatch[3]) : parseInt(dateMatch[3]))
      : today.getFullYear()
    const d = new Date(year, month, day)
    if (!isNaN(d.getTime())) return single(d)
  }

  return single(today)
}

/** Legacy single-date helper (used by patient slot finder) */
function detectRequestedDate(message: string): Date {
  return detectRequestedDateRange(message).start
}

// ─── Available slots finder ───────────────────────────────────────────────────

async function findAvailableSlots(
  supabase:      ReturnType<typeof createClient>,
  clinicId:      string,
  slotDuration:  number,
  maxSlots = 10,
  targetDate?: Date,  // if provided, only fetch slots for that specific day
): Promise<SlotOption[]> {
  const now      = new Date()
  // If a specific date is requested, search only that day; otherwise search 14 days
  const searchStart = targetDate ?? now
  const searchDays  = targetDate ? 1 : 14
  const twoWeeks    = new Date(searchStart.getTime() + searchDays * 24 * 60 * 60 * 1000)

  const { data: professionals } = await supabase
    .from('professionals')
    .select('id, name, specialty')
    .eq('clinic_id', clinicId)
    .eq('active', true)

  if (!professionals || professionals.length === 0) return []

  const profIds = (professionals as { id: string }[]).map(p => p.id)

  const [{ data: availSlots }, { data: busyAppts }] = await Promise.all([
    supabase
      .from('availability_slots')
      .select('professional_id, weekday, start_time, end_time, week_parity, active')
      .in('professional_id', profIds)
      .eq('active', true),
    supabase
      .from('appointments')
      .select('professional_id, starts_at, ends_at')
      .eq('clinic_id', clinicId)
      .not('status', 'in', '("cancelled","no_show")')
      .gte('starts_at', searchStart.toISOString())
      .lt('starts_at', twoWeeks.toISOString()),
  ])

  if (!availSlots) return []

  const busy = (busyAppts ?? []) as { professional_id: string; starts_at: string; ends_at: string }[]
  const results: SlotOption[] = []

  for (let d = 0; d < searchDays && results.length < maxSlots; d++) {
    const date = new Date(searchStart)
    date.setDate(date.getDate() + d)
    date.setHours(0, 0, 0, 0)
    const weekday = date.getDay()

    for (const avail of (availSlots as AvailabilitySlotRow[])) {
      if (avail.weekday !== weekday) continue
      if (!matchesWeekParity(avail.week_parity, date)) continue

      const prof = (professionals as { id: string; name: string; specialty: string | null }[])
        .find(p => p.id === avail.professional_id)
      if (!prof) continue

      const [sh, sm] = avail.start_time.split(':').map(Number)
      const [eh, em] = avail.end_time.split(':').map(Number)

      let slotStart = new Date(date)
      slotStart.setHours(sh, sm, 0, 0)
      const windowEnd = new Date(date)
      windowEnd.setHours(eh, em, 0, 0)

      while (
        results.length < maxSlots &&
        slotStart.getTime() + slotDuration * 60000 <= windowEnd.getTime()
      ) {
        const slotEnd = new Date(slotStart.getTime() + slotDuration * 60000)

        // Skip slots in the past (add 5 min buffer)
        if (slotStart.getTime() <= now.getTime() + 5 * 60000) {
          slotStart = slotEnd
          continue
        }

        const isBusy = busy.some(
          a =>
            a.professional_id === prof.id &&
            new Date(a.starts_at) < slotEnd &&
            new Date(a.ends_at ?? a.starts_at) > slotStart,
        )

        if (!isBusy) {
          results.push({
            professionalId:   prof.id,
            professionalName: prof.name,
            specialty:        prof.specialty,
            startsAt:         slotStart.toISOString(),
            endsAt:           slotEnd.toISOString(),
            displayDate:      slotStart.toLocaleDateString('pt-BR', {
              weekday: 'short', day: '2-digit', month: '2-digit',
              timeZone: 'America/Sao_Paulo',
            }),
            displayTime: slotStart.toLocaleTimeString('pt-BR', {
              hour: '2-digit', minute: '2-digit',
              timeZone: 'America/Sao_Paulo',
            }),
          })
        }

        slotStart = slotEnd
      }
    }
  }

  return results.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
}

function matchesWeekParity(parity: string | null, date: Date): boolean {
  if (!parity || parity === 'every') return true
  const startOfYear = new Date(date.getFullYear(), 0, 1)
  const weekNum     = Math.ceil(
    ((date.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7,
  )
  if (parity === 'even')  return weekNum % 2 === 0
  if (parity === 'odd')   return weekNum % 2 !== 0
  if (parity.startsWith('every3:')) return weekNum % 3 === parseInt(parity.split(':')[1]) % 3
  if (parity.startsWith('monthly:')) return date.getDate() === parseInt(parity.split(':')[1])
  return true
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function fmtDateTimeBR(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    weekday: 'short', day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}

function fmtTimeBR(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}

// ─── Response helpers ─────────────────────────────────────────────────────────

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function jsonError(message: string, status: number) {
  return json({ error: message }, status)
}

// ─── Extra types ──────────────────────────────────────────────────────────────

interface AvailabilitySlotRow {
  professional_id: string
  weekday:         number
  start_time:      string
  end_time:        string
  week_parity:     string | null
  active:          boolean
}

interface AppointmentRow {
  id:             string
  starts_at:      string
  ends_at:        string | null
  status:         string
  patients:       { name: string } | null
  professionals:  { name: string } | null
  clinic_rooms:   { id?: string; name: string } | null
  service_types:  { name: string } | null
}


