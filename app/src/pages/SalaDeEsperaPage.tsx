import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CheckCircle, Clock, UserCircle, UserMinus, Armchair, Phone, WhatsappLogo } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useTodayAppointments } from '../hooks/useDashboard'
import { useUpdateAppointmentStatus } from '../hooks/useAppointmentsMutations'
import { APPOINTMENT_STATUS_LABELS, APPOINTMENT_STATUS_COLORS } from '../types'
import type { AppointmentStatus } from '../types'

function patientName(p: unknown): string {
  if (!p) return 'Paciente'
  if (Array.isArray(p)) return (p[0] as { name: string })?.name ?? 'Paciente'
  return (p as { name: string }).name ?? 'Paciente'
}
function patientPhone(p: unknown): string | null {
  const raw = Array.isArray(p)
    ? (p[0] as { phone?: string | null })?.phone
    : (p as { phone?: string | null } | null)?.phone
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  return digits.startsWith('55') ? digits : `55${digits}`
}
function professionalName(p: unknown): string {
  if (!p) return '–'
  if (Array.isArray(p)) return (p[0] as { name: string })?.name ?? '–'
  return (p as { name: string }).name ?? '–'
}

export default function SalaDeEsperaPage() {
  const { data: all = [], isLoading } = useTodayAppointments()
  const updateStatus = useUpdateAppointmentStatus()

  // Show only scheduled + confirmed (i.e. not yet completed/cancelled/no_show)
  const waiting = all.filter(a => a.status === 'scheduled' || a.status === 'confirmed')
  // And show completed at the bottom (attended today)
  const done = all.filter(a => a.status === 'completed' || a.status === 'no_show')

  async function checkIn(id: string) {
    try {
      await updateStatus.mutateAsync({ id, status: 'confirmed' })
    } catch (e) {
      console.error('[checkIn] erro ao registrar chegada:', e)
      toast.error('Erro ao registrar chegada')
    }
  }
  async function markNoShow(id: string) {
    try {
      await updateStatus.mutateAsync({ id, status: 'no_show' })
    } catch {
      toast.error('Erro ao registrar falta')
    }
  }
  async function markComplete(id: string) {
    try {
      await updateStatus.mutateAsync({ id, status: 'completed' })
    } catch {
      toast.error('Erro ao concluir atendimento')
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Armchair size={22} className="text-[#0ea5b0]" />
          <h1 className="text-2xl font-semibold text-gray-900">Sala de espera</h1>
        </div>
        <p className="text-sm text-gray-500">
          {format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}&ensp;·&ensp;
          {waiting.length} {waiting.length === 1 ? 'paciente aguardando' : 'pacientes aguardando'}
        </p>
      </div>

      {/* Waiting list */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : waiting.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl py-12 text-center">
          <CheckCircle size={32} className="text-green-400 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Nenhum paciente aguardando no momento.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {waiting.map(appt => {
            const isScheduled = appt.status === 'scheduled'
            const isConfirmed = appt.status === 'confirmed'
            return (
              <li key={appt.id} className="bg-white border border-gray-200 rounded-xl px-5 py-4 shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-teal-50 flex items-center justify-center flex-shrink-0">
                    <UserCircle size={24} className="text-[#0ea5b0]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-gray-900 text-sm">{patientName(appt.patient)}</p>
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${APPOINTMENT_STATUS_COLORS[appt.status as AppointmentStatus] ?? 'bg-gray-100 text-gray-600'}`}>
                        {isScheduled ? 'Aguardando' : isConfirmed ? 'Chegou ✓' : APPOINTMENT_STATUS_LABELS[appt.status as AppointmentStatus]}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-0.5 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Clock size={12} />
                        {format(new Date(appt.starts_at), 'HH:mm')}
                      </span>
                      <span>{professionalName(appt.professional)}</span>
                      {patientPhone(appt.patient) && (
                        <>
                          <a
                            href={`tel:+${patientPhone(appt.patient)}`}
                            title="Ligar"
                            className="flex items-center gap-0.5 text-gray-400 hover:text-[#006970] transition-colors"
                            onClick={e => e.stopPropagation()}
                          >
                            <Phone size={13} />
                          </a>
                          <a
                            href={`https://wa.me/${patientPhone(appt.patient)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="WhatsApp"
                            className="flex items-center gap-0.5 text-gray-400 hover:text-green-600 transition-colors"
                            onClick={e => e.stopPropagation()}
                          >
                            <WhatsappLogo size={13} />
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isScheduled && (
                      <button
                        onClick={() => checkIn(appt.id)}
                        disabled={updateStatus.isPending}
                        className="flex items-center gap-1.5 text-xs font-medium bg-green-50 hover:bg-green-100 text-green-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <CheckCircle size={14} />
                        Check-in
                      </button>
                    )}
                    {isConfirmed && (
                      <button
                        onClick={() => markComplete(appt.id)}
                        disabled={updateStatus.isPending}
                        className="flex items-center gap-1.5 text-xs font-medium bg-teal-50 hover:bg-teal-100 text-[#006970] px-3 py-1.5 rounded-xl transition-colors disabled:opacity-50"
                      >
                        <CheckCircle size={14} />
                        Atendido
                      </button>
                    )}
                    <button
                      onClick={() => markNoShow(appt.id)}
                      disabled={updateStatus.isPending}
                      title="Marcar como não compareceu"
                      className="flex items-center gap-1.5 text-xs font-medium bg-gray-50 hover:bg-red-50 text-gray-400 hover:text-red-500 px-2 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <UserMinus size={14} />
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* Already attended today */}
      {done.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Encerrados hoje ({done.length})
          </h2>
          <ul className="space-y-2">
            {done.map(appt => (
              <li key={appt.id} className="bg-white border border-gray-100 rounded-xl px-5 py-3 opacity-70">
                <div className="flex items-center gap-3">
                  <UserCircle size={20} className="text-gray-300 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-500">{patientName(appt.patient)}</p>
                    <p className="text-xs text-gray-400">{format(new Date(appt.starts_at), 'HH:mm')} · {professionalName(appt.professional)}</p>
                  </div>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${APPOINTMENT_STATUS_COLORS[appt.status as AppointmentStatus] ?? 'bg-gray-100 text-gray-600'}`}>
                    {APPOINTMENT_STATUS_LABELS[appt.status as AppointmentStatus]}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
