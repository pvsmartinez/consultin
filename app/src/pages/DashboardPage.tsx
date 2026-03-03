import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Link } from 'react-router-dom'
import { CalendarBlank, Users, CurrencyCircleDollar, Clock, Stethoscope, ArrowRight } from '@phosphor-icons/react'
import { useAuthContext } from '../contexts/AuthContext'
import { useClinicKPIs, useProfessionalKPIs, useTodayAppointments } from '../hooks/useDashboard'
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
  patient: { name: string } | { name: string }[] | null
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

// ─── Clinic Dashboard ─────────────────────────────────────────────────────────

const STATUS_PRIORITY: Record<string, number> = { confirmed: 0, scheduled: 1, no_show: 2, completed: 3 }

function ClinicDashboard() {
  const { data, isLoading } = useClinicKPIs()
  const { data: todayList = [], isLoading: todayLoading } = useTodayAppointments()
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

      {/* KPI cards — clicáveis */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
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
        <Link to="/financeiro">
          <KpiCard
            label="Faturamento do mês"
            value={isLoading ? '...' : formatBRL(data?.monthRevenue ?? 0)}
            icon={<CurrencyCircleDollar size={20} className="text-purple-500" />}
            color="purple"
          />
        </Link>
      </div>

      {/* Agenda de hoje */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Agenda de hoje</h2>
          <Link to="/agenda" className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700">
            Ver calendário <ArrowRight size={12} />
          </Link>
        </div>

        {todayLoading ? (
          <p className="text-sm text-gray-400">Carregando...</p>
        ) : sorted.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 py-8 text-center">
            <p className="text-sm text-gray-400">Nenhuma consulta agendada para hoje.</p>
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
                    <p className="text-xs text-gray-400 truncate">{getProfName(appt.professional)}</p>
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
    </div>
  )
}

// ─── Professional Dashboard ───────────────────────────────────────────────────

function ProfessionalDashboard({ email, profileName, userId }: { email: string; profileName: string; userId: string }) {
  const { data, isLoading } = useProfessionalKPIs(email, userId)
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
            <p className="text-xs">
              Peça ao administrador da clínica para cadastrar seu e-mail
              ({email}) no seu registro de profissional.
            </p>
          </div>
        ) : (data?.upcoming ?? []).length === 0 ? (
          <p className="text-sm text-gray-400 bg-white rounded-xl border border-gray-100 p-4 text-center">
            Nenhuma consulta agendada por enquanto.
          </p>
        ) : (
          <ul className="space-y-2">
            {(data?.upcoming as unknown as UpcomingRow[]).map((appt) => {
              const statusClasses = APPOINTMENT_STATUS_COLORS[appt.status as keyof typeof APPOINTMENT_STATUS_COLORS] ?? 'bg-gray-100 text-gray-500'
              const statusLabel = APPOINTMENT_STATUS_LABELS[appt.status as keyof typeof APPOINTMENT_STATUS_LABELS] ?? appt.status
              const dateLabel = format(new Date(appt.starts_at), "dd/MM/yyyy")
              const timeLabel = format(new Date(appt.starts_at), 'HH:mm')
              return (
                <li key={appt.id} className="bg-white border border-gray-100 rounded-xl p-4 flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-gray-800">
                      {getPatientName(appt.patient)}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><CalendarBlank size={11} /> {dateLabel}</span>
                      <span className="flex items-center gap-1"><Clock size={11} /> {timeLabel}</span>
                    </div>
                  </div>
                  <span className={`shrink-0 text-xs font-medium px-2 py-1 rounded-full ${statusClasses}`}>
                    {statusLabel}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
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
