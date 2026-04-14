import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { fromZonedTime, toZonedTime } from 'https://esm.sh/date-fns-tz@3'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TZ = 'America/Sao_Paulo'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type ClinicPublicPageRow = {
  clinic_id: string
  slug: string
  published: boolean
  show_booking: boolean
}

type ClinicRow = {
  id: string
  name: string
  slot_duration_minutes: number
  allow_self_registration: boolean
}

type ProfessionalRow = {
  id: string
  name: string
  specialty: string | null
}

type AvailabilitySlotRow = {
  professional_id: string
  weekday: number
  start_time: string
  end_time: string
  week_parity: string | null
  active: boolean
}

type AppointmentBusyRow = {
  professional_id: string
  starts_at: string
  ends_at: string
}

type PublicBookingSlot = {
  professionalId: string
  professionalName: string
  specialty: string | null
  startsAt: string
  endsAt: string
  displayDate: string
  displayTime: string
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, '')
}

function pad2(value: number) {
  return String(value).padStart(2, '0')
}

function formatDateKey(date: Date) {
  const zoned = toZonedTime(date, TZ)
  return `${zoned.getFullYear()}-${pad2(zoned.getMonth() + 1)}-${pad2(zoned.getDate())}`
}

function parseDateKey(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null

  const parsed = fromZonedTime(`${value}T00:00:00`, TZ)
  if (Number.isNaN(parsed.getTime())) return null

  return formatDateKey(parsed) === value ? value : null
}

function normalizeTimeValue(value: string) {
  const [hoursRaw, minutesRaw] = value.split(':')
  const hours = Number(hoursRaw)
  const minutes = Number(minutesRaw)
  return `${pad2(hours)}:${pad2(minutes)}`
}

function toUtcDate(dateKey: string, time: string) {
  return fromZonedTime(`${dateKey}T${normalizeTimeValue(time)}:00`, TZ)
}

