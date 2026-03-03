import { format, parseISO, differenceInHours } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CalendarBlank, Clock, XCircle } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useMyPatient } from '../hooks/usePatients'
import { usePatientAppointments } from '../hooks/useAppointments'
import { useUpdateAppointmentStatus } from '../hooks/useAppointmentsMutations'
import { useClinic } from '../hooks/useClinic'
import { APPOINTMENT_STATUS_LABELS, APPOINTMENT_STATUS_COLORS } from '../types'
import type { Appointment } from '../types'

export default function MyAppointmentsPage() {
  const { patient, loading: loadingPatient } = useMyPatient()
  const { appointments, loading: loadingAppts } = usePatientAppointments(patient?.id ?? '')
  const { data: clinic } = useClinic()
  const updateStatus = useUpdateAppointmentStatus()
  // Show spinner while finding the patient, or while loading their appointments once found
  const loading = loadingPatient || (!!patient && loadingAppts)
  const upcoming = appointments.filter(a => new Date(a.startsAt) >= new Date())
  const past    = appointments.filter(a => new Date(a.startsAt) < new Date())

  // cancellationHours: -1=never, 0=always, N=requires N hours notice
  const cancellationHours = clinic?.cancellationHours ?? 24

  function canCancel(startsAt: string): boolean {
    if (cancellationHours === -1) return false
    if (cancellationHours === 0) return true
    return differenceInHours(new Date(startsAt), new Date()) >= cancellationHours
  }

  function handleCancel(id: string, startsAt: string) {
    if (!canCancel(startsAt)) {
      toast.error('O prazo para cancelamento já encerrou.')
      return
    }
    if (!confirm('Tem certeza que deseja cancelar esta consulta?')) return
    updateStatus.mutate(
      { id, status: 'cancelled' },
      {
        onSuccess: () => toast.success('Consulta cancelada.'),
        onError:   () => toast.error('Erro ao cancelar. Tente novamente.'),
      }
    )
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <span className="text-gray-400 text-sm">Carregando consultas...</span>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <h1 className="text-lg font-semibold text-gray-800">Minhas Consultas</h1>

      {/* Upcoming */}
      <section>
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
          Próximas
        </h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center bg-white rounded-xl border border-gray-100">
            Nenhuma consulta agendada.
          </p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map(appt => (
              <AppointmentCard
                key={appt.id}
                appointment={appt}
                onCancel={
                  (appt.status === 'scheduled' || appt.status === 'confirmed')
                    ? () => handleCancel(appt.id, appt.startsAt)
                    : undefined
                }
                canCancel={canCancel(appt.startsAt)}
                cancellationHours={cancellationHours}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Past */}
      {past.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
            Histórico
          </h2>
          <ul className="space-y-2">
            {past.map(appt => (
              <AppointmentCard key={appt.id} appointment={appt} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function AppointmentCard({
  appointment: a,
  onCancel,
  canCancel,
  cancellationHours,
}: {
  appointment: Appointment
  onCancel?: () => void
  canCancel?: boolean
  cancellationHours?: number
}) {
  const statusClasses = APPOINTMENT_STATUS_COLORS[a.status] ?? 'bg-gray-100 text-gray-500'
  const statusLabel = APPOINTMENT_STATUS_LABELS[a.status] ?? a.status
  const dateLabel = format(parseISO(a.startsAt), "dd 'de' MMMM yyyy", { locale: ptBR })
  const timeLabel = format(parseISO(a.startsAt), 'HH:mm')
  const isCancellable = !!onCancel
  const showCancelDisabledHint = !!onCancel && !canCancel && (cancellationHours ?? 0) > 0

  return (
    <li className="bg-white border border-gray-100 rounded-xl p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800">
            {a.professional?.name ?? 'Profissional não informado'}
          </p>
          {a.professional?.specialty && (
            <p className="text-xs text-gray-400">{a.professional.specialty}</p>
          )}
          <div className="flex items-center gap-3 text-xs text-gray-500 pt-1">
            <span className="flex items-center gap-1">
              <CalendarBlank size={12} />
              {dateLabel}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={12} />
              {timeLabel}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusClasses}`}>
            {statusLabel}
          </span>
          {isCancellable && (
            <button
              onClick={onCancel}
              className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-600 transition"
            >
              <XCircle size={13} /> Cancelar
            </button>
          )}
          {showCancelDisabledHint && (
            <p className="text-[10px] text-gray-400 text-right max-w-[120px]">
              Cancelamento encerrado (até {cancellationHours}h antes)
            </p>
          )}
        </div>
      </div>
    </li>
  )
}
