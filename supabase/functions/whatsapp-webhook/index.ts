/**
 * Edge Function: whatsapp-webhook
 *
 * Handles all inbound traffic from Meta's WhatsApp Cloud API:
 *   GET  — webhook verification challenge (Meta setup step)
 *   POST — incoming messages, status updates
 *
 * Routing logic:
 *   1. Identify clinic from the phone_number_id in the payload
 *   2. Find or create a whatsapp_session for this patient phone
 *   3. If status == 'human' → do nothing (attendant handles it)
 *   4. Otherwise → call whatsapp-ai-agent → execute the returned action
 *      - reply     → call whatsapp-send
 *      - confirm   → update appointment status + send confirmation
 *      - cancel    → update appointment status + send cancellation
 *      - escalate  → set session.status = 'human', notify attendant
 *
 * Security: verifies X-Hub-Signature-256 from Meta.
 */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { crypto }       from 'https://deno.land/std@0.168.0/crypto/mod.ts'
import { encode }       from 'https://deno.land/std@0.168.0/encoding/hex.ts'

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SRK  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
// Meta App Secret — set in Supabase project secrets
const META_APP_SECRET = Deno.env.get('META_APP_SECRET') ?? ''
const SELF_URL        = Deno.env.get('SUPABASE_URL')!

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  // ── GET: Meta webhook verification ───────────────────────────────────────
  if (req.method === 'GET') {
    const url    = new URL(req.url)
    const mode   = url.searchParams.get('hub.mode')
    const token  = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')

    if (mode === 'subscribe' && challenge) {
      // Verify against the clinic's stored verify_token
      const supabase = createClient(SUPABASE_URL, SUPABASE_SRK)
      const { data: clinic } = await supabase
        .from('clinics')
        .select('id')
        .eq('whatsapp_verify_token', token)
        .eq('whatsapp_enabled', true)
        .maybeSingle()

      if (clinic) {
        return new Response(challenge, { status: 200 })
      }
    }
    return new Response('Forbidden', { status: 403 })
  }

  // ── POST: Inbound message or status update ────────────────────────────────
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const rawBody = await req.text()

  // ── Verify signature ──────────────────────────────────────────────────────
  if (META_APP_SECRET) {
    const sig = req.headers.get('x-hub-signature-256')?.replace('sha256=', '') ?? ''
    const valid = await verifySignature(rawBody, META_APP_SECRET, sig)
    if (!valid) return new Response('Forbidden', { status: 403 })
  }

  let payload: MetaWebhookPayload
  try { payload = JSON.parse(rawBody) }
  catch { return new Response('Bad Request', { status: 400 }) }

  // Meta always wraps in an array — process each entry
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue

      const value = change.value
      const phoneNumberId = value.metadata?.phone_number_id

      if (!phoneNumberId) continue

      // ── Find clinic by phone_number_id ────────────────────────────────────
      const supabase = createClient(SUPABASE_URL, SUPABASE_SRK)
      const { data: clinic } = await supabase
        .from('clinics')
        .select('id, whatsapp_enabled, wa_attendant_inbox')
        .eq('whatsapp_phone_number_id', phoneNumberId)
        .eq('whatsapp_enabled', true)
        .maybeSingle()

      if (!clinic) continue

      // ── Handle status updates (delivered/read) ────────────────────────────
      for (const status of value.statuses ?? []) {
        await supabase
          .from('whatsapp_messages')
          .update({ delivery_status: status.status })
          .eq('wa_message_id', status.id)
          .eq('clinic_id', clinic.id)
      }

      // ── Handle incoming messages ──────────────────────────────────────────
      for (const msg of value.messages ?? []) {
        await processInbound(supabase, clinic, msg, value.contacts ?? [])
      }
    }
  }

  // Meta requires a 200 response quickly
  return new Response('OK', { status: 200 })
})

// ─── Inbound message processing ───────────────────────────────────────────────

