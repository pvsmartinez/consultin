import { useState, useEffect } from 'react'
import { useMyProfessionalRecords } from '../hooks/useAppointmentsMutations'
import AvailabilityEditor from '../components/availability/AvailabilityEditor'

export default function MinhaDisponibilidadePage() {
  const { data: myRecords = [], isLoading: loadingRecords } = useMyProfessionalRecords()

  // When multi-clinic, let the professional pick which clinic to configure
  const [selectedProfId, setSelectedProfId] = useState<string>('')

  useEffect(() => {
    if (myRecords.length > 0 && !selectedProfId) {
      setSelectedProfId(myRecords[0].id)
    }
  }, [myRecords, selectedProfId])

  const activeProfId = selectedProfId || myRecords[0]?.id || ''
  const activeClinicId = myRecords.find(r => r.id === activeProfId)?.clinicId

  if (loadingRecords) return <p className="text-sm text-gray-400 py-12 text-center">Carregando...</p>

  if (myRecords.length === 0) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-3">
        <p className="text-sm text-gray-500">
          Seu perfil de profissional ainda não está vinculado ao sistema.
        </p>
        <p className="text-xs text-gray-400">
          Peça ao administrador da clínica para cadastrar seu e-mail no seu registro de profissional.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-lg font-semibold text-gray-800">Minha disponibilidade</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Configure os dias e horários em que você está disponível para atendimento.
        </p>
      </div>

      {/* Clinic picker — only shown when the professional works at multiple clinics */}
      {myRecords.length > 1 && (
        <div>
          <label className="block text-xs text-gray-500 mb-1">Clínica</label>
          <div className="flex flex-wrap gap-2">
            {myRecords.map((r, i) => (
              <button
                key={r.id}
                onClick={() => setSelectedProfId(r.id)}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  r.id === activeProfId
                    ? 'bg-[#0ea5b0] text-white border-transparent'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full inline-block mr-1.5" style={{
                  background: ['#6366f1','#0ea5e9','#f59e0b','#10b981','#ec4899','#8b5cf6'][i % 6],
                }} />
                {r.clinicName ?? `Clínica ${i + 1}`}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Configurando disponibilidade para a clínica selecionada.
          </p>
        </div>
      )}

      <AvailabilityEditor
        professionalId={activeProfId}
        clinicId={activeClinicId}
      />
    </div>
  )
}
