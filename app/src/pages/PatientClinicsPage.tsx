import { Buildings, CalendarBlank, CheckCircle, MapPin } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import { useAuthContext } from '../contexts/AuthContext'
import { useMyPatientClinics } from '../hooks/usePatients'

export default function PatientClinicsPage() {
  const navigate = useNavigate()
  const { switchClinicContext } = useAuthContext()
  const { data: clinics = [], isLoading } = useMyPatientClinics()

  async function handleSelect(clinicId: string) {
    try {
      await switchClinicContext(clinicId)
      navigate('/minhas-consultas', { replace: true })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao trocar de clínica')
    }
  }

  if (isLoading) {
    return <p className="text-center text-gray-400 text-sm py-12">Carregando clínicas...</p>
  }

  if (clinics.length === 0) {
    return (
      <div className="text-center py-14 bg-white border border-gray-200 rounded-2xl">
        <p className="text-sm text-gray-500">Nenhuma clínica vinculada a esta conta.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#0ea5b0]">Minhas clínicas</p>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Escolha onde você quer continuar</h1>
        <p className="mt-2 text-sm text-gray-500">
          Sua conta é a mesma, mas cada clínica tem histórico, dados e atendimentos próprios.
        </p>
      </div>

      <div className="grid gap-4">
        {clinics.map((clinic) => (
          <button
            key={clinic.clinicId}
            type="button"
            onClick={() => handleSelect(clinic.clinicId)}
            className={`rounded-[28px] border bg-white p-5 text-left transition hover:border-gray-300 hover:shadow-sm ${clinic.isCurrent ? 'border-teal-200 bg-teal-50/30' : 'border-gray-200'}`}
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Buildings size={18} className="text-[#0ea5b0]" />
                  <span className="text-lg font-semibold text-gray-900">{clinic.clinicName}</span>
                  {clinic.isCurrent && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-medium text-teal-700">
                      <CheckCircle size={12} weight="fill" />
                      Atual
                    </span>
                  )}
                </div>

                {(clinic.city || clinic.state) && (
                  <p className="flex items-center gap-1.5 text-sm text-gray-500">
                    <MapPin size={14} />
                    {[clinic.city, clinic.state].filter(Boolean).join(' • ')}
                  </p>
                )}

                {clinic.nextAppointmentAt ? (
                  <p className="flex items-center gap-1.5 text-sm text-gray-600">
                    <CalendarBlank size={14} />
                    Próxima consulta em{' '}
                    {new Date(clinic.nextAppointmentAt).toLocaleString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'America/Sao_Paulo',
                    })}
                  </p>
                ) : (
                  <p className="text-sm text-gray-400">Nenhuma consulta futura agendada.</p>
                )}
              </div>

              <div className="text-sm font-medium text-[#006970]">
                {clinic.isCurrent ? 'Continuar nesta clínica' : 'Entrar nesta clínica'}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