async function processInbound(
  supabase:  ReturnType<typeof createClient>,
  clinic:    { id: string; wa_attendant_inbox: boolean },
  msg:       MetaMessage,
  contacts:  MetaContact[],
) {
  const fromPhone  = msg.from
  const msgText    = msg.text?.body ?? msg.button?.text ?? null
  const msgType    = msg.type as string

  if (!msgText && msgType !== 'audio') return  // ignore unsupported types for now

  // ── Find patient by phone ────────────────────────────────────────────────
  const { data: patient } = await supabase
    .from('patients')
    .select('id, name')
    .eq('clinic_id', clinic.id)
    .ilike('phone', `%${fromPhone.slice(-9)}%`)   // fuzzy match last 9 digits
    .maybeSingle()

  // ── Get or create session (upsert) ───────────────────────────────────────
  // We use status='ai' as the "active" session key. Resolved sessions are left alone.
  let session: { id: string; status: string; context_snapshot: { role: string; content: string }[] } | null = null

  const { data: existingSession } = await supabase
    .from('whatsapp_sessions')
    .select('id, status, context_snapshot')
    .eq('clinic_id', clinic.id)
    .eq('wa_phone', fromPhone)
    .not('status', 'eq', 'resolved')
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingSession) {
    session = existingSession
  } else {
    const { data: newSession } = await supabase
      .from('whatsapp_sessions')
      .insert({
        clinic_id:  clinic.id,
        patient_id: patient?.id ?? null,
        wa_phone:   fromPhone,
        status:     'ai',
      })
      .select('id, status, context_snapshot')
      .single()
    session = newSession
  }

  if (!session) return

  // ── Log inbound message ───────────────────────────────────────────────────
  await supabase.from('whatsapp_messages').insert({
    session_id:     session.id,
    clinic_id:      clinic.id,
    direction:      'inbound',
    wa_message_id:  msg.id,
    body:           msgText,
    message_type:   msgType,
    sent_by:        'patient',
  })

  await supabase
    .from('whatsapp_sessions')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', session.id)

  // ── If session is already with a human attendant, stop here ──────────────
  if (session.status === 'human') return

  // ── Call AI agent ─────────────────────────────────────────────────────────
  const agentRes = await fetch(`${SELF_URL}/functions/v1/whatsapp-ai-agent`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      Authorization:   `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    },
    body: JSON.stringify({
      clinicId:  clinic.id,
      sessionId: session.id,
      patientId: patient?.id ?? null,
      message:   msgText,
      history:   session.context_snapshot ?? [],
    }),
  })

  if (!agentRes.ok) {
    console.error('[webhook] AI agent failed:', await agentRes.text())
    return
  }

  const action = await agentRes.json() as {
    action: string
    replyText?: string
    appointmentId?: string
  }

  // ── Execute action ────────────────────────────────────────────────────────
  switch (action.action) {
    case 'confirm_appointment':
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

    case 'cancel_appointment':
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

    case 'escalate':
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

    case 'reply':
    default:
      if (action.replyText) await sendReply(clinic.id, session.id, fromPhone, action.replyText)
      break
  }

  // ── Update context snapshot (rolling window of last 10 turns) ────────────
  const updatedContext = [
    ...(session.context_snapshot ?? []),
    { role: 'user',      content: msgText ?? '' },
    { role: 'assistant', content: action.replyText ?? '' },
  ].slice(-10)

  await supabase
    .from('whatsapp_sessions')
    .update({ context_snapshot: updatedContext })
    .eq('id', session.id)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
      'Content-Type':  'application/json',
      Authorization:   `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    },
    body: JSON.stringify({
      clinicId,
      sessionId,
      sentBy,
      to,
      type: 'text',
      text: { body: text },
    }),
  })
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

// ─── Meta webhook payload types ───────────────────────────────────────────────

interface MetaWebhookPayload {
  entry?: {
    changes?: {
      field: string
      value: {
        metadata?: { phone_number_id: string }
        messages?: MetaMessage[]
        statuses?: { id: string; status: string }[]
        contacts?: MetaContact[]
      }
    }[]
  }[]
}

interface MetaMessage {
  id:     string
  from:   string
  type:   string
  text?:  { body: string }
  button?: { text: string; payload: string }
  interactive?: { button_reply?: { id: string; title: string } }
}

interface MetaContact {
  profile: { name: string }
  wa_id:   string
}
