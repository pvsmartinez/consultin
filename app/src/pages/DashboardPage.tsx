import { format, startOfMonth, endOfMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Link } from 'react-router-dom'
import { CalendarBlank, Users, CurrencyCircleDollar, Clock, Stethoscope, ArrowRight, Copy, Warning, CheckCircle, CurrencyDollar, Plus, MagnifyingGlass, Phone, WhatsappLogo, Check } from '@phosphor-icons/react'
import { useAuthContext } from '../contexts/AuthContext'
import { useClinic } from '../hooks/useClinic'
import type { Clinic } from '../types'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../services/supabase'
import { QK } from '../lib/queryKeys'
import { useClinicKPIs, useProfessionalKPIs, useTodayAppointments, useProfessionalsToday, useClinicAlerts } from '../hooks/useDashboard'
import type { TodayAppointment } from '../hooks/useDashboard'
import { APPOINTMENT_STATUS_LABELS, APPOINTMENT_STATUS_COLORS } from '../types'
import { useUpdateAppointmentStatus } from '../hooks/useAppointmentsMutations'
import type { AppointmentStatus } from '../types'
import { formatBRL } from '../utils/currency'
import { toast } from 'sonner'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface UpcomingRow {
  id: string
  starts_at: string
  status: string
  patient_id: string | null
  patient: { id?: string; name: string } | { id?: string; name: string }[] | null
}

function getPatientName(patient: UpcomingRow['patient'] | TodayAppointment['patient']): string {
  if (!patient) return 'Paciente não informado'
  if (Array.isArray(patient)) return patient[0]?.name ?? 'Paciente não informado'
  return patient.name
}

function getProfName(prof: TodayAppointment['professional']): string {
  if (!prof) return '—'
  if (Array.isArray(prof)) return prof[0]?.name ?? '—'
  return prof.name
}

function getPatientPhone(patient: TodayAppointment['patient']): string | null {
  const raw = Array.isArray(patient) ? patient[0]?.phone : patient?.phone
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  return digits.startsWith('55') ? digits : `55${digits}`
}

// ─── Onboarding Checklist ─────────────────────────────────────────────────────

