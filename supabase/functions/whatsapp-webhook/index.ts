/**
 * Edge Function: whatsapp-webhook
 *
 * Handles all inbound traffic from Meta's WhatsApp Cloud API:
 *   GET  — webhook verification challenge (Meta setup step)
 *   POST — incoming messages, status updates
 *
 * Routing logic:
 *   1. Identify phone_number_id in the payload
 *   2a. If it matches PLATFORM_PHONE_NUMBER_ID → route to whatsapp-platform-agent
 *       (Consultin's own onboarding bot — create/join/manage clinics)
 *   2b. Otherwise → find clinic by phone_number_id, continue per-clinic flow:
 *       3. Identify actor: patient, professional, or unknown (via phone lookup)
 *       4. Find or create a whatsapp_session for this phone (with actor_type)
 *       5. If msgType === 'audio': transcribe via Groq Whisper, use as text
 *       6. If status == 'human' → do nothing (attendant handles it)
 *       7. Otherwise → call whatsapp-ai-agent → execute the returned action:
 *          - reply                    → call whatsapp-send
 *          - confirm_appointment      → update appointment + send confirmation
 *          - cancel_appointment       → update appointment + send cancellation
 *          - book_appointment         → insert new appointment + send confirmation
 *          - register_patient         → insert new patient + update session
 *          - staff_mark_completed     → mark appointment as completed
 *          - staff_mark_noshow        → mark appointment as no_show
 *          - staff_cancel_appointment → cancel staff-specified appointment
 *          - staff_confirm_appointment→ confirm a patient's appointment
 *          - staff_reschedule_appointment → update appointment to new time slot
 *          - staff_create_patient     → register new patient from staff
 *          - escalate                 → set session.status = 'human', notify staff
 *
 * Security: verifies X-Hub-Signature-256 from Meta.
 */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { crypto }       from 'https://deno.land/std@0.168.0/crypto/mod.ts'
import { encode }       from 'https://deno.land/std@0.168.0/encoding/hex.ts'
import {
  extractWebhookMessageBatches,
  parsePlatformMessageInput,
  type MetaContact,
  type MetaMessage,
  type MetaWebhookPayload,
} from './logic.ts'

const SUPABASE_URL       = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SRK       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const META_APP_SECRET        = Deno.env.get('META_APP_SECRET') ?? ''
const GROQ_API_KEY           = Deno.env.get('GROQ_API_KEY') ?? ''
const SELF_URL               = Deno.env.get('SUPABASE_URL')!
const PLATFORM_PHONE_NUMBER  = Deno.env.get('PLATFORM_PHONE_NUMBER') ?? ''  // e.g. 5511999999999
const PLATFORM_WA_TOKEN      = Deno.env.get('PLATFORM_WA_TOKEN') ?? ''
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''
const TELEGRAM_CHAT_ID   = Deno.env.get('TELEGRAM_PEDRO_CHAT_ID') ?? ''

const GRAPH_BASE = 'https://graph.facebook.com/v21.0'

function scheduleBackgroundWebhookJob(job: Promise<void>): boolean {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime
  if (!runtime?.waitUntil) return false

  runtime.waitUntil(job.catch((error) => {
    console.error('[webhook] background processing error:', error)
  }))
  return true
}

