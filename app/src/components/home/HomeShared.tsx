import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ptBR } from 'date-fns/locale'
import { formatInTimeZone } from 'date-fns-tz'
import {
  ArrowRight,
  CalendarBlank,
  Clock,
  DoorOpen,
  IdentificationCard,
  Stethoscope,
} from '@phosphor-icons/react'
import { TZ_BR } from '../../utils/date'
import { APP_ROUTES } from '../../lib/appRoutes'
import { useUpdateAppointmentStatus } from '../../hooks/useAppointmentsMutations'
import type { HomeData } from '../../hooks/useHomeData'

/** "Bom dia" / "Boa tarde" / "Boa noite" by São Paulo hour. */
function greetingFor(hour: number): string {
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

function firstNameOf(name?: string | null): string {
  if (!name) return ''
  return name.trim().split(/\s+/)[0]
}

function formatCountdown(min: number): string {
  if (min <= 0) return 'em andamento'
  if (min < 60) return `em ${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `em ${h}h` : `em ${h}h${String(m).padStart(2, '0')}`
}

/** A white card matching the app's rounded/soft-border language. */
export function HomeCard({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={`rounded-[28px] border border-gray-100 bg-white p-6 shadow-sm sm:p-7 ${className}`}
    >
      {children}
    </section>
  )
}

export function CardEyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">{children}</p>
  )
}

/** Live header: greeting + long date on the left, ticking clock on the right. */
export function HomeGreeting({ name }: { name?: string | null }) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  const iso = now.toISOString()
  const hour = Number(formatInTimeZone(iso, TZ_BR, 'H'))
  const dateLabel = formatInTimeZone(iso, TZ_BR, "EEEE, d 'de' MMMM", { locale: ptBR })
  const clock = formatInTimeZone(iso, TZ_BR, 'HH:mm')
  const first = firstNameOf(name)

  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          {greetingFor(hour)}
          {first ? `, ${first}` : ''}
        </h1>
        <p className="mt-1 text-sm capitalize text-gray-500">{dateLabel}</p>
      </div>
      <div className="flex items-center gap-2 rounded-full border border-gray-100 bg-white px-3 py-1.5 text-sm font-semibold tabular-nums text-gray-700 shadow-sm">
        <Clock size={16} weight="duotone" className="text-[#0ea5b0]" />
        {clock}
      </div>
    </div>
  )
}

/**
 * The hero card: who is next and in how long, with the two actions that matter.
 * Reused by the admin/reception cockpit and the professional's personal view.
 */
export function NextAppointmentCard({
  data,
  canManageAgenda,
  canViewPatients,
  onNewAppointment,
}: {
  data: HomeData
  canManageAgenda: boolean
  canViewPatients: boolean
  onNewAppointment?: () => void
}) {
  const navigate = useNavigate()
  const updateStatus = useUpdateAppointmentStatus()
  const appt = data.nextAppointment

  const shell =
    'rounded-[28px] border border-[#bfe6e5] bg-[linear-gradient(135deg,#f4fffe_0%,#ebfbfb_45%,#f8fbff_100%)] p-6 shadow-sm sm:p-8'

  if (!appt) {
    return (
      <section className={shell}>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#0b7b83]">
          Agora / Próximo
        </p>
        <h2 className="mt-3 text-2xl font-bold text-gray-900">Nada mais na agenda de hoje</h2>
        <p className="mt-1 text-sm text-gray-600">
          {data.bookedToday > 0
            ? 'Todos os atendimentos de hoje já foram encerrados.'
            : 'Nenhuma consulta marcada para hoje.'}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => navigate(APP_ROUTES.staff.agenda)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-medium text-white shadow-sm transition-transform active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
          >
            <CalendarBlank size={16} /> Abrir agenda
          </button>
          {onNewAppointment && canManageAgenda && (
            <button
              type="button"
              onClick={onNewAppointment}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-medium text-gray-700 transition-colors hover:border-[#0ea5b0]/40 hover:text-[#0ea5b0]"
            >
              Nova consulta
            </button>
          )}
        </div>
      </section>
    )
  }

  const time = formatInTimeZone(appt.startsAt, TZ_BR, 'HH:mm')
  const countdown = data.nextInMinutes !== null ? formatCountdown(data.nextInMinutes) : null
  const isScheduled = appt.status === 'scheduled'

  return (
    <section className={shell}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#0b7b83]">
          Agora / Próximo
        </p>
        {countdown && (
          <span className="rounded-full bg-[#006970] px-3 py-1 text-xs font-semibold text-white shadow-sm">
            {countdown}
          </span>
        )}
      </div>

      <h2 className="mt-3 text-3xl font-bold tracking-tight text-gray-900">
        {appt.patient?.name ?? 'Paciente'}
      </h2>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
        <span className="inline-flex items-center gap-1.5">
          <Clock size={16} weight="duotone" className="text-[#0ea5b0]" /> {time}
        </span>
        {appt.clinicRoom?.name && (
          <span className="inline-flex items-center gap-1.5">
            <DoorOpen size={16} weight="duotone" className="text-[#0ea5b0]" /> {appt.clinicRoom.name}
          </span>
        )}
        {appt.professional?.name && (
          <span className="inline-flex items-center gap-1.5">
            <Stethoscope size={16} weight="duotone" className="text-[#0ea5b0]" />{' '}
            {appt.professional.name}
          </span>
        )}
      </div>

      {appt.notes && <p className="mt-2 line-clamp-1 text-sm text-gray-500">{appt.notes}</p>}

      <div className="mt-5 flex flex-wrap gap-3">
        {isScheduled && canManageAgenda ? (
          <button
            type="button"
            disabled={updateStatus.isPending}
            onClick={() => updateStatus.mutate({ id: appt.id, status: 'confirmed' })}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-medium text-white shadow-sm transition-transform active:scale-[0.98] disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
          >
            <CalendarBlank size={16} /> Confirmar consulta
          </button>
        ) : (
          <button
            type="button"
            onClick={() => navigate(APP_ROUTES.staff.agenda)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-medium text-white shadow-sm transition-transform active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
          >
            <CalendarBlank size={16} /> Abrir na agenda
          </button>
        )}

        {canViewPatients && appt.patientId && (
          <button
            type="button"
            onClick={() => navigate(`${APP_ROUTES.staff.patients}/${appt.patientId}`)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-medium text-gray-700 transition-colors hover:border-[#0ea5b0]/40 hover:text-[#0ea5b0]"
          >
            <IdentificationCard size={16} /> Abrir ficha
          </button>
        )}
      </div>

      {data.laterToday.length > 0 && (
        <div className="mt-5 flex items-center gap-2 border-t border-white/70 pt-4 text-sm text-gray-500">
          <span className="font-medium text-gray-400">Depois:</span>
          <span className="truncate">
            {data.laterToday
              .map(a => `${formatInTimeZone(a.startsAt, TZ_BR, 'HH:mm')} ${firstNameOf(a.patient?.name)}`)
              .join('  ·  ')}
          </span>
        </div>
      )}
    </section>
  )
}

/** Small inline link-button used in card headers ("Ver agenda completa →"). */
export function CardLink({ to, children }: { to: string; children: ReactNode }) {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      className="inline-flex items-center gap-1 text-sm font-medium text-[#0b7b83] transition-colors hover:text-[#0ea5b0]"
    >
      {children} <ArrowRight size={14} />
    </button>
  )
}