function OnboardingChecklist({
  clinic,
  totalPatients,
  onDismiss,
}: {
  clinic: Clinic
  totalPatients: number
  onDismiss: () => void
}) {
  const steps = [
    {
      label: 'Configure os dados da clínica',
      hint: 'Adicione telefone, endereço e horários de funcionamento',
      done: !!clinic.phone,
      to: '/configuracoes',
      optional: false,
    },
    {
      label: 'Agende a primeira consulta',
      hint: 'Cadastre um paciente e marque uma consulta na agenda',
      done: totalPatients > 0,
      to: '/agenda',
      optional: false,
    },
    {
      label: 'Conecte o WhatsApp',
      hint: 'Envie lembretes automáticos e gerencie mensagens',
      done: clinic.whatsappEnabled,
      to: '/configuracoes',
      optional: true,
    },
  ]

  const required     = steps.filter(s => !s.optional)
  const requiredDone = required.filter(s => s.done).length
  const allDone      = requiredDone === required.length

  return (
    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 mb-8">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">Primeiros passos</h2>
          <p className="text-xs text-gray-400 mt-0.5">{requiredDone} de {required.length} etapas concluídas</p>
        </div>
        <button
          onClick={onDismiss}
          className={`flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
            allDone
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          {allDone ? 'Concluir ✓' : 'Pular'}
        </button>
      </div>

      <div className="space-y-2">
        {steps.map((step, i) => (
          <Link
            key={i}
            to={step.to}
            className={`flex items-center gap-3 bg-white rounded-xl px-4 py-3 border transition-colors ${
              step.done ? 'border-gray-100 opacity-60' : 'border-gray-200 hover:border-blue-300'
            }`}
          >
            <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
              step.done ? 'bg-green-500' : 'border-2 border-gray-200'
            }`}>
              {step.done
                ? <Check size={13} weight="bold" className="text-white" />
                : <span className="text-[10px] text-gray-400 font-semibold">{i + 1}</span>
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${
                step.done ? 'text-gray-400 line-through' : 'text-gray-800'
              }`}>
                {step.label}
              </p>
              {!step.done && <p className="text-xs text-gray-400 mt-0.5">{step.hint}</p>}
            </div>
            {step.optional && !step.done && (
              <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full flex-shrink-0">Opcional</span>
            )}
            {!step.done && <ArrowRight size={14} className="text-gray-300 flex-shrink-0" />}
          </Link>
        ))}
      </div>
    </div>
  )
}

// ─── Clinic Dashboard ─────────────────────────────────────────────────────────

const STATUS_PRIORITY: Record<string, number> = { confirmed: 0, scheduled: 1, no_show: 2, completed: 3 }

function ClinicDashboard() {
  const { role } = useAuthContext()
  const isAdmin = role === 'admin'
  const { data: clinic, update: updateClinic } = useClinic()
  const { data, isLoading } = useClinicKPIs()
  const { data: todayList = [], isLoading: todayLoading } = useTodayAppointments()
  const { data: profsToday = [] } = useProfessionalsToday()
  const { data: alerts = [] } = useClinicAlerts()
  const updateStatus = useUpdateAppointmentStatus()
  const todayLabel = format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })

  const sorted = [...todayList].sort((a, b) =>
    (STATUS_PRIORITY[a.status] ?? 9) - (STATUS_PRIORITY[b.status] ?? 9)
  )

  async function markStatus(id: string, status: AppointmentStatus) {
    try {
      await updateStatus.mutateAsync({ id, status })
      toast.success(
        status === 'confirmed' ? 'Chegada confirmada' :
        status === 'completed' ? 'Marcado como realizado' :
        'Marcado como falta'
      )
    } catch {
      toast.error('Erro ao atualizar status')
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-800">Dashboard</h1>
        <p className="text-sm text-gray-400 capitalize mt-0.5">{todayLabel}</p>
      </div>

      {/* Alerts — shown when there are action items */}
      {alerts.length > 0 && (
        <div className="mb-6 space-y-2">
          {alerts.map(alert => {
            const isRed = alert.type === 'overdue_payment'
            const Icon  = alert.type === 'overdue_payment' ? CurrencyDollar : alert.type === 'no_show' ? Warning : CheckCircle
            return (
              <Link key={alert.type} to={alert.link}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm transition-colors ${
                  isRed
                    ? 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
                    : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
                }`}
              >
                <Icon size={16} className="flex-shrink-0" />
                <span className="flex-1">{alert.label}</span>
                <ArrowRight size={14} />
              </Link>
            )
          })}
        </div>
      )}

      {/* Onboarding — mostrado até ser dispensado pelo admin */}
      {clinic && !clinic.onboardingCompleted && (
        <OnboardingChecklist
          clinic={clinic}
          totalPatients={data?.totalPatients ?? 0}
          onDismiss={() => updateClinic.mutate({ onboardingCompleted: true })}
        />
      )}

      {/* KPI cards */}
      <div className={`grid grid-cols-1 gap-4 mb-8 ${isAdmin ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        <Link to="/agenda">
          <KpiCard
            label="Consultas hoje"
            value={isLoading ? '...' : String(data?.todayCount ?? 0)}
            icon={<CalendarBlank size={20} className="text-blue-500" />}
            color="blue"
          />
        </Link>
        <Link to="/pacientes">
          <KpiCard
            label="Pacientes cadastrados"
            value={isLoading ? '...' : String(data?.totalPatients ?? 0)}
            icon={<Users size={20} className="text-green-500" />}
            color="green"
          />
        </Link>
        {isAdmin && (
          <Link to="/financeiro">
            <KpiCard
              label="Faturamento do mês"
              value={isLoading ? '...' : formatBRL(data?.monthRevenue ?? 0)}
              icon={<CurrencyCircleDollar size={20} className="text-purple-500" />}
              color="purple"
            />
          </Link>
        )}
      </div>

      {/* Quick actions — most common receptionist tasks */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Link
          to="/agenda"
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
        >
          <Plus size={15} weight="bold" />
          Nova consulta
        </Link>
        <Link
          to="/pacientes"
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-gray-200 hover:border-blue-300 text-gray-700 hover:text-blue-700 text-sm font-medium transition-colors"
        >
          <MagnifyingGlass size={15} />
          Buscar paciente
        </Link>
      </div>

      {/* Agenda de hoje + Profissionais hoje */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agenda de hoje — 2/3 width */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Agenda de hoje</h2>
            <Link to="/agenda" className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700">
              Ver calendário <ArrowRight size={12} />
            </Link>
          </div>

        {todayLoading ? (
          <p className="text-sm text-gray-400">Carregando...</p>
        ) : sorted.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 py-10 text-center space-y-3">
            <p className="text-sm text-gray-400">Nenhuma consulta agendada para hoje.</p>
            <Link
              to="/agenda"
              className="inline-flex items-center gap-2 text-sm text-blue-600 border border-blue-200 hover:bg-blue-50 px-4 py-2 rounded-lg transition-colors"
            >
              <Plus size={14} weight="bold" /> Agendar consulta
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map(appt => {
              const statusClasses = APPOINTMENT_STATUS_COLORS[appt.status as keyof typeof APPOINTMENT_STATUS_COLORS] ?? 'bg-gray-100 text-gray-500'
              const statusLabel = APPOINTMENT_STATUS_LABELS[appt.status as keyof typeof APPOINTMENT_STATUS_LABELS] ?? appt.status
              const timeLabel = format(new Date(appt.starts_at), 'HH:mm')
              const isPending = appt.status === 'scheduled' || appt.status === 'confirmed'
              return (
                <div key={appt.id} className="bg-white border border-gray-100 rounded-xl px-4 py-3 flex items-center gap-4">
                  <div className="flex items-center gap-1.5 text-sm font-mono text-gray-500 w-12 flex-shrink-0">
                    <Clock size={13} />
                    {timeLabel}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{getPatientName(appt.patient)}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-gray-400 truncate">{getProfName(appt.professional)}</p>
                      {getPatientPhone(appt.patient) && (
                        <>
                          <a href={`tel:+${getPatientPhone(appt.patient)}`} title="Ligar"
                            className="text-gray-300 hover:text-blue-500 transition-colors flex-shrink-0" onClick={e => e.stopPropagation()}>
                            <Phone size={12} />
                          </a>
                          <a href={`https://wa.me/${getPatientPhone(appt.patient)}`} target="_blank" rel="noopener noreferrer" title="WhatsApp"
                            className="text-gray-300 hover:text-green-500 transition-colors flex-shrink-0" onClick={e => e.stopPropagation()}>
                            <WhatsappLogo size={12} />
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                  <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${statusClasses}`}>
                    {statusLabel}
                  </span>
                  {isPending && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {appt.status === 'scheduled' && (
                        <button
                          onClick={() => markStatus(appt.id, 'confirmed')}
                          className="text-xs text-teal-600 border border-teal-200 rounded-lg px-2 py-0.5 hover:bg-teal-50 transition-colors whitespace-nowrap"
                        >
                          Chegou
                        </button>
                      )}
                      <button
                        onClick={() => markStatus(appt.id, 'completed')}
                        className="text-xs text-blue-600 border border-blue-200 rounded-lg px-2 py-0.5 hover:bg-blue-50 transition-colors whitespace-nowrap"
                      >
                        Realizado
                      </button>
                      <button
                        onClick={() => markStatus(appt.id, 'no_show')}
                        className="text-xs text-gray-500 border border-gray-200 rounded-lg px-2 py-0.5 hover:bg-gray-50 transition-colors whitespace-nowrap"
                      >
                        Falta
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

        {/* Profissionais hoje \u2014 1/3 width */}
        <div className="lg:col-span-1">
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">Profissionais hoje</h2>
          {profsToday.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 py-6 text-center">
              <p className="text-sm text-gray-400">Nenhum profissional com consultas hoje.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {profsToday.map(p => (
                <li key={p.id} className="bg-white border border-gray-100 rounded-xl px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                      {p.specialty && <p className="text-xs text-gray-400 truncate">{p.specialty}</p>}
                    </div>
                    <span className="flex-shrink-0 text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                      {p.appointmentCount} {p.appointmentCount === 1 ? 'consulta' : 'consultas'}
                    </span>
                  </div>
                  {p.nextAt && (
                    <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                      <Clock size={10} /> pr\u00f3xima \u00e0s {format(new Date(p.nextAt), 'HH:mm')}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Professional Dashboard ───────────────────────────────────────────────────

function ProfessionalDashboard({ email, profileName, userId }: { email: string; profileName: string; userId: string }) {
  const { data, isLoading } = useProfessionalKPIs(email, userId)
  const { data: clinic } = useClinic()
  const today = format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })
  const displayName = data?.profName ?? profileName

  return (
    <div>
      {/* Greeting */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-800">
          {greeting()}, {displayName.split(' ')[0]}
        </h1>
        <p className="text-sm text-gray-400 capitalize mt-0.5">{today}</p>
        {data?.specialty && (
          <p className="text-xs text-blue-500 mt-1 font-medium">{data.specialty}</p>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <KpiCard
          label="Suas consultas hoje"
          value={isLoading ? '...' : String(data?.todayCount ?? 0)}
          icon={<CalendarBlank size={20} className="text-blue-500" />}
          color="blue"
        />
        <KpiCard
          label="Seus pacientes"
          value={isLoading ? '...' : String(data?.patientsCount ?? 0)}
          icon={<Users size={20} className="text-green-500" />}
          color="green"
        />
      </div>

      {/* Upcoming */}
      <div>
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
          Próximas consultas
        </h2>
        {isLoading ? (
          <p className="text-sm text-gray-400">Carregando...</p>
        ) : !data?.profId ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
            <div className="flex items-center gap-2 mb-1">
              <Stethoscope size={16} />
              <span className="font-medium">Perfil não vinculado</span>
            </div>
            <p className="text-xs mb-3">
              Peça ao administrador da clínica para cadastrar seu e-mail
              ({email}) no seu registro de profissional.
            </p>
            <button
              onClick={() => { navigator.clipboard.writeText(email ?? ''); toast.success('E-mail copiado!') }}
              className="flex items-center gap-1.5 text-xs font-medium text-amber-700 border border-amber-300 rounded-lg px-2.5 py-1 hover:bg-amber-100 transition-colors"
            >
              <Copy size={13} /> Copiar meu e-mail
            </button>
          </div>
        ) : (data?.upcoming ?? []).length === 0 ? (
          <p className="text-sm text-gray-400 bg-white rounded-xl border border-gray-100 p-4 text-center">
            Nenhuma consulta agendada por enquanto.
          </p>
        ) : (
          <ul className="space-y-2">
            {(data?.upcoming as unknown as UpcomingRow[]).map((appt, idx) => {
              const isNext = idx === 0
              const statusClasses = APPOINTMENT_STATUS_COLORS[appt.status as keyof typeof APPOINTMENT_STATUS_COLORS] ?? 'bg-gray-100 text-gray-500'
              const statusLabel = APPOINTMENT_STATUS_LABELS[appt.status as keyof typeof APPOINTMENT_STATUS_LABELS] ?? appt.status
              const isToday = format(new Date(appt.starts_at), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
              const dateLabel = isToday ? 'Hoje' : format(new Date(appt.starts_at), "dd/MM/yyyy")
              const timeLabel = format(new Date(appt.starts_at), 'HH:mm')
              const patientId = appt.patient_id
              return (
                <li key={appt.id} className={`rounded-xl p-4 flex items-start justify-between gap-4 ${
                  isNext
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                    : 'bg-white border border-gray-100'
                }`}>
                  <div className="space-y-0.5 flex-1 min-w-0">
                    {isNext && (
                      <p className={`text-[10px] font-semibold uppercase tracking-wide mb-1 ${
                        isNext ? 'text-blue-200' : 'text-gray-400'
                      }`}>Próxima</p>
                    )}
                    <p className={`text-sm font-semibold ${isNext ? 'text-white' : 'text-gray-800'}`}>
                      {getPatientName(appt.patient)}
                    </p>
                    <div className={`flex items-center gap-3 text-xs ${isNext ? 'text-blue-100' : 'text-gray-500'}`}>
                      <span className="flex items-center gap-1"><CalendarBlank size={11} /> {dateLabel}</span>
                      <span className="flex items-center gap-1"><Clock size={11} /> {timeLabel}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    {isNext ? (
                      patientId ? (
                        <Link
                          to={`/pacientes/${patientId}`}
                          className="flex items-center gap-1.5 text-xs font-semibold bg-white text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                        >
                          <Stethoscope size={13} /> Iniciar consulta
                        </Link>
                      ) : null
                    ) : (
                      <span className={`text-[11px] font-medium px-2 py-1 rounded-full ${statusClasses}`}>
                        {statusLabel}
                      </span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Earnings — only when profId is known and clinic has payments module */}
      {data?.profId && clinic?.paymentsEnabled && (
        <ProfessionalEarnings profId={data.profId} />
      )}
    </div>
  )
}

// ─── Professional earnings section ───────────────────────────────────────────

function ProfessionalEarnings({ profId }: { profId: string }) {
  const now = new Date()
  const { data: rows = [] } = useQuery({
    queryKey: QK.financial.profEarnings(profId, format(now, 'yyyy-MM')),
    enabled: !!profId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('appointments')
        .select('professional_fee_cents, paid_amount_cents, status')
        .eq('professional_id', profId)
        .eq('status', 'completed')
        .gte('starts_at', startOfMonth(now).toISOString())
        .lte('starts_at', endOfMonth(now).toISOString())
      return data ?? []
    },
  })

  const totalFee    = rows.reduce((s, r) => s + (r.professional_fee_cents ?? 0), 0)
  const totalPaid   = rows.reduce((s, r) => s + (r.paid_amount_cents   ?? 0), 0)
  const pendingPay  = Math.max(0, totalFee - totalPaid)

  return (
    <div className="mt-6">
      <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">Meus honorários — {format(now, 'MMMM yyyy', { locale: ptBR })}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-1">Consultas realizadas</p>
          <p className="text-lg font-semibold text-gray-800">{rows.length}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-1">Total a receber</p>
          <p className="text-lg font-semibold text-gray-800">{formatBRL(totalFee)}</p>
        </div>
        <div className={`rounded-xl p-4 border ${pendingPay > 0 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-100'}`}>
          <p className="text-xs text-gray-400 mb-1">Pendente de repasse</p>
          <p className={`text-lg font-semibold ${pendingPay > 0 ? 'text-amber-700' : 'text-green-700'}`}>
            {formatBRL(pendingPay)}
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { role, profile, session } = useAuthContext()

  if (role === 'professional') {
    return (
      <ProfessionalDashboard
        email={session?.user.email ?? ''}
        profileName={profile?.name ?? ''}
        userId={session?.user.id ?? ''}
      />
    )
  }

  return <ClinicDashboard />
}

// ─── KpiCard ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, icon, color,
}: {
  label: string; value: string; icon: React.ReactNode; color: 'blue' | 'green' | 'purple'
}) {
  const bg = { blue: 'bg-blue-50', green: 'bg-green-50', purple: 'bg-purple-50' }[color]
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-start gap-4 hover:shadow-sm hover:border-gray-300 transition-all cursor-pointer">
      <div className={`${bg} rounded-lg p-2.5 flex-shrink-0`}>{icon}</div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-2xl font-semibold text-gray-800 mt-0.5">{value}</p>
      </div>
    </div>
  )
}
