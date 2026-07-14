import { useMemo } from 'react'
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import { useAuthContext } from '../contexts/AuthContext'
import { useClinic } from './useClinic'
import { useAppointmentsQuery, useMyProfessionalRecords } from './useAppointmentsMutations'
import { TZ_BR, todayBR } from '../utils/date'
import type { Appointment, AppointmentStatus } from '../types'

type HomeAppointment = Appointment & { clinicName: string | null }

const DAY_ORDER = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
const ACTIVE_STATUSES = new Set<AppointmentStatus>(['scheduled', 'confirmed'])
const REVENUE_STATUSES = new Set<AppointmentStatus>(['scheduled', 'confirmed', 'completed'])
const BOOKED_STATUSES = new Set<AppointmentStatus>(['scheduled', 'confirmed', 'completed'])

/** YYYY-MM-DD math without touching the machine timezone. */
function addDaysStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

/** Day-of-week (0=Sun..6=Sat) for a YYYY-MM-DD string, timezone-independent. */
function dowOf(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** Minutes since midnight (São Paulo) for an ISO timestamp. */
function spMinutes(iso: string): number {
  const [h, m] = formatInTimeZone(iso, TZ_BR, 'HH:mm').split(':').map(Number)
  return h * 60 + m
}

export interface DayTimelineAppt {
  id: string
  startMin: number
  endMin: number
  status: AppointmentStatus
  patientName: string
}

export interface WeekDayCount {
  date: string
  weekdayLabel: string
  isToday: boolean
  count: number
}

export interface HomeData {
  loading: boolean
  /** current professional has no linked record — personal views can't show a day */
  personalViewUnavailable: boolean

  today: string
  /** the next active appointment (upcoming or in-progress), or null */
  nextAppointment: HomeAppointment | null
  /** minutes until nextAppointment starts (negative = already started) */
  nextInMinutes: number | null
  /** the few appointments after the next one, for the "Depois:" row */
  laterToday: HomeAppointment[]
  /** all of today's appointments, ascending */
  todayAppointments: HomeAppointment[]

  // Day timeline (single-line occupancy view)
  workStartMin: number | null
  workEndMin: number | null
  nowMinutes: number
  timelineAppointments: DayTimelineAppt[]

  // Counts / pulse
  bookedToday: number
  freeSlotsToday: number
  occupancyPct: number | null
  expectedRevenueCents: number
  completedToday: number
  weekCounts: WeekDayCount[]

  // Attention queue (raw signals — the view decides what to render)
  toConfirmCount: number
  pendingPaymentCount: number
  pendingPaymentCents: number
}

/**
 * Single source of truth for the operational Home.
 * Fetches the current week's appointments once (Mon–Sun, São Paulo) and derives
 * everything the three Home views need. For role=professional it scopes to the
 * user's own professional records; otherwise it reads the whole clinic.
 */
export function useHomeData(): HomeData {
  const { role, profile } = useAuthContext()
  const { data: clinic, isLoading: clinicLoading } = useClinic()
  const { data: myRecords = [], isPending: recordsPending } = useMyProfessionalRecords()

  const today = todayBR()
  const dow = dowOf(today)
  const mondayOffset = (dow + 6) % 7
  const weekStart = addDaysStr(today, -mondayOffset)
  const weekEnd = addDaysStr(weekStart, 6)
  const startsFrom = fromZonedTime(`${weekStart}T00:00:00`, TZ_BR).toISOString()
  const startsUntil = fromZonedTime(`${weekEnd}T23:59:59`, TZ_BR).toISOString()

  const isPersonal = role === 'professional'
  const myClinicIds = myRecords.filter(r => r.clinicId === profile?.clinicId).map(r => r.id)
  const personalFilter = myClinicIds.length > 0 ? myClinicIds : myRecords.map(r => r.id)
  const professionalFilter = isPersonal ? personalFilter : null
  // Personal view with no linked professional → the query is disabled by design.
  const personalViewUnavailable = isPersonal && !recordsPending && personalFilter.length === 0

  const { data: weekAppts = [], isPending: apptsPending } = useAppointmentsQuery(
    startsFrom,
    startsUntil,
    professionalFilter,
  )

  return useMemo<HomeData>(() => {
    const spDay = (iso: string) => formatInTimeZone(iso, TZ_BR, 'yyyy-MM-dd')
    const nowMs = Date.now()
    const nowMinutes = spMinutes(new Date(nowMs).toISOString())

    const todayAppointments = (weekAppts as HomeAppointment[])
      .filter(a => spDay(a.startsAt) === today)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))

    // Next appointment: still active and not finished yet.
    const upcoming = todayAppointments.filter(
      a => ACTIVE_STATUSES.has(a.status) && new Date(a.endsAt).getTime() >= nowMs,
    )
    const nextAppointment = upcoming[0] ?? null
    const nextInMinutes = nextAppointment
      ? Math.round((new Date(nextAppointment.startsAt).getTime() - nowMs) / 60_000)
      : null
    const laterToday = upcoming.slice(1, 4)

    // Working hours for today (single-line occupancy model).
    const dayKey = DAY_ORDER[dow]
    const hours = clinic?.workingHours?.[dayKey]
    let workStartMin: number | null = null
    let workEndMin: number | null = null
    let totalSlots = 0
    if (hours) {
      const [sh, sm] = hours.start.split(':').map(Number)
      const [eh, em] = hours.end.split(':').map(Number)
      workStartMin = sh * 60 + sm
      workEndMin = eh * 60 + em
      const slot = clinic?.slotDurationMinutes || 30
      totalSlots = Math.max(0, Math.floor((workEndMin - workStartMin) / slot))
    }

    const bookedApptsToday = todayAppointments.filter(a => BOOKED_STATUSES.has(a.status))
    const bookedToday = bookedApptsToday.length
    const completedToday = todayAppointments.filter(a => a.status === 'completed').length
    const freeSlotsToday = Math.max(0, totalSlots - bookedToday)
    const occupancyPct =
      totalSlots > 0 ? Math.min(100, Math.round((bookedToday / totalSlots) * 100)) : null

    const timelineAppointments: DayTimelineAppt[] = bookedApptsToday.map(a => ({
      id: a.id,
      startMin: spMinutes(a.startsAt),
      endMin: spMinutes(a.endsAt),
      status: a.status,
      patientName: a.patient?.name ?? 'Paciente',
    }))

    const expectedRevenueCents = todayAppointments
      .filter(a => REVENUE_STATUSES.has(a.status))
      .reduce((sum, a) => sum + (a.chargeAmountCents ?? 0), 0)

    // Week sparkline
    const weekCounts: WeekDayCount[] = Array.from({ length: 7 }, (_, i) => {
      const date = addDaysStr(weekStart, i)
      return {
        date,
        weekdayLabel: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'][i],
        isToday: date === today,
        count: (weekAppts as HomeAppointment[]).filter(
          a => a.status !== 'cancelled' && a.status !== 'no_show' && spDay(a.startsAt) === date,
        ).length,
      }
    })

    // Attention signals
    const toConfirmCount = todayAppointments.filter(a => a.status === 'scheduled').length
    const pendingPayments = (weekAppts as HomeAppointment[]).filter(
      a => a.status === 'completed' && (a.chargeAmountCents ?? 0) > 0 && !a.paidAmountCents,
    )
    const pendingPaymentCount = pendingPayments.length
    const pendingPaymentCents = pendingPayments.reduce((s, a) => s + (a.chargeAmountCents ?? 0), 0)

    return {
      loading: clinicLoading || apptsPending || (isPersonal && recordsPending),
      personalViewUnavailable,
      today,
      nextAppointment,
      nextInMinutes,
      laterToday,
      todayAppointments,
      workStartMin,
      workEndMin,
      nowMinutes,
      timelineAppointments,
      bookedToday,
      freeSlotsToday,
      occupancyPct,
      expectedRevenueCents,
      completedToday,
      weekCounts,
      toConfirmCount,
      pendingPaymentCount,
      pendingPaymentCents,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    weekAppts,
    clinic?.workingHours,
    clinic?.slotDurationMinutes,
    today,
    dow,
    weekStart,
    isPersonal,
    recordsPending,
    apptsPending,
    clinicLoading,
    personalViewUnavailable,
  ])
}