function matchesWeekParity(parity: string | null, date: Date): boolean {
  if (!parity || parity === 'every') return true
  const startOfYear = new Date(date.getFullYear(), 0, 1)
  const weekNum = Math.ceil(((date.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7)
  if (parity === 'even') return weekNum % 2 === 0
  if (parity === 'odd') return weekNum % 2 !== 0
  if (parity.startsWith('every3:')) return weekNum % 3 === parseInt(parity.split(':')[1], 10) % 3
  if (parity.startsWith('monthly:')) return date.getDate() === parseInt(parity.split(':')[1], 10)
  return true
}

async function loadPublicContext(admin: ReturnType<typeof createClient>, slug: string) {
  const { data: page, error: pageError } = await admin
    .from('clinic_public_page')
    .select('clinic_id, slug, published, show_booking')
    .eq('slug', slug)
    .eq('published', true)
    .single()

  if (pageError || !page) throw new Error('Página pública não encontrada')

  const { data: clinic, error: clinicError } = await admin
    .from('clinics')
    .select('id, name, slot_duration_minutes, allow_self_registration')
    .eq('id', (page as ClinicPublicPageRow).clinic_id)
    .single()

  if (clinicError || !clinic) throw new Error('Clínica não encontrada')

  const publicPage = page as ClinicPublicPageRow
  const clinicRow = clinic as ClinicRow

  if (!publicPage.show_booking || !clinicRow.allow_self_registration) {
    throw new Error('Agendamento público não está habilitado para esta clínica')
  }

  return { page: publicPage, clinic: clinicRow }
}

async function resolveSlotDuration(
  admin: ReturnType<typeof createClient>,
  clinicId: string,
  clinicSlotDuration: number,
  serviceTypeId?: string | null,
  strict = false,
) {
  if (!serviceTypeId) return clinicSlotDuration

  const { data: service, error } = await admin
    .from('service_types')
    .select('duration_minutes, active')
    .eq('clinic_id', clinicId)
    .eq('id', serviceTypeId)
    .single()

  if (error || !service || (service as { active?: boolean }).active === false) {
    if (strict) throw new Error('Serviço não encontrado')
    return clinicSlotDuration
  }

  return (service as { duration_minutes: number }).duration_minutes
}

async function findAvailableSlots(
  admin: ReturnType<typeof createClient>,
  clinicId: string,
  slotDuration: number,
  dateKey: string,
  professionalId?: string,
  maxSlots = 40,
): Promise<PublicBookingSlot[]> {
  const normalizedDateKey = parseDateKey(dateKey)
  if (!normalizedDateKey) return []

  const searchStart = toUtcDate(normalizedDateKey, '00:00')
  const searchEnd = fromZonedTime(`${normalizedDateKey}T23:59:59.999`, TZ)
  const targetDate = toZonedTime(searchStart, TZ)

  let professionalsQuery = admin
    .from('professionals')
    .select('id, name, specialty')
    .eq('clinic_id', clinicId)
    .eq('active', true)

  if (professionalId) professionalsQuery = professionalsQuery.eq('id', professionalId)

  const { data: professionals } = await professionalsQuery
  if (!professionals || professionals.length === 0) return []

  const profIds = (professionals as ProfessionalRow[]).map((professional) => professional.id)

  const [{ data: availSlots }, { data: busyAppts }] = await Promise.all([
    admin
      .from('availability_slots')
      .select('professional_id, weekday, start_time, end_time, week_parity, active')
      .in('professional_id', profIds)
      .eq('active', true),
    admin
      .from('appointments')
      .select('professional_id, starts_at, ends_at')
      .eq('clinic_id', clinicId)
      .not('status', 'in', '("cancelled","no_show")')
      .gte('starts_at', searchStart.toISOString())
      .lt('starts_at', searchEnd.toISOString()),
  ])

  if (!availSlots) return []

  const weekday = targetDate.getDay()
  const now = new Date()
  const busy = (busyAppts ?? []) as AppointmentBusyRow[]
  const results: PublicBookingSlot[] = []

  for (const avail of availSlots as AvailabilitySlotRow[]) {
    if (avail.weekday !== weekday) continue
    if (!matchesWeekParity(avail.week_parity, targetDate)) continue

    const professional = (professionals as ProfessionalRow[]).find((row) => row.id === avail.professional_id)
    if (!professional) continue

    let slotStart = toUtcDate(normalizedDateKey, avail.start_time)
    const windowEnd = toUtcDate(normalizedDateKey, avail.end_time)

    while (results.length < maxSlots && slotStart.getTime() + slotDuration * 60000 <= windowEnd.getTime()) {
      const slotEnd = new Date(slotStart.getTime() + slotDuration * 60000)
      if (slotStart.getTime() <= now.getTime() + 5 * 60000) {
        slotStart = slotEnd
        continue
      }

      const isBusy = busy.some((appt) => (
        appt.professional_id === professional.id
        && new Date(appt.starts_at) < slotEnd
        && new Date(appt.ends_at ?? appt.starts_at) > slotStart
      ))

      if (!isBusy) {
        results.push({
          professionalId: professional.id,
          professionalName: professional.name,
          specialty: professional.specialty,
          startsAt: slotStart.toISOString(),
          endsAt: slotEnd.toISOString(),
          displayDate: slotStart.toLocaleDateString('pt-BR', {
            weekday: 'short',
            day: '2-digit',
            month: '2-digit',
            timeZone: TZ,
          }),
          displayTime: slotStart.toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: TZ,
          }),
        })
      }

      slotStart = slotEnd
    }
  }

  return results.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const action = body.action
  const slug = typeof body.slug === 'string' ? body.slug.trim() : ''

  if (!slug) return json({ error: 'slug é obrigatório' }, 400)

  try {
    const { page, clinic } = await loadPublicContext(admin, slug)

    if (action === 'slots') {
      const date = typeof body.date === 'string' ? body.date : ''
      const normalizedDate = parseDateKey(date)
      if (!normalizedDate) return json({ error: 'date inválido' }, 400)

      const professionalId = typeof body.professionalId === 'string' && body.professionalId.trim()
        ? body.professionalId.trim()
        : undefined
      const serviceTypeId = typeof body.serviceTypeId === 'string' && body.serviceTypeId.trim()
        ? body.serviceTypeId.trim()
        : undefined

      const slotDuration = await resolveSlotDuration(
        admin,
        clinic.id,
        clinic.slot_duration_minutes,
        serviceTypeId,
      )

      const slots = await findAvailableSlots(
        admin,
        clinic.id,
        slotDuration,
        normalizedDate,
        professionalId,
      )

      return json({ ok: true, clinicId: clinic.id, slug: page.slug, slots })
    }

    if (action === 'book') {
      const patientName = typeof body.patientName === 'string' ? body.patientName.trim() : ''
      const patientPhoneRaw = typeof body.patientPhone === 'string' ? body.patientPhone.trim() : ''
      const patientEmail = typeof body.patientEmail === 'string' ? body.patientEmail.trim().toLowerCase() : ''
      const professionalId = typeof body.professionalId === 'string' ? body.professionalId.trim() : ''
      const startsAt = typeof body.startsAt === 'string' ? body.startsAt : ''
      const endsAt = typeof body.endsAt === 'string' ? body.endsAt : ''
      const serviceTypeId = typeof body.serviceTypeId === 'string' && body.serviceTypeId.trim() ? body.serviceTypeId.trim() : null
      const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null

      if (!patientName || !patientPhoneRaw || !professionalId || !startsAt || !endsAt) {
        return json({ error: 'Dados obrigatórios ausentes para o agendamento' }, 400)
      }

      const patientPhone = normalizePhone(patientPhoneRaw)
      if (patientPhone.length < 10) {
        return json({ error: 'WhatsApp inválido' }, 400)
      }

      const requestedStartsAt = new Date(startsAt)
      const requestedEndsAt = new Date(endsAt)
      if (Number.isNaN(requestedStartsAt.getTime()) || Number.isNaN(requestedEndsAt.getTime())) {
        return json({ error: 'Horário inválido' }, 400)
      }
      if (requestedEndsAt.getTime() <= requestedStartsAt.getTime()) {
        return json({ error: 'Intervalo de horário inválido' }, 400)
      }

      const { data: professional, error: professionalError } = await admin
        .from('professionals')
        .select('id, name')
        .eq('clinic_id', clinic.id)
        .eq('id', professionalId)
        .eq('active', true)
        .single()
      if (professionalError || !professional) {
        return json({ error: 'Profissional não encontrado' }, 404)
      }

      let slotDuration: number
      try {
        slotDuration = await resolveSlotDuration(
          admin,
          clinic.id,
          clinic.slot_duration_minutes,
          serviceTypeId,
          true,
        )
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : 'Serviço inválido' }, 400)
      }
      const bookingDate = formatDateKey(requestedStartsAt)
      const availableSlots = await findAvailableSlots(
        admin,
        clinic.id,
        slotDuration,
        bookingDate,
        professionalId,
        500,
      )
      const selectedSlot = availableSlots.find((slot) => (
        slot.professionalId === professionalId
        && slot.startsAt === requestedStartsAt.toISOString()
      ))

      if (!selectedSlot) {
        return json({ error: 'Horário inválido ou indisponível' }, 400)
      }

      if (selectedSlot.endsAt !== requestedEndsAt.toISOString()) {
        return json({ error: 'O horário selecionado não confere com a duração disponível' }, 400)
      }

      const { data: conflicting } = await admin
        .from('appointments')
        .select('id')
        .eq('clinic_id', clinic.id)
        .eq('professional_id', professionalId)
        .not('status', 'in', '("cancelled","no_show")')
        .lt('starts_at', selectedSlot.endsAt)
        .gt('ends_at', selectedSlot.startsAt)
        .limit(1)

      if ((conflicting ?? []).length > 0) {
        return json({ error: 'Esse horário acabou de ser reservado. Escolha outro.' }, 409)
      }

      let patientId: string | null = null

      const { data: existingByPhone } = await admin
        .from('patients')
        .select('id, email')
        .eq('clinic_id', clinic.id)
        .in('phone', [patientPhoneRaw, patientPhone])
        .limit(1)

      if ((existingByPhone ?? []).length > 0) {
        patientId = (existingByPhone![0] as { id: string }).id
        const existingPatient = existingByPhone![0] as { id: string; email?: string | null }
        if (!existingPatient.email && patientEmail) {
          await admin.from('patients').update({ email: patientEmail }).eq('id', patientId)
        }
      } else {
        const { data: createdPatient, error: patientError } = await admin
          .from('patients')
          .insert({
            clinic_id: clinic.id,
            name: patientName,
            phone: patientPhoneRaw,
            email: patientEmail || null,
          })
          .select('id')
          .single()

        if (patientError || !createdPatient) {
          return json({ error: 'Não foi possível criar o cadastro do paciente' }, 500)
        }
        patientId = (createdPatient as { id: string }).id
      }

      const { data: appointment, error: appointmentError } = await admin
        .from('appointments')
        .insert({
          clinic_id: clinic.id,
          patient_id: patientId,
          professional_id: professionalId,
          starts_at: selectedSlot.startsAt,
          ends_at: selectedSlot.endsAt,
          status: 'scheduled',
          notes,
          service_type_id: serviceTypeId,
        })
        .select('id')
        .single()

      if (appointmentError || !appointment) {
        const message = appointmentError?.message?.includes('no_overlap')
          ? 'Esse horário acabou de ser reservado. Escolha outro.'
          : 'Não foi possível criar a consulta'
        return json({ error: message }, appointmentError?.message?.includes('no_overlap') ? 409 : 500)
      }

      await admin.from('clinic_notifications').insert({
        clinic_id: clinic.id,
        type: 'public_booking_created',
        data: {
          patientName,
          patientId,
          appointmentId: (appointment as { id: string }).id,
          slug: page.slug,
          source: 'public_page',
        },
      })

      return json({
        ok: true,
        appointmentId: (appointment as { id: string }).id,
        patientId,
        patientName,
        professionalName: (professional as { name: string }).name,
        startsAt: selectedSlot.startsAt,
      })
    }

    return json({ error: 'Ação inválida' }, 400)
  } catch (error) {
    console.error('[public-booking] error', error)
    return json({ error: error instanceof Error ? error.message : 'Erro interno' }, 500)
  }
})