async function processWebhookPayload(payload: MetaWebhookPayload): Promise<void> {
  const platformPhoneId = Deno.env.get('PLATFORM_PHONE_NUMBER_ID')
  for (const batch of extractWebhookMessageBatches(payload, platformPhoneId)) {
    if (batch.route === 'platform') {
      await Promise.all(batch.messages.map(async (msg) => {
        const parsed = parsePlatformMessageInput(msg)
        let msgText = parsed.messageText
        if (parsed.msgType === 'audio' && parsed.audioId) {
          const transcribed = await transcribeAudio(parsed.audioId, { accessToken: PLATFORM_WA_TOKEN })
          if (transcribed) {
            msgText = `[Áudio transcrito]: ${transcribed}`
          }
        }
        if (!msgText || !parsed.fromPhone) return
        await callPlatformAgent(parsed.fromPhone, msgText, parsed.waMessageId, parsed.buttonReplyId ?? undefined)
      }))
      continue
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SRK)
    const { data: clinic } = await supabase
      .from('clinics')
      .select('id, whatsapp_enabled, wa_attendant_inbox, whatsapp_phone_number_id')
      .eq('whatsapp_phone_number_id', batch.phoneNumberId)
      .eq('whatsapp_enabled', true)
      .maybeSingle()

    if (!clinic) continue

    await Promise.all([
      ...batch.statuses.map((status) => supabase
        .from('whatsapp_messages')
        .update({ delivery_status: status.status })
        .eq('wa_message_id', status.id)
        .eq('clinic_id', clinic.id)),
      ...batch.messages.map((msg) => processInbound(supabase, clinic, msg, batch.contacts, batch.phoneNumberId)),
    ])
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  // ── GET: Meta webhook verification ───────────────────────────────────────
  if (req.method === 'GET') {
    const url       = new URL(req.url)
    const mode      = url.searchParams.get('hub.mode')
    const token     = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')

    if (mode === 'subscribe' && challenge) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SRK)
      const { data: clinic } = await supabase
        .from('clinics')
        .select('id')
        .eq('whatsapp_verify_token', token)
        .eq('whatsapp_enabled', true)
        .maybeSingle()

      if (clinic) return new Response(challenge, { status: 200 })
    }
    return new Response('Forbidden', { status: 403 })
  }

  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const rawBody = await req.text()

  // ── Verify signature ──────────────────────────────────────────────────────
  if (META_APP_SECRET) {
    const sig   = req.headers.get('x-hub-signature-256')?.replace('sha256=', '') ?? ''
    const valid = await verifySignature(rawBody, META_APP_SECRET, sig)
    if (!valid) return new Response('Forbidden', { status: 403 })
  }

  let payload: MetaWebhookPayload
  try { payload = JSON.parse(rawBody) }
  catch { return new Response('Bad Request', { status: 400 }) }

  const job = processWebhookPayload(payload)
  if (scheduleBackgroundWebhookJob(job)) {
    return new Response('OK', { status: 200 })
  }

  await job

  // Meta requires a 200 response quickly
  return new Response('OK', { status: 200 })
})

// ─── Inbound message processing ───────────────────────────────────────────────

