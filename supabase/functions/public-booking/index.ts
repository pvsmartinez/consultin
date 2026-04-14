import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { fromZonedTime, toZonedTime } from 'https://esm.sh/date-fns-tz@3'

interface ImportMeta {
  readonly main: boolean
}

const TZ = 'America/Sao_Paulo'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const RATE_LIMITS = {
  slots: {
    windowMs: 10 * 60 * 1000,
    maxByIp: 60,
  },
  book: {
    windowMs: 60 * 60 * 1000,
    maxByIp: 10,
    maxByPhone: 3,
  },
} as const

type BookingAction = keyof typeof RATE_LIMITS
type AdminClient = ReturnType<typeof createClient<any>>

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

type PublicBookingDeps = {
  createAdminClient?: () => AdminClient
  now?: () => Date
  logError?: (...args: unknown[]) => void
}

export type PublicBookingSlot = {
  professionalId: string
  professionalName: string
  specialty: string | null
  startsAt: string
  endsAt: string
  displayDate: string
  displayTime: string
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

export function normalizePhone(phone: string) {
  return phone.replace(/\D/g, '')
}

export function pad2(value: number) {
  return String(value).padStart(2, '0')
}

export function formatDateKey(date: Date) {
  const zoned = toZonedTime(date, TZ)
  return `${zoned.getFullYear()}-${pad2(zoned.getMonth() + 1)}-${pad2(zoned.getDate())}`
}

export function parseDateKey(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null

  const parsed = fromZonedTime(`${value}T00:00:00`, TZ)
  if (Number.isNaN(parsed.getTime())) return null

  return formatDateKey(parsed) === value ? value : null
}

export function normalizeTimeValue(value: string) {
  const [hoursRaw, minutesRaw] = value.split(':')
  const hours = Number(hoursRaw)
  const minutes = Number(minutesRaw)
  return `${pad2(hours)}:${pad2(minutes)}`
}

export function toUtcDate(dateKey: string, time: string) {
  return fromZonedTime(`${dateKey}T${normalizeTimeValue(time)}:00`, TZ)
}

export function matchesWeekParity(parity: string | null, date: Date): boolean {
  if (!parity || parity === 'every') return true
  const startOfYear = new Date(date.getFullYear(), 0, 1)
  const weekNum = Math.ceil(((date.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7)
  if (parity === 'even') return weekNum % 2 === 0
  if (parity === 'odd') return weekNum % 2 !== 0
  if (parity.startsWith('every3:')) return weekNum % 3 === parseInt(parity.split(':')[1], 10) % 3
  if (parity.startsWith('monthly:')) return date.getDate() === parseInt(parity.split(':')[1], 10)
  return true
}

export function extractClientIp(req: Request) {
  const forwardedIp = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim()
  return (req.headers.get('cf-connecting-ip') ?? forwardedIp) || 'unknown'
}

export async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value)
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function loadPublicContext(admin: AdminClient, slug: string) {
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
  admin: AdminClient,
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

export function computeAvailableSlots(params: {
  professionals: ProfessionalRow[]
  availabilitySlots: AvailabilitySlotRow[]
  busyAppointments: AppointmentBusyRow[]
  slotDuration: number
  dateKey: string
  professionalId?: string
  maxSlots?: number
  now?: Date
}): PublicBookingSlot[] {
  const normalizedDateKey = parseDateKey(params.dateKey)
  if (!normalizedDateKey) return []

  const searchStart = toUtcDate(normalizedDateKey, '00:00')
  const targetDate = toZonedTime(searchStart, TZ)
  const maxSlots = params.maxSlots ?? 40
  const now = params.now ?? new Date()
  const results: PublicBookingSlot[] = []

  for (const avail of params.availabilitySlots) {
    if (params.professionalId && avail.professional_id !== params.professionalId) continue
    if (avail.weekday !== targetDate.getDay()) continue
    if (!matchesWeekParity(avail.week_parity, targetDate)) continue

    const professional = params.professionals.find((row) => row.id === avail.professional_id)
    if (!professional) continue

    let slotStart = toUtcDate(normalizedDateKey, avail.start_time)
    const windowEnd = toUtcDate(normalizedDateKey, avail.end_time)

    while (results.length < maxSlots && slotStart.getTime() + params.slotDuration * 60000 <= windowEnd.getTime()) {
      const slotEnd = new Date(slotStart.getTime() + params.slotDuration * 60000)
      if (slotStart.getTime() <= now.getTime() + 5 * 60000) {
        slotStart = slotEnd
        continue
      }

      const isBusy = params.busyAppointments.some((appt) => (
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

async function findAvailableSlots(
  admin: AdminClient,
  clinicId: string,
  slotDuration: number,
  dateKey: string,
  professionalId?: string,
  maxSlots = 40,
  now = new Date(),
): Promise<PublicBookingSlot[]> {
  const normalizedDateKey = parseDateKey(dateKey)
  if (!normalizedDateKey) return []

  const searchStart = toUtcDate(normalizedDateKey, '00:00')
  const searchEnd = fromZonedTime(`${normalizedDateKey}T23:59:59.999`, TZ)

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

  return computeAvailableSlots({
    professionals: (professionals ?? []) as ProfessionalRow[],
    availabilitySlots: (availSlots ?? []) as AvailabilitySlotRow[],
    busyAppointments: (busyAppts ?? []) as AppointmentBusyRow[],
    slotDuration,
    dateKey: normalizedDateKey,
    professionalId,
    maxSlots,
    now,
  })
}

export function validateSelectedSlot(params: {
  availableSlots: PublicBookingSlot[]
  professionalId: string
  requestedStartsAtIso: string
  requestedEndsAtIso: string
}) {
  const selectedSlot = params.availableSlots.find((slot) => (
    slot.professionalId === params.professionalId
    && slot.startsAt === params.requestedStartsAtIso
  ))

  if (!selectedSlot) {
    return { selectedSlot: null, error: 'invalid_or_unavailable' as const }
  }

  if (selectedSlot.endsAt !== params.requestedEndsAtIso) {
    return { selectedSlot: null, error: 'invalid_duration' as const }
  }

  return { selectedSlot, error: null }
}

async function enforcePublicBookingRateLimit(params: {
  admin: AdminClient
  clinicId: string
  action: BookingAction
  clientIp: string
  phoneHash?: string | null
  now: Date
}) {
  const config = RATE_LIMITS[params.action]
  const cutoff = new Date(params.now.getTime() - config.windowMs).toISOString()

  if (params.clientIp !== 'unknown') {
    const { count, error } = await params.admin
      .from('public_booking_rate_limits')
      .select('*', { count: 'exact', head: true })
      .eq('clinic_id', params.clinicId)
      .eq('action', params.action)
      .eq('client_ip', params.clientIp)
      .gte('created_at', cutoff)

    if (error) throw error
    if ((count ?? 0) >= config.maxByIp) {
      return json({ error: 'Muitas tentativas. Aguarde um pouco antes de tentar novamente.' }, 429)
    }
  }

  if (params.action === 'book' && params.phoneHash) {
    const bookConfig = RATE_LIMITS.book
    const { count, error } = await params.admin
      .from('public_booking_rate_limits')
      .select('*', { count: 'exact', head: true })
      .eq('clinic_id', params.clinicId)
      .eq('action', 'book')
      .eq('phone_hash', params.phoneHash)
      .gte('created_at', cutoff)

    if (error) throw error
    if ((count ?? 0) >= bookConfig.maxByPhone) {
      return json({ error: 'Esse número atingiu o limite de tentativas por agora. Tente novamente mais tarde.' }, 429)
    }
  }

  const { error: insertError } = await params.admin
    .from('public_booking_rate_limits')
    .insert({
      clinic_id: params.clinicId,
      action: params.action,
      client_ip: params.clientIp !== 'unknown' ? params.clientIp : null,
      phone_hash: params.phoneHash ?? null,
    })

  if (insertError) throw insertError
  return null
}

function createAdminClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Supabase environment variables are not configured')
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  })
}

export function createPublicBookingHandler(deps: PublicBookingDeps = {}) {
  const nowProvider = deps.now ?? (() => new Date())
  const buildAdminClient = deps.createAdminClient ?? createAdminClient
  const logError = deps.logError ?? console.error

  return async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

    const admin = buildAdminClient()
    const clientIp = extractClientIp(req)

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

        const rateLimitResponse = await enforcePublicBookingRateLimit({
          admin,
          clinicId: clinic.id,
          action: 'slots',
          clientIp,
          now: nowProvider(),
        })
        if (rateLimitResponse) return rateLimitResponse

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
          40,
          nowProvider(),
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

        const phoneHash = await sha256Hex(patientPhone)
        const rateLimitResponse = await enforcePublicBookingRateLimit({
          admin,
          clinicId: clinic.id,
          action: 'book',
          clientIp,
          phoneHash,
          now: nowProvider(),
        })
        if (rateLimitResponse) return rateLimitResponse

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
          nowProvider(),
        )
        const { selectedSlot, error: slotValidationError } = validateSelectedSlot({
          availableSlots,
          professionalId,
          requestedStartsAtIso: requestedStartsAt.toISOString(),
          requestedEndsAtIso: requestedEndsAt.toISOString(),
        })

        if (!selectedSlot) {
          return json({
            error: slotValidationError === 'invalid_duration'
              ? 'O horário selecionado não confere com a duração disponível'
              : 'Horário inválido ou indisponível',
          }, 400)
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
      logError('[public-booking] error', error)
      return json({ error: error instanceof Error ? error.message : 'Erro interno' }, 500)
    }
  }
}

if (import.meta.main) {
  serve(createPublicBookingHandler())
}
