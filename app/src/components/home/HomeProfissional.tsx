import type { ReactNode } from 'react'
import { formatInTimeZone } from 'date-fns-tz'
import { APPOINTMENT_STATUS_LABELS, type AppointmentStatus } from '../../types'
import { TZ_BR } from '../../utils/date'
import { APP_ROUTES } from '../../lib/appRoutes'
import type { HomeData } from '../../hooks/useHomeData'
import { CardEyebrow, CardLink, HomeCard } from './HomeShared'

const STATUS_DOT: Record<AppointmentStatus, string> = {
  scheduled: 'bg-amber-400',
  confirmed: 'bg-[#0ea5b0]',
  completed: 'bg-[#006970]',
  cancelled: 'bg-gray-300',
  no_show: 'bg-rose-400',
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-[#fbfcfc] p-4">
      <p className="text-xs font-medium text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-gray-900">{value}</p>
    </div>
  )
}

/** Professional's personal view: their next patient and their day — no clinic-wide data. */
export default function HomeProfissional({
  data,
  heroSlot,
}: {
  data: HomeData
  heroSlot: ReactNode
}) {
  const weekTotal = data.weekCounts.reduce((s, d) => s + d.count, 0)
  const rows = data.todayAppointments.filter(a => a.status !== 'cancelled')

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.7fr)]">
      <div className="space-y-4">
        {heroSlot}

        <HomeCard>
          <div className="flex items-center justify-between">
            <div>
              <CardEyebrow>Sua agenda de hoje</CardEyebrow>
              <h2 className="mt-2 text-xl font-semibold text-gray-900">
                {rows.length > 0 ? `${rows.length} pacientes` : 'Nada marcado'}
              </h2>
            </div>
            <CardLink to={APP_ROUTES.staff.myAgenda}>Ver agenda</CardLink>
          </div>

          {rows.length === 0 ? (
            <p className="mt-5 text-sm text-gray-500">Nenhuma consulta na sua agenda hoje.</p>
          ) : (
            <div className="mt-5 divide-y divide-gray-100">
              {rows.map(a => (
                <div key={a.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="w-12 shrink-0 text-sm font-semibold tabular-nums text-gray-900">
                    {formatInTimeZone(a.startsAt, TZ_BR, 'HH:mm')}
                  </span>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[a.status]}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-800">
                      {a.patient?.name ?? 'Paciente'}
                    </p>
                    {a.clinicRoom?.name && (
                      <p className="truncate text-xs text-gray-400">{a.clinicRoom.name}</p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full bg-gray-50 px-2.5 py-1 text-[11px] font-medium text-gray-500">
                    {APPOINTMENT_STATUS_LABELS[a.status]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </HomeCard>
      </div>

      <div>
        <HomeCard>
          <CardEyebrow>Resumo</CardEyebrow>
          <div className="mt-4 space-y-3">
            <StatChip label="Hoje" value={`${rows.length} pacientes`} />
            <StatChip label="Nesta semana" value={`${weekTotal} pacientes`} />
            <StatChip label="Realizadas hoje" value={`${data.completedToday}`} />
          </div>
        </HomeCard>
      </div>
    </div>
  )
}