async function processInbound(
  supabase:     ReturnType<typeof createClient>,
  clinic:       { id: string; wa_attendant_inbox: boolean; whatsapp_phone_number_id?: string | null },
  msg:          MetaMessage,
  _contacts:    MetaContact[],
  phoneNumberId?: string,
) {
  const fromPhone = msg.from
  const msgType   = msg.type as string

  // Extract raw text (button clicks, interactive replies, or plain text)
  let msgText: string | null =
    msg.text?.body ??
    msg.button?.text ??
    msg.interactive?.button_reply?.title ??
    null
  const buttonReplyId = msg.interactive?.button_reply?.id ?? null

  // ── Audio: transcribe via Groq Whisper ────────────────────────────────────
  if (msgType === 'audio' && msg.audio?.id) {
    const transcribed = await transcribeAudio(msg.audio.id, { supabase, clinicId: clinic.id })
    if (transcribed) {
      msgText = `[Áudio transcrito]: ${transcribed}`
    } else {
      await quickReply(clinic.id, fromPhone,
        'Não consegui ouvir seu áudio. Pode enviar sua mensagem por texto? 😊')
      return
    }
  }

  if (!msgText) return  // ignore stickers, images, documents, etc.

  // ── Identify actor: patient, professional, or staff user (in parallel) ────
  const last9 = fromPhone.slice(-9)
  const [{ data: patient }, { data: professional }, { data: staffUser }] = await Promise.all([
    supabase
      .from('patients')
      .select('id, name')
      .eq('clinic_id', clinic.id)
      .ilike('phone', `%${last9}%`)
      .maybeSingle(),
    supabase
      .from('professionals')
      .select('id, name')
      .eq('clinic_id', clinic.id)
      .ilike('phone', `%${last9}%`)
      .eq('active', true)
      .maybeSingle(),
    supabase
      .from('user_profiles')
      .select('id, name, roles')
      .eq('clinic_id', clinic.id)
      .ilike('phone', `%${last9}%`)
      .maybeSingle(),
  ])

  // ── Determine actor type ──────────────────────────────────────────────────
  // Priority: professional > receptionist/admin (user_profiles) > patient > unknown
  let actorType: 'patient' | 'professional' | 'receptionist' | 'admin' | 'unknown' = 'unknown'
  let staffUserId: string | null = null
  if (professional) {
    actorType = 'professional'
  } else if (staffUser) {
    actorType = ((staffUser as { roles?: string[] }).roles ?? []).includes('admin') ? 'admin' : 'receptionist'
    staffUserId = (staffUser as { id: string }).id
  } else if (patient) {
    actorType = 'patient'
  }

  // ── Get or create session ─────────────────────────────────────────────────
  const { data: existingSession } = await supabase
    .from('whatsapp_sessions')
    .select('id, status, context_snapshot, actor_type, professional_id, last_message_at')
    .eq('clinic_id', clinic.id)
    .eq('wa_phone', fromPhone)
    .not('status', 'eq', 'resolved')
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let session: SessionRow | null = existingSession ?? null
  const isNewSession = !session

  if (!session) {
    const { data: newSession } = await supabase
      .from('whatsapp_sessions')
      .insert({
        clinic_id:       clinic.id,
        patient_id:      patient?.id ?? null,
        wa_phone:        fromPhone,
        status:          'ai',
        actor_type:      actorType,
        professional_id: professional?.id ?? null,
      })
      .select('id, status, context_snapshot, actor_type, professional_id')
      .single()
    session = newSession
  } else if (session.actor_type === 'unknown' && actorType !== 'unknown') {
    // Upgrade identification if we now recognise them
    await supabase
      .from('whatsapp_sessions')
      .update({
        actor_type:      actorType,
        professional_id: professional?.id ?? null,
        patient_id:      patient?.id ?? null,
      })
      .eq('id', session.id)
  }

  if (!session) return

  // ── Log inbound message ───────────────────────────────────────────────────
  await supabase.from('whatsapp_messages').insert({
    session_id:    session.id,
    clinic_id:     clinic.id,
    direction:     'inbound',
    wa_message_id: msg.id,
    body:          msgText,
    message_type:  msgType,
    sent_by:       'patient',
  })

  await supabase
    .from('whatsapp_sessions')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', session.id)

  // ── If session is with a human attendant, stop here ───────────────────────
  if (session.status === 'human') {
    // Auto-return to AI if last message was > 4 hours ago and clinic has no reply
    const lastAt = new Date(session.last_message_at ?? 0)
    const hoursSinceLast = (Date.now() - lastAt.getTime()) / 3600000
    if (hoursSinceLast < 4) return
    // Only auto-return if the LAST message was from the patient (not staff reply)
    const { data: lastMsg } = await supabase
      .from('whatsapp_messages')
      .select('direction, sent_by')
      .eq('session_id', session.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const lastWasPatient = lastMsg?.direction === 'inbound'
    if (!lastWasPatient) return
    // Resume AI
    await supabase.from('whatsapp_sessions').update({ status: 'ai' }).eq('id', session.id)
    session = { ...session, status: 'ai' }
  }

  // ── Resolve effective identifiers ─────────────────────────────────────────
  const effectiveActorType = session.actor_type !== 'unknown' ? session.actor_type : actorType
  const effectiveProfId    = session.professional_id ?? professional?.id ?? null
  const effectivePatientId = patient?.id ?? null
  const isStaffActor       = effectiveActorType === 'professional' || effectiveActorType === 'receptionist' || effectiveActorType === 'admin'

  // ── Staff redirect — this number is for patients only ─────────────────────
  // Staff should use the Consultin platform number (Helen) for all management.
  if (isStaffActor) {
    const staffName = (professional as { name?: string } | null)?.name
      ?? (staffUser as { name?: string } | null)?.name
      ?? null
    const platformContactLine = PLATFORM_PHONE_NUMBER
      ? `Para gerenciar agenda, consultas e equipe, use o WhatsApp da plataforma Consultin:\nhttps://wa.me/${PLATFORM_PHONE_NUMBER}`
      : `Para gerenciar agenda, consultas e equipe, use o WhatsApp da plataforma Consultin.`
    await sendReply(clinic.id, session.id, fromPhone, [
      `Olá${staffName ? `, *${staffName}*` : ''}! 👋`,
      '',
      `Este número é exclusivo para *pacientes* da ${clinic.name}.`,
      platformContactLine,
    ].join('\n'))
    return
  }

  // ── Help / welcome message ─────────────────────────────────────────────────
  const isHelpRequest = /^(ajuda|help|\?|oi|olá|ola|oii|menu|comandos|inicio|início)$/i.test(msgText.trim())

  if (isNewSession || isHelpRequest) {
    const patientName = (patient as { name?: string } | null)?.name
    await sendReply(clinic.id, session.id, fromPhone, [
      `Olá${patientName ? `, *${patientName}*` : ''}! 👋 Sou o assistente virtual da *${clinic.name}*.`,
      '',
      '*Posso te ajudar com:*',
      '📅 Suas consultas agendadas',
      '✅ Confirmar ou cancelar consulta',
      '🗓️ Marcar nova consulta',
      '❓ Dúvidas e informações',
      '',
      'Como posso te ajudar hoje?',
    ].join('\n'))
    return
  }

  // ── Typing indicator (fire-and-forget) ─────────────────────────────────
  const pnId = phoneNumberId ?? clinic.whatsapp_phone_number_id
  if (pnId && msg.id) {
    sendTypingIndicator(supabase, clinic.id, pnId, msg.id)
  }

  // ── Call AI agent ─────────────────────────────────────────────────────────
  const agentRes = await fetch(`${SELF_URL}/functions/v1/whatsapp-ai-agent`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    },
    body: JSON.stringify({
      clinicId:       clinic.id,
      sessionId:      session.id,
      patientId:      effectivePatientId,
      professionalId: effectiveProfId,
      actorType:      effectiveActorType,
      message:        msgText,
      history:        session.context_snapshot ?? [],
      staffUserId:    staffUserId,
      buttonReplyId,
    }),
  })

  if (!agentRes.ok) {
    const errBody = await agentRes.text()
    console.error('[webhook] AI agent failed:', errBody)
    await sendReply(
      clinic.id, session.id, fromPhone,
      '😅 Tive um problema aqui. Por favor, tente novamente em instantes.',
    )
    await notifyTelegramError(
      `🚨 *whatsapp-ai-agent falhou* (HTTP ${agentRes.status})`,
      [
        `*Clínica:* ${clinic.name} (\`${clinic.id}\`)`,
        `*Actor:* ${effectiveActorType} | *Phone:* ${fromPhone}`,
        `*Mensagem:* ${msgText.slice(0, 150)}`,
        `*Erro:* \`${errBody.slice(0, 300)}\``,
      ],
    )
    return
  }

  const action = await agentRes.json() as AgentAction

  // ── Execute action ─────────────────────────────────────────────────────────
  switch (action.action) {

    case 'confirm_appointment': {
      if (action.appointmentId) {
        await supabase
          .from('appointments')
          .update({ status: 'confirmed' })
          .eq('id', action.appointmentId)
          .eq('clinic_id', clinic.id)
        await supabase.from('clinic_notifications').insert({
          clinic_id: clinic.id,
          type: 'appointment_confirmed',
          data: { patientName: patient?.name ?? null, appointmentId: action.appointmentId },
        })
      }
      if (action.replyText) await sendReply(clinic.id, session.id, fromPhone, action.replyText)
      break
    }

    case 'cancel_appointment': {
      if (action.appointmentId) {
        await supabase
          .from('appointments')
          .update({ status: 'cancelled' })
          .eq('id', action.appointmentId)
          .eq('clinic_id', clinic.id)
        await supabase.from('clinic_notifications').insert({
          clinic_id: clinic.id,
          type: 'appointment_cancelled',
          data: { patientName: patient?.name ?? null, appointmentId: action.appointmentId },
        })
      }
      if (action.replyText) await sendReply(clinic.id, session.id, fromPhone, action.replyText)
      break
    }

    case 'book_appointment': {
      const booked = await executeBookAppointment(supabase, clinic.id, {
        patientId:      effectivePatientId,
        professionalId: action.professionalId,
        startsAt:       action.startsAt,
        endsAt:         action.endsAt,
        serviceTypeId:  action.serviceTypeId,
      })
      if (booked.ok) {
        if (action.replyText) await sendReply(clinic.id, session.id, fromPhone, action.replyText)
        await supabase.from('clinic_notifications').insert({
          clinic_id: clinic.id,
          type: 'appointment_booked_via_whatsapp',
          data: { patientName: patient?.name ?? null, startsAt: action.startsAt },
        })
      } else {
        await sendReply(clinic.id, session.id, fromPhone,
          booked.message ?? 'Não consegui agendar. Um atendente irá te ajudar em breve!')
      }
      break
    }

    case 'register_patient': {
      if (action.patientName) {
        const { data: newPatient } = await supabase
          .from('patients')
          .insert({ clinic_id: clinic.id, name: action.patientName, phone: fromPhone })
          .select('id')
          .single()
        if (newPatient) {
          await supabase
            .from('whatsapp_sessions')
            .update({ patient_id: newPatient.id, actor_type: 'patient' })
            .eq('id', session.id)
        }
      }
      if (action.replyText) await sendReply(clinic.id, session.id, fromPhone, action.replyText)
      break
    }

    case 'staff_confirm_appointment': {
      if (action.appointmentId) {
        await supabase
          .from('appointments')
          .update({ status: 'confirmed' })
          .eq('id', action.appointmentId)
          .eq('clinic_id', clinic.id)
      }
      if (action.replyText) await sendReply(clinic.id, session.id, fromPhone, action.replyText)
      break
    }

    case 'staff_reschedule_appointment': {
      if (action.appointmentId && action.startsAt && action.endsAt) {
        // Check for conflicts, excluding the appointment being rescheduled
        const { data: conflict } = await supabase
          .from('appointments')
          .select('id')
          .eq('professional_id', action.professionalId ?? '')
          .neq('id', action.appointmentId)
          .not('status', 'in', '("cancelled","no_show")')
          .lt('starts_at', action.endsAt)
          .gt('ends_at', action.startsAt)
          .maybeSingle()

        if (conflict) {
          await sendReply(clinic.id, session.id, fromPhone,
            'Esse horário já está ocupado. Escolha outro horário disponível.')
          break
        }

        const updates: Record<string, unknown> = {
          starts_at: action.startsAt,
          ends_at:   action.endsAt,
          status:    'scheduled',
        }
        if (action.professionalId) updates.professional_id = action.professionalId

        await supabase
          .from('appointments')
          .update(updates)
          .eq('id', action.appointmentId)
          .eq('clinic_id', clinic.id)

        await supabase.from('clinic_notifications').insert({
          clinic_id: clinic.id,
          type: 'appointment_rescheduled_by_staff',
          data: { staffActorType: effectiveActorType, appointmentId: action.appointmentId, startsAt: action.startsAt },
        })
      }
      if (action.replyText) await sendReply(clinic.id, session.id, fromPhone, action.replyText)
      break
    }

    case 'staff_create_patient': {
      if (!action.patientName?.trim()) {
        await sendReply(clinic.id, session.id, fromPhone, 'Qual o nome completo do paciente?')
        break
      }
      const newPatientData: Record<string, unknown> = {
        clinic_id: clinic.id,
        name:      action.patientName.trim(),
      }
      if (action.patientPhone?.trim()) newPatientData.phone = action.patientPhone.trim()
      const { data: newPat, error: patErr } = await supabase
        .from('patients')
        .insert(newPatientData)
        .select('id')
        .single()
      if (newPat && !patErr) {
        await sendReply(clinic.id, session.id, fromPhone,
          `✅ Paciente *${action.patientName.trim()}* cadastrado!\n[patientId:${(newPat as { id: string }).id}]\n\nPara qual horário deseja agendar?`)
      } else {
        console.error('[webhook] staff_create_patient error:', patErr)
        await sendReply(clinic.id, session.id, fromPhone,
          'Erro ao cadastrar paciente. Tente novamente ou chame um atendente.')
      }
      break
    }

    case 'staff_mark_completed': {
      if (action.appointmentId) {
        await supabase
          .from('appointments')
          .update({ status: 'completed' })
          .eq('id', action.appointmentId)
          .eq('clinic_id', clinic.id)
        // Send satisfaction survey to patient if we know their phone
        await sendSatisfactionSurvey(supabase, clinic.id, action.appointmentId, session.id)
      }
      if (action.replyText) await sendReply(clinic.id, session.id, fromPhone, action.replyText)
      break
    }

    case 'staff_mark_noshow': {
      if (action.appointmentId) {
        await supabase
          .from('appointments')
          .update({ status: 'no_show' })
          .eq('id', action.appointmentId)
          .eq('clinic_id', clinic.id)
      }
      if (action.replyText) await sendReply(clinic.id, session.id, fromPhone, action.replyText)
      break
    }

    case 'staff_cancel_appointment': {
      if (action.appointmentId) {
        await supabase
          .from('appointments')
          .update({ status: 'cancelled' })
          .eq('id', action.appointmentId)
          .eq('clinic_id', clinic.id)
        await supabase.from('clinic_notifications').insert({
          clinic_id: clinic.id,
          type: 'appointment_cancelled',
          data: { cancelledByStaff: true, appointmentId: action.appointmentId },
        })
      }
      if (action.replyText) await sendReply(clinic.id, session.id, fromPhone, action.replyText)
      break
    }

    case 'staff_book_for_patient': {
      // Staff booking a new appointment on behalf of a patient
      const booked = await executeBookAppointment(supabase, clinic.id, {
        patientId:      action.targetPatientId ?? null,
        professionalId: action.professionalId,
        startsAt:       action.startsAt,
        endsAt:         action.endsAt,
        serviceTypeId:  action.serviceTypeId,
      })
      if (booked.ok) {
        if (action.replyText) await sendReply(clinic.id, session.id, fromPhone, action.replyText)
        await supabase.from('clinic_notifications').insert({
          clinic_id: clinic.id,
          type: 'appointment_booked_by_staff_whatsapp',
          data: { staffActorType: effectiveActorType, startsAt: action.startsAt },
        })
      } else {
        await sendReply(clinic.id, session.id, fromPhone,
          booked.message ?? 'Não consegui agendar. Verifique os dados e tente novamente.')
      }
      break
    }

    case 'staff_find_patient': {
      // Search patients by name and reply with the list so staff can pick one
      const searchName = (action.patientName ?? '').trim()
      if (!searchName) {
        await sendReply(clinic.id, session.id, fromPhone, 'Qual é o nome do paciente?')
        break
      }
      const { data: foundPatients } = await supabase
        .from('patients')
        .select('id, name, phone')
        .eq('clinic_id', clinic.id)
        .ilike('name', `%${searchName}%`)
        .limit(5)
      if (!foundPatients || foundPatients.length === 0) {
        const { count: totalPatients } = await supabase
          .from('patients')
          .select('id', { count: 'exact', head: true })
          .eq('clinic_id', clinic.id)

        if ((totalPatients ?? 0) === 0) {
          await sendReply(clinic.id, session.id, fromPhone,
            'Ainda não há pacientes cadastrados nessa clínica. Se você já tiver uma planilha ou exportação de outro sistema, envie pelo painel de Pacientes para importar a base inteira. Se preferir, posso continuar com um cadastro manual aqui pelo WhatsApp.')
          break
        }

        await sendReply(clinic.id, session.id, fromPhone,
          `Nenhum paciente encontrado com o nome "${searchName}". Verifique o nome e tente novamente.`)
        break
      }
      if (foundPatients.length === 1) {
        const p = foundPatients[0] as { id: string; name: string; phone: string | null }
        await sendReply(clinic.id, session.id, fromPhone,
          `Paciente encontrado: *${p.name}*${p.phone ? ` (${p.phone})` : ''}\n[patientId:${p.id}]\n\nPara qual horário deseja agendar?`)
      } else {
        const lines = (foundPatients as { id: string; name: string; phone: string | null }[])
          .map((p, i) => `${i + 1}. *${p.name}*${p.phone ? ` (${p.phone})` : ''} [id:${p.id}]`)
        await sendReply(clinic.id, session.id, fromPhone,
          `Encontrei ${foundPatients.length} pacientes:\n${lines.join('\n')}\n\nQual paciente e horário?`)
      }
      break
    }

    case 'patient_checkin': {
      // Patient announced they've arrived — notify staff
      const appointmentId = action.appointmentId
      if (appointmentId) {
        const checkinQuery = supabase
          .from('appointments')
          .update({ status: 'checked_in' })
          .eq('id', appointmentId)
          .eq('clinic_id', clinic.id)
        if (effectivePatientId) checkinQuery.eq('patient_id', effectivePatientId)
        await checkinQuery
      }
      await supabase.from('clinic_notifications').insert({
        clinic_id: clinic.id,
        type: 'patient_checkin_whatsapp',
        data: { patientName: patient?.name ?? null, appointmentId: appointmentId ?? null, phone: fromPhone },
      })
      if (action.replyText) await sendReply(clinic.id, session.id, fromPhone, action.replyText)
      break
    }

    case 'reschedule_request': {
      // Cancel current appointment and offer new slots
      if (action.appointmentId) {
        const reschedQuery = supabase
          .from('appointments')
          .update({ status: 'cancelled' })
          .eq('id', action.appointmentId)
          .eq('clinic_id', clinic.id)
        if (effectivePatientId) reschedQuery.eq('patient_id', effectivePatientId)
        await reschedQuery
        await supabase.from('clinic_notifications').insert({
          clinic_id: clinic.id,
          type: 'appointment_rescheduled_request',
          data: { patientName: patient?.name ?? null, appointmentId: action.appointmentId },
        })
      }
      if (action.replyText) await sendReply(clinic.id, session.id, fromPhone, action.replyText)
      break
    }

    case 'escalate': {
      await supabase
        .from('whatsapp_sessions')
        .update({ status: 'human' })
        .eq('id', session.id)
      await supabase.from('clinic_notifications').insert({
        clinic_id: clinic.id,
        type: 'wa_escalated',
        data: { patientName: patient?.name ?? null, sessionId: session.id },
      })
      if (action.replyText) await sendReply(clinic.id, session.id, fromPhone, action.replyText, 'ai')
      break
    }

    case 'reply':
    default: {
      if (action.replyText) await sendReply(clinic.id, session.id, fromPhone, action.replyText)
      break
    }
  }

  // ── Update rolling context snapshot (last 10 turns) ──────────────────────
  const updatedContext = [
    ...(session.context_snapshot ?? []),
    { role: 'user',      content: msgText },
    { role: 'assistant', content: action.replyText ?? '' },
  ].slice(-10)

  await supabase
    .from('whatsapp_sessions')
    .update({ context_snapshot: updatedContext })
    .eq('id', session.id)
}

