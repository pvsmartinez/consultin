/**
 * Edge Function: whatsapp-send
 *
 * Sends a WhatsApp message via the Meta Cloud API and logs it in whatsapp_messages.
 * Called internally by other Edge Functions — never directly from the browser.
 *
 * Auth: requires service role key in Authorization header.
 *
 * Body (JSON):
 *   { clinicId, sessionId, to, type, text?, template?, interactive? }
 *
 * Returns: { waMessageId }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SRK      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const META_API_VERSION  = 'v21.0'
const META_BASE         = `https://graph.facebook.com/${META_API_VERSION}`

// ─── Types ────────────────────────────────────────────────────────────────────

interface TextPayload       { body: string }
interface TemplateComponent { type: 'body'; parameters: { type: 'text'; text: string }[] }
interface TemplatePayload   { name: string; language: { code: string }; components: TemplateComponent[] }
interface ButtonReply       { type: 'reply'; reply: { id: string; title: string } }
interface InteractivePayload {
  type: 'button'
  body: { text: string }
  action: { buttons: ButtonReply[] }
}

interface SendRequest {
  clinicId:    string
  sessionId?:  string        // null for system-initiated messages (reminders)
  sentBy:      'ai' | 'attendant' | 'system'
  to:          string        // E.164 phone, e.g. "5511991234567"
  type:        'text' | 'template' | 'interactive'
  text?:       TextPayload
  template?:   TemplatePayload
  interactive?: InteractivePayload
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  // ── Auth: only internal callers (service role) may invoke this function ──
  // This prevents external actors who discover the function URL from sending
  // arbitrary WhatsApp messages on behalf of any clinic.
  const authHeader = req.headers.get('Authorization') ?? ''
  const callerToken = authHeader.replace(/^Bearer\s+/i, '')
  if (!callerToken || callerToken !== SUPABASE_SRK) {
    return jsonError('Forbidden', 403)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SRK)

  let body: SendRequest
  try {
    body = await req.json()
  } catch {
    return jsonError('Invalid JSON body', 400)
  }

  const { clinicId, sessionId, sentBy, to, type } = body
  if (!clinicId || !to || !type) {
    return jsonError('Missing required fields: clinicId, to, type', 400)
  }

  // ── Fetch clinic WhatsApp config ──────────────────────────────────────────
  const { data: clinic, error: clinicErr } = await supabase
    .from('clinics')
    .select('whatsapp_enabled, whatsapp_phone_number_id')
    .eq('id', clinicId)
    .single()

  if (clinicErr || !clinic) return jsonError('Clinic not found', 404)
  if (!clinic.whatsapp_enabled) return jsonError('WhatsApp not enabled for this clinic', 403)
  if (!clinic.whatsapp_phone_number_id) return jsonError('WhatsApp phone number ID not configured', 422)

  // ── Retrieve token from Vault ─────────────────────────────────────────────
  const { data: tokenRow, error: tokenErr } = await supabase
    .rpc('get_clinic_whatsapp_token', { p_clinic_id: clinicId })

  if (tokenErr || !tokenRow) return jsonError('Could not retrieve WhatsApp access token', 500)
  const accessToken: string = tokenRow

  // ── Build Meta API payload ────────────────────────────────────────────────
  const metaPayload: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type,
  }

  if (type === 'text' && body.text) {
    metaPayload.text = body.text
  } else if (type === 'template' && body.template) {
    metaPayload.template = body.template
  } else if (type === 'interactive' && body.interactive) {
    metaPayload.interactive = body.interactive
  } else {
    return jsonError('Message body missing for type: ' + type, 400)
  }

  // ── Call Meta Graph API ───────────────────────────────────────────────────
  const metaRes = await fetch(
    `${META_BASE}/${clinic.whatsapp_phone_number_id}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(metaPayload),
    },
  )

  const metaBody = await metaRes.json()

  if (!metaRes.ok) {
    console.error('[whatsapp-send] Meta API error:', JSON.stringify(metaBody))
    return jsonError(`Meta API error: ${metaBody?.error?.message ?? 'unknown'}`, 502)
  }

  const waMessageId: string = metaBody?.messages?.[0]?.id ?? null

  // ── Log message in DB ─────────────────────────────────────────────────────
  const messageText =
    type === 'text'        ? body.text?.body
    : type === 'template'  ? `[template: ${body.template?.name}]`
    : type === 'interactive' ? body.interactive?.body?.text
    : null

  if (sessionId) {
    await supabase.from('whatsapp_messages').insert({
      session_id:     sessionId,
      clinic_id:      clinicId,
      direction:      'outbound',
      wa_message_id:  waMessageId,
      body:           messageText,
      message_type:   type,
      sent_by:        sentBy,
      delivery_status: 'sent',
    })

    // Update session's last_message_at
    await supabase
      .from('whatsapp_sessions')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', sessionId)
  }

  return json({ waMessageId })
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function jsonError(message: string, status: number) {
  return json({ error: message }, status)
}
