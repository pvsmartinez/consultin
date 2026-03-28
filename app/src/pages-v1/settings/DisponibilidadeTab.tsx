import { useState, useEffect } from 'react'
import { useProfessionals } from '../../hooks/useProfessionals'
import AvailabilityEditor from '../../components/availability/AvailabilityEditor'

export default function DisponibilidadeTab() {
  const { data: professionals = [], isLoading: loadingProfs } = useProfessionals()
  const [selectedProfId, setSelectedProfId] = useState('')

  useEffect(() => {
    if (professionals.length > 0 && !selectedProfId) {
      setSelectedProfId(professionals[0].id)
    }
  }, [professionals, selectedProfId])

  const activeProfId = selectedProfId || professionals[0]?.id || ''

  if (loadingProfs) {
    return <p className="text-sm text-gray-400 py-8 text-center">Carregando...</p>
  }

  if (!professionals.length) {
    return (
      <p className="text-sm text-gray-400 py-8 text-center">
        Cadastre profissionais antes de configurar a disponibilidade.
      </p>
    )
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-500">
        Configure os horários disponíveis de cada profissional para agendamento.
      </p>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Profissional</label>
        <select
          value={activeProfId}
          onChange={e => setSelectedProfId(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]"
        >
          {professionals.map(p => (
            <option key={p.id} value={p.id}>
              {p.name}{p.specialty ? ` — ${p.specialty}` : ''}
            </option>
          ))}
        </select>
      </div>

      <AvailabilityEditor
        professionalId={activeProfId}
      />
    </div>
  )
}