// ─── Satisfaction survey helper ───────────────────────────────────────────────

/**
 * After a staff member marks a consultation as completed, send a satisfaction
 * survey to the patient on WhatsApp (if we have their phone number).
 * Survey is only sent if the appointment has a patient with a phone on record.
 */
async function sendSatisfactionSurvey(
  supabase:      ReturnType<typeof createClient>,
  clinicId:      string,
  appointmentId: string,
  staffSessionId: string,
) {
  try {
    const { data: appt } = await supabase
      .from('appointments')
      .select('id, starts_at, professionals(name), patients(id, name, phone)')
      .eq('id', appointmentId)
      .eq('clinic_id', clinicId)
      .maybeSingle()

    if (!appt) return
    const patient     = appt.patients as { id: string; name: string; phone: string | null } | null
    const professional = appt.professionals as { name: string } | null
    if (!patient?.phone) return

    // Create or find an open session for the patient
    const { data: existingSession } = await supabase
      .from('whatsapp_sessions')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('wa_phone', patient.phone)
      .not('status', 'eq', 'resolved')
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    let surveySessionId = existingSession?.id
    if (!surveySessionId) {
      const { data: newSession } = await supabase
        .from('whatsapp_sessions')
        .insert({
          clinic_id:  clinicId,
          patient_id: patient.id,
          wa_phone:   patient.phone,
          status:     'ai',
          actor_type: 'patient',
        })
        .select('id')
        .single()
      surveySessionId = newSession?.id
    }
    if (!surveySessionId) return

    const profName = professional?.name ?? 'seu profissional'
    const surveyText = [
      `Olá, *${patient.name}*! 😊`,
      ``,
      `Sua consulta com *${profName}* foi concluída. Como foi o atendimento?`,
      ``,
      `Por favor, responda de *1 a 5* (1 = péssimo, 5 = excelente) ⭐`,
    ].join('\n')

    await sendReply(clinicId, surveySessionId, patient.phone, surveyText)

    // Log that a survey was sent
    await supabase.from('clinic_notifications').insert({
      clinic_id: clinicId,
      type: 'satisfaction_survey_sent',
      data: { appointmentId, patientId: patient.id, patientName: patient.name },
    })
  } catch (err) {
    console.error('[webhook] sendSatisfactionSurvey error:', err)
  }
}

