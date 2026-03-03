/**
 * Edge Function: whatsapp-reminders
 *
 * Dispatches appointment reminder messages (D-1 and D-0) for ALL enabled clinics.
 * Triggered by pg_cron twice a day (08:00 for D-1, 07:00 for D-0 — both UTC).
 *
 * Body: { type: 'd1' | 'd0' }
 *
 * Deduplication: checks notification_log before sending — safe to retry.
 * LGPD: only sends to patients who have a phone number on file.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { format, addDays } from 'https://esm.sh/date-fns@3'
import { toZonedTime, fromZonedTime } from 'https://esm.sh/date-fns-tz@3'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SELF_URL     = Deno.env.get('SUPABASE_URL')!.replace('https://', 'https://') // same base

const TZ = 'America/Sao_Paulo'

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const { type } = (await req.json().catch(() => ({}))) as { type?: string }
  if (type !== 'd1' && type !== 'd0') {
    return jsonError('Body must include type: "d1" or "d0"', 400)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SRK)

  // ── Target date in São Paulo time ─────────────────────────────────────────
  const nowUtc       = new Date()
  const nowBrt        = toZonedTime(nowUtc, TZ)
  const targetBrt     = type === 'd1' ? addDays(nowBrt, 1) : nowBrt

  // Convert target day boundaries in São Paulo time → UTC ISO strings for DB query
  const y = targetBrt.getFullYear()
  const m = targetBrt.getMonth()
  const d = targetBrt.getDate()
  const startUTC = fromZonedTime(new Date(y, m, d, 0, 0, 0, 0),    TZ).toISOString()
  const endUTC   = fromZonedTime(new Date(y, m, d, 23, 59, 59, 999), TZ).toISOString()

  // ── Fetch all appointments for the target date across all enabled clinics ──
  const { data: appointments, error: apptErr } = await supabase
    .from('appointments')
    .select(`
      id,
      clinic_id,
      starts_at,
      status,
      patient:patients ( id, name, phone ),
      professional:professionals ( name )
    `)
    .gte('starts_at', startUTC)
    .lte('starts_at', endUTC)
    .in('status', ['scheduled', 'confirmed'])
    .not('patients.phone', 'is', null)

  if (apptErr) {
    console.error('[reminders] appointment query failed:', apptErr)
    return jsonError('DB error fetching appointments', 500)
  }

  if (!appointments?.length) {
    return json({ sent: 0, message: 'No appointments found for target date' })
  }

  // ── Fetch which clinics have WhatsApp reminders enabled ───────────────────
  const clinicIds = [...new Set(appointments.map((a) => a.clinic_id))]
  const { data: clinics } = await supabase
    .from('clinics')
    .select('id, whatsapp_enabled, wa_reminders_d1, wa_reminders_d0, whatsapp_phone_number_id')
    .in('id', clinicIds)
    .eq('whatsapp_enabled', true)
    .eq(type === 'd1' ? 'wa_reminders_d1' : 'wa_reminders_d0', true)

  const enabledClinics = new Set((clinics ?? []).map((c) => c.id))

  let sent = 0
  let skipped = 0
  const errors: string[] = []

  for (const appt of appointments) {
    if (!enabledClinics.has(appt.clinic_id)) { skipped++; continue }

    const patient = appt.patient as { id: string; name: string; phone: string } | null
    if (!patient?.phone) { skipped++; continue }

    // ── Deduplication check ─────────────────────────────────────────────────
    const notifType = type === 'd1' ? 'reminder_d1' : 'reminder_d0'
    const { data: existing } = await supabase
      .from('notification_log')
      .select('id')
      .eq('appointment_id', appt.id)
      .eq('channel', 'whatsapp')
      .eq('type', notifType)
      .not('status', 'eq', 'failed')
      .maybeSingle()

    if (existing) { skipped++; continue }

    // ── Build template parameters ───────────────────────────────────────────
    const apptTimeBrt = toZonedTime(new Date(appt.starts_at), TZ)
    const dateStr     = format(apptTimeBrt, "dd/MM/yyyy")
    const timeStr     = format(apptTimeBrt, "HH:mm")
    const profName    = (appt.professional as { name: string })?.name ?? 'o profissional'

    // Fetch the template name from DB (clinic can customise)
    const { data: tplRow } = await supabase
      .from('whatsapp_templates')
      .select('meta_template_name')
      .eq('clinic_id', appt.clinic_id)
      .eq('template_key', notifType)
      .eq('enabled', true)
      .maybeSingle()

    if (!tplRow) { skipped++; continue }

    // ── Dispatch via whatsapp-send ──────────────────────────────────────────
    const phoneE164 = normalizePhone(patient.phone)
    if (!phoneE164) { skipped++; continue }

    const templateComponents =
      type === 'd1'
        ? [{ type: 'body', parameters: [
              { type: 'text', text: patient.name },
              { type: 'text', text: dateStr },
              { type: 'text', text: timeStr },
              { type: 'text', text: profName },
            ]}]
        : [{ type: 'body', parameters: [
              { type: 'text', text: patient.name },
              { type: 'text', text: timeStr },
              { type: 'text', text: profName },
            ]}]

    try {
      const sendRes = await fetch(`${SELF_URL}/functions/v1/whatsapp-send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SUPABASE_SRK}`,
        },
        body: JSON.stringify({
          clinicId:  appt.clinic_id,
          sessionId: null,
          sentBy:    'system',
          to:        phoneE164,
          type:      'template',
          template: {
            name:     tplRow.meta_template_name,
            language: { code: 'pt_BR' },
            components: templateComponents,
          },
        }),
      })

      const sendBody = await sendRes.json()
      const waMessageId = sendBody?.waMessageId ?? null

      // Log success
      await supabase.from('notification_log').insert({
        clinic_id:      appt.clinic_id,
        appointment_id: appt.id,
        patient_id:     patient.id,
        channel:        'whatsapp',
        type:           notifType,
        status:         sendRes.ok ? 'sent' : 'failed',
        error_message:  sendRes.ok ? null : sendBody?.error,
        wa_message_id:  waMessageId,
      })

      if (sendRes.ok) sent++
      else { errors.push(`appt ${appt.id}: ${sendBody?.error}`); skipped++ }
    } catch (err) {
      errors.push(`appt ${appt.id}: ${err}`)
      skipped++
    }
  }

  console.log(`[reminders/${type}] sent=${sent} skipped=${skipped} errors=${errors.length}`)
  return json({ sent, skipped, errors })
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Normalize Brazilian phone to E.164 (no +, just digits: 5511991234567) */
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  // Already has country code (55)
  if (digits.startsWith('55') && digits.length >= 12) return digits
  // Add 55
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
