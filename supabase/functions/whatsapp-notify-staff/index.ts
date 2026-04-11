/**
 * Edge Function: whatsapp-notify-staff
 *
 * Sends real-time WhatsApp alerts to staff members when appointment events occur.
 * Called by a Postgres trigger (via pg_net) on INSERT/UPDATE of appointments.
 *
 * Input: { clinicId, eventType, appointmentId }
 *   eventType: 'new_appointment' | 'cancellation' | 'no_show'
 *
 * Only sends to users with:
 *   - notification_phone set
 *   - the matching notif_* toggle enabled
 *   - belonging to the same clinic
 *
 * Messages are sent via the clinic's WhatsApp Business number (whatsapp-send).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { format } from 'https://esm.sh/date-fns@3'
import { toZonedTime } from 'https://esm.sh/date-fns-tz@3'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TZ           = 'America/Sao_Paulo'

type EventType = 'new_appointment' | 'cancellation' | 'no_show'

interface NotifyRequest {
  clinicId:      string
  eventType:     EventType
  appointmentId: string
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const body = await req.json().catch(() => null) as NotifyRequest | null
  if (!body?.clinicId || !body?.eventType || !body?.appointmentId) {
    return jsonError('Missing required fields: clinicId, eventType, appointmentId', 400)
  }

  const { clinicId, eventType, appointmentId } = body
  const supabase = createClient(SUPABASE_URL, SUPABASE_SRK)

  // ── Check clinic has WhatsApp enabled ────────────────────────────────────
  const { data: clinic } = await supabase
    .from('clinics')
    .select('whatsapp_enabled, name')
    .eq('id', clinicId)
    .single()

  if (!clinic?.whatsapp_enabled) {
    return json({ sent: 0, skipped: 0, message: 'WhatsApp not enabled for clinic' })
  }

  // ── Fetch appointment details ─────────────────────────────────────────────
  const { data: appt } = await supabase
    .from('appointments')
    .select(`
      id,
      starts_at,
      patient:patients ( name )
    `)
    .eq('id', appointmentId)
    .single()

  // ── Determine which notif column to check ────────────────────────────────
  const notifCol = {
    new_appointment: 'notif_new_appointment',
    cancellation:    'notif_cancellation',
    no_show:         'notif_no_show',
  }[eventType] as string

  // ── Find staff members who want this notification ─────────────────────────
  const { data: recipients, error: recipientsErr } = await supabase
    .from('user_profiles')
    .select('id, full_name, notification_phone')
    .eq('clinic_id', clinicId)
    .eq(notifCol, true)
    .not('notification_phone', 'is', null)
    .filter('roles', 'ov', '{admin,receptionist,professional}')

  if (recipientsErr) {
    console.error('[notify-staff] recipients query failed:', recipientsErr)
    return jsonError('DB error fetching recipients', 500)
  }

  if (!recipients?.length) {
    return json({ sent: 0, skipped: 0, message: 'No recipients for this event' })
  }

  // ── Build message text ────────────────────────────────────────────────────
  const patientName = (appt?.patient as { name?: string } | null)?.name ?? 'Paciente'
  const timeStr     = appt?.starts_at
    ? format(toZonedTime(new Date(appt.starts_at), TZ), "dd/MM 'às' HH:mm")
    : ''

  const messageText = {
    new_appointment: `📅 *Nova consulta agendada*\nPaciente: ${patientName}${timeStr ? `\nHorário: ${timeStr}` : ''}`,
    cancellation:    `❌ *Consulta cancelada*\nPaciente: ${patientName}${timeStr ? `\nHorário: ${timeStr}` : ''}`,
    no_show:         `⚠️ *Faltou à consulta*\nPaciente: ${patientName}${timeStr ? `\nHorário: ${timeStr}` : ''}`,
  }[eventType]

  // ── Send to each recipient ────────────────────────────────────────────────
  let sent    = 0
  let skipped = 0
  const errors: string[] = []

  for (const recipient of recipients) {
    const phone = normalizePhone(recipient.notification_phone!)
    if (!phone) { skipped++; continue }

    try {
      const sendRes = await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${SUPABASE_SRK}`,
        },
        body: JSON.stringify({
          clinicId,
          sessionId: null,
          sentBy:    'system',
          to:        phone,
          type:      'text',
          text:      { body: messageText },
        }),
      })

      if (sendRes.ok) {
        sent++
      } else {
        const err = await sendRes.json().catch(() => ({ error: sendRes.statusText }))
        skipped++
        errors.push(`user ${recipient.id}: ${err?.error ?? sendRes.status}`)
        console.warn(`[notify-staff] failed for user ${recipient.id}:`, err)
      }
    } catch (err) {
      skipped++
      errors.push(`user ${recipient.id}: ${err}`)
    }
  }

  console.log(`[notify-staff/${eventType}] sent=${sent} skipped=${skipped} errors=${errors.length}`)
  return json({ sent, skipped, errors })
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Normalize Brazilian phone to E.164 digits (e.g. "5511991234567", no +) */
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length >= 12) return digits
  if (digits.length === 11 || digits.length === 10) return '55' + digits
  return null
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function jsonError(message: string, status: number) {
  return json({ error: message }, status)
}