// ─── Book appointment helper ───────────────────────────────────────────────────

async function executeBookAppointment(
  supabase:  ReturnType<typeof createClient>,
  clinicId:  string,
  params: {
    patientId:      string | null
    professionalId: string | undefined
    startsAt:       string | undefined
    endsAt:         string | undefined
    serviceTypeId:  string | undefined
  },
): Promise<{ ok: boolean; message?: string }> {
  const { patientId, professionalId, startsAt, endsAt, serviceTypeId } = params

  if (!patientId) {
    return { ok: false, message: 'Para agendar preciso do seu cadastro. Me diga seu nome completo! 😊' }
  }
  if (!professionalId || !startsAt || !endsAt) {
    return { ok: false, message: 'Não consegui identificar o horário. Por favor, confirme qual horário deseja.' }
  }

  const { data: prof } = await supabase
    .from('professionals')
    .select('id')
    .eq('id', professionalId)
    .eq('clinic_id', clinicId)
    .eq('active', true)
    .maybeSingle()

  if (!prof) return { ok: false, message: 'Não encontrei esse profissional. Um atendente irá te ajudar!' }

  if (new Date(startsAt) <= new Date()) {
    return { ok: false, message: 'Esse horário já passou. Vou buscar outros horários disponíveis!' }
  }

  const { data: conflict } = await supabase
    .from('appointments')
    .select('id')
    .eq('professional_id', professionalId)
    .not('status', 'in', '("cancelled","no_show")')
    .lt('starts_at', endsAt)
    .gt('ends_at', startsAt)
    .maybeSingle()

  if (conflict) {
    return { ok: false, message: 'Esse horário acabou de ser ocupado. Por favor, escolha outro horário.' }
  }

  const { error } = await supabase
    .from('appointments')
    .insert({
      clinic_id:       clinicId,
      patient_id:      patientId,
      professional_id: professionalId,
      starts_at:       startsAt,
      ends_at:         endsAt,
      service_type_id: serviceTypeId ?? null,
      status:          'scheduled',
    })

  if (error) {
    console.error('[webhook] book_appointment insert error:', error)
    return { ok: false, message: 'Erro ao salvar o agendamento. Um atendente irá te ajudar!' }
  }
  return { ok: true }
}

