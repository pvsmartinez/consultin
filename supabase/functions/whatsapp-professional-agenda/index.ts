/**
 * Edge Function: whatsapp-professional-agenda
 *
 * Envia para cada profissional da clínica, via WhatsApp, um resumo das
 * consultas agendadas para o dia — se a clínica tiver `wa_professional_agenda = true`.
 *
 * Acionado pelo pg_cron todos os dias às 07:00 BRT (10:00 UTC):
 *   SELECT cron.schedule(
 *     'wa-professional-agenda',
 *     '0 10 * * *',
 *     $$SELECT net.http_post(
 *         url        := current_setting('app.supabase_functions_url') || '/whatsapp-professional-agenda',
 *         headers    := '{"Content-Type":"application/json","Authorization":"Bearer <service_role_key>"}',
 *         body       := '{}') AS request_id;$$
 *   );
 *
 * Pré-requisito: profissional deve ter telefone cadastrado em `professionals.phone`.
 */

import { serve }       from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { toZonedTime, fromZonedTime } from 'https://esm.sh/date-fns-tz@3'
import { format }      from 'https://esm.sh/date-fns@3'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SELF_URL     = SUPABASE_URL
const TZ           = 'America/Sao_Paulo'

interface Professional { id: string; name: string; phone: string | null }
interface Appointment  {
  id:           string
  starts_at:    string
  professional: { id: string; name: string; phone: string | null } | null
  patient:      { name: string } | null
}
interface Clinic {
  id:                        string
  name:                      string
  whatsapp_phone_number_id:  string
}

serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SRK)

  // ── Today's window in São Paulo time → UTC ISO ────────────────────────────
  const nowUtc   = new Date()
  const nowBrt   = toZonedTime(nowUtc, TZ)
  const y = nowBrt.getFullYear(), m = nowBrt.getMonth(), d = nowBrt.getDate()
  const startUTC = fromZonedTime(new Date(y, m, d, 0, 0, 0, 0),     TZ).toISOString()
  const endUTC   = fromZonedTime(new Date(y, m, d, 23, 59, 59, 999), TZ).toISOString()

  // ── On Mondays: also fetch the full week (Tue → Sun) for weekly preview ──
  const isMonday = nowBrt.getDay() === 1
  const weekEndUTC = isMonday
    ? fromZonedTime(new Date(y, m, d + 6, 23, 59, 59, 999), TZ).toISOString()
    : null

  // ── Clinics with feature enabled ──────────────────────────────────────────
  const { data: clinics, error: clinicErr } = await supabase
    .from('clinics')
    .select('id, name, whatsapp_phone_number_id')
    .eq('whatsapp_enabled',      true)
    .eq('wa_professional_agenda', true)

  if (clinicErr) {
    console.error('[prof-agenda] clinics query failed:', clinicErr)
    return json({ error: clinicErr.message }, 500)
  }
  if (!clinics?.length) return json({ sent: 0, message: 'No eligible clinics' })

  let sent = 0

  for (const clinic of clinics as Clinic[]) {
    // ── Fetch today's appointments for this clinic ──────────────────────────
    const { data: appts } = await supabase
      .from('appointments')
      .select('id, starts_at, professional:professionals(id, name, phone), patient:patients(name)')
      .eq('clinic_id', clinic.id)
      .gte('starts_at', startUTC)
      .lte('starts_at', endUTC)
      .in('status', ['scheduled', 'confirmed'])
      .order('starts_at', { ascending: true })

    // ── On Mondays: also fetch rest-of-week appointments ──────────────────
    const weekAppts = isMonday && weekEndUTC
      ? ((await supabase
          .from('appointments')
          .select('id, starts_at, professional:professionals(id, name, phone), patient:patients(name)')
          .eq('clinic_id', clinic.id)
          .gt('starts_at', endUTC)          // after today
          .lte('starts_at', weekEndUTC)
          .in('status', ['scheduled', 'confirmed'])
          .order('starts_at', { ascending: true })
        ).data ?? []) as Appointment[]
      : []

    if (!appts?.length && !weekAppts.length) continue

    // ── Group today's appointments by professional ─────────────────────────
    const byProfessional = new Map<string, { professional: Professional; lines: string[] }>()

    for (const appt of (appts ?? []) as Appointment[]) {
      const prof = appt.professional
      if (!prof?.id) continue

      if (!byProfessional.has(prof.id)) {
        byProfessional.set(prof.id, { professional: prof as Professional, lines: [] })
      }

      const timeBrt  = toZonedTime(new Date(appt.starts_at), TZ)
      const timeStr  = format(timeBrt, 'HH:mm')
      const patient  = appt.patient?.name ?? 'Paciente sem nome'
      byProfessional.get(prof.id)!.lines.push(`${timeStr} — ${patient}`)
    }

    // ── Build weekly preview section (Mondays only) ────────────────────────
    const weekByProfDay = new Map<string, { professional: Professional; byDay: Map<string, string[]> }>()

    if (isMonday) {
      for (const appt of weekAppts) {
        const prof = appt.professional
        if (!prof?.id) continue

        if (!weekByProfDay.has(prof.id)) {
          weekByProfDay.set(prof.id, { professional: prof as Professional, byDay: new Map() })
        }

        const apptBrt = toZonedTime(new Date(appt.starts_at), TZ)
        const dayKey  = format(apptBrt, 'EEE dd/MM', { locale: undefined })
        const timeStr = format(apptBrt, 'HH:mm')
        const patient = appt.patient?.name ?? 'Paciente sem nome'

        const entry = weekByProfDay.get(prof.id)!
        if (!entry.byDay.has(dayKey)) entry.byDay.set(dayKey, [])
        entry.byDay.get(dayKey)!.push(`  ${timeStr} — ${patient}`)
      }
    }

    // ── Send message to each professional with a phone ─────────────────────
    // Collect all professionals seen today OR in week preview
    const allProfIds = new Set([
      ...byProfessional.keys(),
      ...(isMonday ? weekByProfDay.keys() : []),
    ])

    for (const profId of allProfIds) {
      const todayEntry = byProfessional.get(profId)
      const weekEntry  = weekByProfDay.get(profId)
      const professional = (todayEntry?.professional ?? weekEntry?.professional) as Professional
      if (!professional?.phone) continue

      const dateStr   = format(nowBrt, 'dd/MM/yyyy')
      const todayLines = todayEntry?.lines ?? []

      let body: string

      if (isMonday) {
        // Monday: today + week preview
        const todaySection = todayLines.length > 0
          ? `📅 *Hoje (${dateStr}):*\n${todayLines.join('\n')}`
          : `📅 *Hoje (${dateStr}):* nenhuma consulta agendada.`

        const weekSections: string[] = []
        for (const [dayLabel, lines] of (weekEntry?.byDay ?? new Map())) {
          weekSections.push(`*${dayLabel}:*\n${lines.join('\n')}`)
        }
        const weekSection = weekSections.length > 0
          ? `\n\n📆 *Restante da semana:*\n${weekSections.join('\n\n')}`
          : '\n\n📆 *Restante da semana:* sem consultas agendadas.'

        body = `🗓️ Olá, ${professional.name}! Aqui está a sua semana:\n\n${todaySection}${weekSection}\n\nBoa semana! 🩺`
      } else {
        // Other days: just today
        if (!todayLines.length) continue
        body =
          `📅 Olá, ${professional.name}! Sua agenda de hoje (${dateStr}):\n\n` +
          todayLines.join('\n') +
          '\n\nBom trabalho! 🩺'
      }

      const res = await fetch(`${SELF_URL}/functions/v1/whatsapp-send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${SUPABASE_SRK}`,
        },
        body: JSON.stringify({
          clinicId:          clinic.id,
          to:                professional.phone,
          type:              'text',
          text:              { body },
          phoneNumberId:     clinic.whatsapp_phone_number_id,
        }),
      })

      if (!res.ok) {
        console.error(`[prof-agenda] send failed for ${professional.name}:`, await res.text())
      } else {
        sent++
      }
    }
  }

  return json({ sent })
})

// ── Helpers ───────────────────────────────────────────────────────────────────
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
