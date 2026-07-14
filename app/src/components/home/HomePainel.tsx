import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle, CurrencyDollar, Warning } from '@phosphor-icons/react'
import { formatBRL } from '../../utils/currency'
import { APP_ROUTES } from '../../lib/appRoutes'
import type { DayTimelineAppt, HomeData } from '../../hooks/useHomeData'
import { CardEyebrow, CardLink, HomeCard } from './HomeShared'

const STATUS_BLOCK: Record<DayTimelineAppt['status'], string> = {
  scheduled: 'bg-amber-300',
  confirmed: 'bg-[#0ea5b0]',
  completed: 'bg-[#006970]',
  cancelled: 'bg-gray-200',
  no_show: 'bg-rose-300',
}

/** Compact single-line occupancy bar for today. */
function DayTimeline({ data }: { data: HomeData }) {
  const { workStartMin, workEndMin, nowMinutes, timelineAppointments } = data
  const hasWindow = workStartMin !== null && workEndMin !== null && workEndMin > workStartMin
  const span = hasWindow ? workEndMin! - workStartMin! : 0
  const pct = (min: number) => ((min - workStartMin!) / span) * 100
  const nowInRange = hasWindow && nowMinutes >= workStartMin! && nowMinutes <= workEndMin!

  return (
    <HomeCard>
      <div className="flex items-center justify-between">
        <div>
          <CardEyebrow>Linha do dia</CardEyebrow>
          <h2 className="mt-2 text-xl font-semibold text-gray-900">Ocupação de hoje</h2>
        </div>
        <CardLink to={APP_ROUTES.staff.agenda}>Ver agenda completa</CardLink>
      </div>

      {hasWindow ? (
        <>
          <div className="relative mt-6 h-10 overflow-hidden rounded-xl bg-[#f2f7f7]">
            {timelineAppointments.map(a => {
              const left = Math.max(0, pct(a.startMin))
              const width = Math.max(1.5, pct(Math.min(a.endMin, workEndMin!)) - left)
              return (
                <div
                  key={a.id}
                  title={`${a.patientName}`}
                  className={`absolute top-1.5 bottom-1.5 rounded-md ${STATUS_BLOCK[a.status]}`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                />
              )
            })}
            {nowInRange && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-rose-500"
                style={{ left: `${pct(nowMinutes)}%` }}
              >
                <span className="absolute -top-0 left-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-rose-500" />
              </div>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
            <span>{String(Math.floor(workStartMin! / 60)).padStart(2, '0')}h</span>
            <span>{String(Math.floor(workEndMin! / 60)).padStart(2, '0')}h</span>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
            <span className="font-semibold text-gray-900">{data.bookedToday} consultas</span>
            <span>{data.freeSlotsToday} horários livres</span>
            {data.occupancyPct !== null && <span>{data.occupancyPct}% ocupação</span>}
          </div>
        </>
      ) : (
        <p className="mt-6 text-sm text-gray-500">
          Sem horário de funcionamento configurado para hoje. A agenda continua acessível.
        </p>
      )}
    </HomeCard>
  )
}

interface AttentionRow {
  key: string
  tone: 'amber' | 'rose' | 'gray'
  icon: typeof Warning
  label: string
  to: string
  cta: string
}

/** Actionable pending signals — renders only the rows that actually apply. */
function AttentionList({ data, hasFinancial }: { data: HomeData; hasFinancial: boolean }) {
  const navigate = useNavigate()
  const rows: AttentionRow[] = []

  if (data.toConfirmCount > 0) {
    rows.push({
      key: 'confirm',
      tone: 'amber',
      icon: Warning,
      label: `${data.toConfirmCount} ${data.toConfirmCount === 1 ? 'consulta a confirmar' : 'consultas a confirmar'}`,
      to: APP_ROUTES.staff.agenda,
      cta: 'Ver na agenda',
    })
  }
  if (hasFinancial && data.pendingPaymentCount > 0) {
    rows.push({
      key: 'payment',
      tone: 'rose',
      icon: CurrencyDollar,
      label: `${data.pendingPaymentCount} ${data.pendingPaymentCount === 1 ? 'pagamento pendente' : 'pagamentos pendentes'} · ${formatBRL(data.pendingPaymentCents)}`,
      to: APP_ROUTES.staff.financial,
      cta: 'Ver financeiro',
    })
  }

  const toneStyles: Record<AttentionRow['tone'], { wrap: string; icon: string }> = {
    amber: { wrap: 'border-amber-100 bg-amber-50/60', icon: 'bg-amber-100 text-amber-600' },
    rose: { wrap: 'border-rose-100 bg-rose-50/60', icon: 'bg-rose-100 text-rose-600' },
    gray: { wrap: 'border-gray-100 bg-gray-50', icon: 'bg-gray-100 text-gray-500' },
  }

  return (
    <HomeCard>
      <CardEyebrow>Precisa de atenção</CardEyebrow>
      {rows.length === 0 ? (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
            <CheckCircle size={18} weight="fill" />
          </div>
          <p className="text-sm font-medium text-gray-700">Tudo em dia por aqui ✨</p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {rows.map(row => {
            const s = toneStyles[row.tone]
            const Icon = row.icon
            return (
              <div
                key={row.key}
                className={`flex items-center gap-3 rounded-2xl border p-3.5 ${s.wrap}`}
              >
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${s.icon}`}>
                  <Icon size={18} weight="duotone" />
                </div>
                <p className="min-w-0 flex-1 text-sm font-medium text-gray-800">{row.label}</p>
                <button
                  type="button"
                  onClick={() => navigate(row.to)}
                  className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-[#0ea5b0]/40 hover:text-[#0ea5b0]"
                >
                  {row.cta}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </HomeCard>
  )
}

function PulseTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-[#fbfcfc] p-4">
      <p className="text-xs font-medium text-gray-400">{label}</p>
      <p className="mt-1 text-lg font-bold tracking-tight text-gray-900">{value}</p>
    </div>
  )
}

/** Week sparkline (bars) — quiet, non-axis, just a shape of the week. */
function WeekSparkline({ data }: { data: HomeData }) {
  const max = Math.max(1, ...data.weekCounts.map(d => d.count))
  return (
    <div className="mt-4">
      <p className="mb-2 text-xs font-medium text-gray-400">Semana</p>
      <div className="flex h-16 items-end gap-1.5">
        {data.weekCounts.map(d => (
          <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex w-full flex-1 items-end">
              <div
                className={`w-full rounded-t-md ${d.isToday ? 'bg-[#0ea5b0]' : 'bg-[#cfeae9]'}`}
                style={{ height: `${Math.max(6, (d.count / max) * 100)}%` }}
              />
            </div>
            <span className={`text-[10px] ${d.isToday ? 'font-semibold text-[#0b7b83]' : 'text-gray-400'}`}>
              {d.weekdayLabel}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PulseCard({ data, showRevenue }: { data: HomeData; showRevenue: boolean }) {
  return (
    <HomeCard>
      <CardEyebrow>Pulso de hoje</CardEyebrow>
      <div className={`mt-4 grid gap-3 ${showRevenue ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {showRevenue && (
          <PulseTile label="Faturamento esperado" value={formatBRL(data.expectedRevenueCents)} />
        )}
        <PulseTile
          label="Ocupação"
          value={data.occupancyPct !== null ? `${data.occupancyPct}%` : '—'}
        />
        <PulseTile label="Realizadas" value={`${data.completedToday}/${data.bookedToday}`} />
      </div>
      <WeekSparkline data={data} />
    </HomeCard>
  )
}

/**
 * Admin / reception operational cockpit: next patient, day occupancy,
 * attention queue and today's pulse.
 */
export default function HomePainel({
  data,
  canViewFinancial,
  hasFinancial,
  heroSlot,
}: {
  data: HomeData
  canViewFinancial: boolean
  hasFinancial: boolean
  /** the NextAppointmentCard, rendered by the page so it owns the modal wiring */
  heroSlot: ReactNode
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.85fr)]">
      <div className="space-y-4">
        {heroSlot}
        <DayTimeline data={data} />
      </div>
      <div className="space-y-4">
        <AttentionList data={data} hasFinancial={hasFinancial} />
        <PulseCard data={data} showRevenue={hasFinancial && canViewFinancial} />
      </div>
    </div>
  )
}