// ─── Audio transcription via Groq Whisper ─────────────────────────────────────

async function transcribeAudio(
  mediaId: string,
  options: {
    supabase?: ReturnType<typeof createClient>
    clinicId?: string
    accessToken?: string
  },
): Promise<string | null> {
  if (!GROQ_API_KEY) return null

  const accessToken = options.accessToken
    ?? await resolveWhatsAppAccessToken(options.supabase, options.clinicId)
  if (!accessToken) return null

  try {
    // Resolve media download URL from Meta
    const mediaRes = await fetch(
      `${GRAPH_BASE}/${encodeURIComponent(mediaId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    if (!mediaRes.ok) return null
    const mediaInfo = await mediaRes.json() as { url?: string }
    if (!mediaInfo.url) return null

    // Download audio bytes
    const audioRes = await fetch(mediaInfo.url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!audioRes.ok) return null
    const audioBytes = await audioRes.arrayBuffer()

    // Send to Groq Whisper
    const form = new FormData()
    form.append('file', new Blob([audioBytes], { type: 'audio/ogg' }), 'audio.ogg')
    form.append('model', 'whisper-large-v3-turbo')
    form.append('language', 'pt')
    form.append('response_format', 'text')

    const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method:  'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
      body:    form,
    })
    if (!groqRes.ok) {
      console.error('[webhook] Groq failed:', await groqRes.text())
      return null
    }

    return (await groqRes.text()).trim() || null
  } catch (err) {
    console.error('[webhook] transcribeAudio error:', err)
    return null
  }
}

async function resolveWhatsAppAccessToken(
  supabase?: ReturnType<typeof createClient>,
  clinicId?: string,
): Promise<string | null> {
  if (clinicId && supabase) {
    const { data: clinicToken } = await supabase
      .rpc('get_clinic_whatsapp_token', { p_clinic_id: clinicId })
    return clinicToken ?? null
  }

  return PLATFORM_WA_TOKEN || null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── Typing indicator ───────────────────────────────────────────────────────

/**
 * Sends a typing indicator to the user (shows 3 animated dots).
 * Combines mark-as-read + typing_indicator in a single call per Meta Cloud API.
 * Dismissed automatically once a message is sent, or after 25 seconds.
 * Fire-and-forget — never throw.
 */
async function sendTypingIndicator(
  supabase:      ReturnType<typeof createClient>,
  clinicId:      string,
  phoneNumberId: string,
  waMessageId:   string,
): Promise<void> {
  try {
    const { data: tokenRow } = await supabase
      .rpc('get_clinic_whatsapp_token', { p_clinic_id: clinicId })
    if (!tokenRow) return
    await fetch(`${GRAPH_BASE}/${phoneNumberId}/messages`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${tokenRow}`,
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

async function notifyTelegramError(title: string, lines: string[]): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return
  try {
    const text = [title, '', ...lines].join('\n')
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'Markdown' }),
    })
  } catch { /* best-effort */ }
}

