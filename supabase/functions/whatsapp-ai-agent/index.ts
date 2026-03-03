/**
 * Edge Function: whatsapp-ai-agent
 *
 * Processes an inbound message from a patient and decides what to do:
 *   1. Classify intent (confirm, cancel, schedule, ask FAQ, escalate)
 *   2. If scheduling intent: extract date/time/professional, check availability,
 *      propose a slot, write a draft to session.ai_draft
 *   3. If FAQ: answer from clinic config (name, hours, address)
 *   4. If confirm/cancel: return structured action for webhook to execute
 *   5. If unknown / complex: escalate to human (status → 'human')
 *
 * Called by whatsapp-webhook. Uses OpenRouter with clinic's chosen model.
 *
 * Returns:
 *   { action: 'reply' | 'escalate' | 'confirm_appointment' | 'cancel_appointment',
 *     replyText?: string,
 *     appointmentId?: string,   // for confirm/cancel actions
 *     draftSlot?: { professionalId, startsAt, endsAt }  // for scheduling proposals
 *   }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL       = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SRK       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')!
const OPENROUTER_BASE    = 'https://openrouter.ai/api/v1'

// ─── Request/response types ───────────────────────────────────────────────────

interface AgentRequest {
  clinicId:   string
  sessionId:  string
  patientId?: string
  message:    string     // the patient's raw text
  history:    { role: 'user' | 'assistant'; content: string }[]
}

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SRK)

  let body: AgentRequest
  try { body = await req.json() }
  catch { return jsonError('Invalid JSON', 400) }

  const { clinicId, sessionId, message, history } = body

  // ── Fetch clinic context ──────────────────────────────────────────────────
  const { data: clinic } = await supabase
    .from('clinics')
    .select('name, phone, address, city, state, wa_ai_model, working_hours, slot_duration_minutes, wa_ai_custom_prompt, wa_ai_allow_schedule, wa_ai_allow_confirm, wa_ai_allow_cancel')
    .eq('id', clinicId)
    .single()

  if (!clinic) return jsonError('Clinic not found', 404)

  // ── Fetch FAQ knowledge base ──────────────────────────────────────────────
  const { data: faqRows } = await supabase
    .from('whatsapp_faqs')
    .select('question, answer')
    .eq('clinic_id', clinicId)
    .eq('active', true)
    .order('sort_order')
    .order('created_at')

  // ── Fetch upcoming appointments for this patient (context for confirm/cancel)
  const pendingAppts: { id: string; starts_at: string; professional_name: string }[] = []
  if (body.patientId) {
    const { data: appts } = await supabase
      .from('appointments')
      .select('id, starts_at, professionals(name)')
      .eq('patient_id', body.patientId)
      .in('status', ['scheduled', 'confirmed'])
      .gte('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true })
      .limit(3)

    if (appts) {
      for (const a of appts) {
        pendingAppts.push({
          id: a.id,
          starts_at: a.starts_at,
          professional_name: (a.professionals as { name: string })?.name ?? 'Profissional',
        })
      }
    }
  }

  // ── Build system prompt ───────────────────────────────────────────────────
  const allowConfirm  = clinic.wa_ai_allow_confirm  !== false   // default true
  const allowCancel   = clinic.wa_ai_allow_cancel   !== false   // default true
  const allowSchedule = clinic.wa_ai_allow_schedule === true    // default false

  const faqSection = faqRows && faqRows.length > 0
    ? [
        '',
        'Informações frequentes (use para responder perguntas dos pacientes):',
        ...(faqRows as { question: string; answer: string }[]).map(f => `P: ${f.question}\nR: ${f.answer}`),
      ].join('\n')
    : ''

  const allowedActions = [
    `- { "action": "reply", "replyText": "..." } — responder ao paciente`,
    allowConfirm  && `- { "action": "confirm_appointment", "appointmentId": "...", "replyText": "..." } — confirmar consulta`,
    allowCancel   && `- { "action": "cancel_appointment", "appointmentId": "...", "replyText": "..." } — cancelar consulta`,
    `- { "action": "escalate", "replyText": "..." } — transferir para atendente humano`,
  ].filter(Boolean).join('\n')

  const rules = [
    allowConfirm  ? `1. Se o paciente responder SIM/CONFIRMAR → confirme a consulta mais próxima.` : `1. Se o paciente responder SIM/CONFIRMAR → informe que um atendente irá confirmar e use action escalate.`,
    allowCancel   ? `2. Se o paciente responder NÃO/CANCELAR → cancele a consulta mais próxima.` : `2. Se o paciente quiser cancelar → informe que um atendente irá ajudar e use action escalate.`,
    allowSchedule ? `3. Se pedir para agendar uma nova consulta → informe os próximos passos do agendamento.` : `3. Se pedir para agendar uma nova consulta → responda que um atendente entrará em contato e use action escalate.`,
    `4. Se a pergunta for complexa, sensível ou médica → use action escalate.`,
    `5. Nunca invente horários ou profissionais. Apenas confirme ou cancele consultas existentes.`,
    `6. Responda APENAS com o JSON, sem texto extra.`,
  ].join('\n')

  const systemPrompt = [
    `Você é o assistente virtual de WhatsApp da clínica "${clinic.name}" no Brasil.`,
    `Responda sempre em Português do Brasil, de forma breve e amigável.`,
    clinic.wa_ai_custom_prompt ? `\n${clinic.wa_ai_custom_prompt}` : '',
    `\nInformações da clínica:`,
    `- Endereço: ${clinic.address ?? 'não informado'}, ${clinic.city ?? ''} - ${clinic.state ?? ''}`,
    `- Telefone: ${clinic.phone ?? 'não informado'}`,
    faqSection,
    ``,
    `Próximas consultas do paciente:`,
    pendingAppts.length
      ? pendingAppts.map((a) => `- ID:${a.id} | ${new Date(a.starts_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} com ${a.professional_name}`).join('\n')
      : '- Nenhuma consulta agendada',
    ``,
    `Você pode executar as seguintes ações retornando JSON estruturado:`,
    allowedActions,
    ``,
    `Regras:`,
    rules,
  ].join('\n')

  // ── Build messages for OpenRouter ─────────────────────────────────────────
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-8),  // last 8 turns for context
    { role: 'user', content: message },
  ]

  // ── Call OpenRouter ───────────────────────────────────────────────────────
  const model = clinic.wa_ai_model ?? 'google/gemini-2.0-flash-exp:free'

  // response_format JSON mode is only supported by OpenAI models on OpenRouter
  const supportsJsonMode = (model as string).startsWith('openai/')

  const orRes = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      Authorization:   `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer':  'https://consultin.app',
      'X-Title':       'Consultin WhatsApp Agent',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature:  0.2,
      max_tokens:   512,
      ...(supportsJsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  })

  if (!orRes.ok) {
    const err = await orRes.text()
    console.error('[ai-agent] OpenRouter error:', err)
    // Fallback: escalate to human if AI is unavailable
    return json({
      action: 'escalate',
      replyText: 'Desculpe, estou com dificuldades no momento. Um atendente irá te responder em breve! 😊',
    })
  }

  const orBody = await orRes.json()
  const rawContent = orBody?.choices?.[0]?.message?.content ?? ''

  // ── Parse AI response ─────────────────────────────────────────────────────
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(rawContent)
  } catch {
    console.error('[ai-agent] Failed to parse AI JSON:', rawContent)
    return json({
      action: 'escalate',
      replyText: 'Não entendi sua mensagem. Um atendente irá te ajudar! 😊',
    })
  }

  // ── Validate appointmentId if present ────────────────────────────────────
  if (
    (parsed.action === 'confirm_appointment' || parsed.action === 'cancel_appointment') &&
    parsed.appointmentId
  ) {
    const { data: appt } = await supabase
      .from('appointments')
      .select('id')
      .eq('id', parsed.appointmentId)
      .eq('patient_id', body.patientId ?? '')
      .maybeSingle()

    if (!appt) {
      // AI hallucinated an appointment ID — escalate safely
      return json({
        action: 'escalate',
        replyText: 'Não encontrei sua consulta. Um atendente irá verificar! 😊',
      })
    }
  }

  // ── Store AI draft in session (for attendant inbox) ───────────────────────
  if (parsed.action === 'escalate' && parsed.replyText) {
    await supabase
      .from('whatsapp_sessions')
      .update({ ai_draft: parsed.replyText })
      .eq('id', sessionId)
  }

  return json(parsed)
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function jsonError(message: string, status: number) {
  return json({ error: message }, status)
}
