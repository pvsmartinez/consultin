import { useState } from 'react'
import { toast } from 'sonner'
import { useClinic } from '../../hooks/useClinic'
import type { Clinic, WorkingHours } from '../../types'

const WEEKDAYS = [
  { key: 'mon', label: 'Segunda' },
  { key: 'tue', label: 'Terça' },
  { key: 'wed', label: 'Quarta' },
  { key: 'thu', label: 'Quinta' },
  { key: 'fri', label: 'Sexta' },
  { key: 'sat', label: 'Sábado' },
  { key: 'sun', label: 'Domingo' },
] as const

const SLOT_DURATIONS = [15, 20, 30, 45, 60]

export default function AgendaTab({ clinic }: { clinic: Clinic }) {
  const { update } = useClinic()
  const [slotDuration,         setSlotDuration]         = useState(clinic.slotDurationMinutes)
  const [allowProfSelection,   setAllowProfSelection]   = useState(clinic.allowProfessionalSelection ?? true)
  const [hours, setHours] = useState<Partial<Record<string, WorkingHours>>>(clinic.workingHours ?? {})
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      await update.mutateAsync({
        slotDurationMinutes:        slotDuration,
        workingHours:               hours as Record<string, WorkingHours>,
        allowProfessionalSelection: allowProfSelection,
      })
      toast.success('Configurações de agenda salvas')
    } catch {
      toast.error('Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  function toggleDay(key: string) {
    setHours(prev => {
      const next = { ...prev }
      if (next[key]) delete next[key]
      else next[key] = { start: '08:00', end: '18:00' }
      return next
    })
  }

  function updateHour(key: string, field: 'start' | 'end', value: string) {
    setHours(prev => ({ ...prev, [key]: { ...prev[key]!, [field]: value } }))
  }

  return (
    <div className="space-y-6">
      {/* Booking options */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Opções de agendamento online</label>
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700">Paciente escolhe o profissional</p>
            <p className="text-xs text-gray-400 mt-0.5">Quando desativado, o profissional é alocado automaticamente pela disponibilidade</p>
          </div>
          <button
            type="button"
            onClick={() => setAllowProfSelection(v => !v)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              allowProfSelection ? 'bg-[#0ea5b0]' : 'bg-gray-200'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              allowProfSelection ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>
      </div>

      {/* Slot duration */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Duração padrão da consulta</label>
        <div className="flex gap-2">
          {SLOT_DURATIONS.map(d => (
            <button key={d} type="button"
              onClick={() => setSlotDuration(d)}
              className={`px-4 py-2 text-sm rounded-lg border transition-all active:scale-[0.98] ${slotDuration === d ? 'text-white border-transparent' : 'border-gray-300 text-gray-600 hover:border-[#0ea5b0]'}`}
              style={slotDuration === d ? { background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' } : undefined}>
              {d} min
            </button>
          ))}
        </div>
      </div>

      {/* Working hours */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Dias e horários de funcionamento</label>
        <p className="text-xs text-gray-400 mb-3">
          Define quando a clínica está aberta. A disponibilidade de cada profissional
          é configurada separadamente em <strong>Horários</strong> e deve ficar dentro desses limites.
        </p>
        <div className="space-y-2">
          {WEEKDAYS.map(({ key, label }) => {
            const active = !!hours[key]
            const wh = hours[key]
            return (
              <div key={key} className="flex items-center gap-4">
                <label className="flex items-center gap-2 w-28 cursor-pointer">
                  <input type="checkbox" checked={active} onChange={() => toggleDay(key)}
                    className="rounded border-gray-300" />
                  <span className="text-sm text-gray-700">{label}</span>
                </label>
                {active && wh ? (
                  <div className="flex items-center gap-2">
                    <input type="time" value={wh.start} onChange={e => updateHour(key, 'start', e.target.value)}
                      className="border border-gray-300 rounded-lg px-2 py-1 text-sm" />
                    <span className="text-gray-400 text-sm">até</span>
                    <input type="time" value={wh.end} onChange={e => updateHour(key, 'end', e.target.value)}
                      className="border border-gray-300 rounded-lg px-2 py-1 text-sm" />
                  </div>
                ) : (
                  <span className="text-sm text-gray-300">Fechado</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={save} disabled={saving}
          className="px-5 py-2 text-sm text-white rounded-xl disabled:opacity-40 transition-all active:scale-[0.99]"
          style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}>
          {saving ? 'Salvando...' : 'Salvar configurações'}
        </button>
      </div>
    </div>
  )
}