async function sendReply(
  clinicId:  string,
  sessionId: string,
  to:        string,
  text:      string,
  sentBy:    'ai' | 'system' = 'ai',
) {
  await fetch(`${SELF_URL}/functions/v1/whatsapp-send`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    },
    body: JSON.stringify({ clinicId, sessionId, sentBy, to, type: 'text', text: { body: text } }),
  })
}

async function quickReply(clinicId: string, to: string, text: string) {
  await fetch(`${SELF_URL}/functions/v1/whatsapp-send`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    },
    body: JSON.stringify({ clinicId, to, type: 'text', text: { body: text } }),
  })
}

// ─── Platform agent caller ────────────────────────────────────────────────────

/**
 * Routes an inbound message from Consultin's own WhatsApp number to the
 * platform onboarding agent (whatsapp-platform-agent).
 */
async function callPlatformAgent(
  fromPhone:    string,
  messageText:  string,
  waMessageId?: string,
  buttonReplyId?: string,
): Promise<void> {
  try {
    await fetch(`${SELF_URL}/functions/v1/whatsapp-platform-agent`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${SUPABASE_SRK}`,
      },
      body: JSON.stringify({ fromPhone, messageText, waMessageId, buttonReplyId }),
    })
  } catch (e) {
    console.error('[webhook] callPlatformAgent error:', e)
  }
}

async function verifySignature(body: string, secret: string, signature: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
    const hex = new TextDecoder().decode(encode(new Uint8Array(sig)))
    return hex === signature
  } catch {
    return false
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SessionRow {
  id:               string
  status:           string
  context_snapshot: { role: string; content: string }[] | null
  actor_type:       string
  professional_id:  string | null
  last_message_at:  string | null
}

interface AgentAction {
  action:            string
  replyText?:        string
  appointmentId?:    string
  // book_appointment / staff_book_for_patient / staff_reschedule_appointment
  professionalId?:   string
  startsAt?:         string
  endsAt?:           string
  serviceTypeId?:    string
  targetPatientId?:  string  // staff_book_for_patient: resolved patient id
  // register_patient / staff_find_patient / staff_create_patient
  patientName?:      string
  patientPhone?:     string  // staff_create_patient
}


