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
const CALENDAR_DAYS = [
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
  { value: 0, label: 'Dom' },
] as const
const ALL_CALENDAR_DAYS = CALENDAR_DAYS.map(day => day.value)
const BUSINESS_DAYS = [1, 2, 3, 4, 5]

function timeForInput(value: string | null | undefined) {
  return value?.slice(0, 5) ?? ''
}

function getCalendarBounds(hours: Partial<Record<string, WorkingHours>>) {
  const values = Object.values(hours)
  const starts = values.map(hour => hour?.start).filter((time): time is string => !!time).sort()
  const ends = values.map(hour => hour?.end).filter((time): time is string => !!time).sort()
  return { start: starts[0] ?? '07:00', end: ends[ends.length - 1] ?? '20:00' }
}

export default function AgendaTab({ clinic }: { clinic: Clinic }) {
  const { update } = useClinic()
  const initialCalendarBounds = getCalendarBounds(clinic.workingHours ?? {})
  const [slotDuration,         setSlotDuration]         = useState(clinic.slotDurationMinutes)
  const [allowProfSelection,   setAllowProfSelection]   = useState(clinic.allowProfessionalSelection ?? true)
  const [hours, setHours] = useState<Partial<Record<string, WorkingHours>>>(clinic.workingHours ?? {})
  const [calendarVisibleDays, setCalendarVisibleDays] = useState<number[]>(
    clinic.calendarVisibleDays?.length ? clinic.calendarVisibleDays : ALL_CALENDAR_DAYS,
  )
  const [calendarStartTime, setCalendarStartTime] = useState(
    timeForInput(clinic.calendarDisplayStartTime) || initialCalendarBounds.start,
  )
  const [calendarEndTime, setCalendarEndTime] = useState(
    timeForInput(clinic.calendarDisplayEndTime) || initialCalendarBounds.end,
  )
  const [saving, setSaving] = useState(false)

  async function save() {
    if (calendarStartTime >= calendarEndTime) {
      toast.error('O horário inicial precisa ser anterior ao horário final')
      return
    }

    setSaving(true)
    try {
      await update.mutateAsync({
        slotDurationMinutes:        slotDuration,
        workingHours:               hours as Record<string, WorkingHours>,
        allowProfessionalSelection: allowProfSelection,
        calendarVisibleDays,
        calendarDisplayStartTime: calendarStartTime,
        calendarDisplayEndTime: calendarEndTime,
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

  function toggleCalendarDay(day: number) {
    setCalendarVisibleDays(current => {
      if (current.includes(day)) {
        return current.length === 1 ? current : current.filter(value => value !== day)
      }
      return [...current, day]
    })
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

      {/* Calendar display */}
      <section className="border-t border-gray-100 pt-6" aria-labelledby="calendar-display-heading">
        <div className="mb-4">
          <h2 id="calendar-display-heading" className="text-sm font-medium text-gray-700">Visualização do calendário</h2>
          <p className="mt-1 text-xs text-gray-400">
            Ajuste o que a equipe vê na agenda. Isso não altera os horários de funcionamento nem impede agendamentos.
          </p>
        </div>

        <div className="space-y-4 rounded-xl border border-gray-200 bg-[#f8fafb] p-4">
          <fieldset>
            <legend className="text-sm font-medium text-gray-700">Dias mostrados</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {CALENDAR_DAYS.map(day => {
                const selected = calendarVisibleDays.includes(day.value)
                return (
                  <button
                    key={day.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleCalendarDay(day.value)}
                    className={`min-h-10 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0ea5b0] ${
                      selected
                        ? 'border-[#0ea5b0] bg-teal-50 text-[#006970]'
                        : 'border-gray-200 bg-white text-gray-500 hover:border-[#0ea5b0]/50 hover:text-[#006970]'
                    }`}
                  >
                    {day.label}
                  </button>
                )
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCalendarVisibleDays(BUSINESS_DAYS)}
                className="rounded-md px-2 py-1 text-xs font-medium text-[#006970] hover:bg-teal-50"
              >
                Apenas dias úteis
              </button>
              <button
                type="button"
                onClick={() => setCalendarVisibleDays(ALL_CALENDAR_DAYS)}
                className="rounded-md px-2 py-1 text-xs font-medium text-[#006970] hover:bg-teal-50"
              >
                Mostrar todos
              </button>
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium text-gray-700">Faixa de horários exibida</legend>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-gray-600">
                Das
                <input
                  type="time"
                  value={calendarStartTime}
                  onChange={event => setCalendarStartTime(event.target.value)}
                  className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-800"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-600">
                às
                <input
                  type="time"
                  value={calendarEndTime}
                  onChange={event => setCalendarEndTime(event.target.value)}
                  className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-800"
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  const bounds = getCalendarBounds(hours)
                  setCalendarStartTime(bounds.start)
                  setCalendarEndTime(bounds.end)
                }}
                className="rounded-md px-2 py-1 text-xs font-medium text-[#006970] hover:bg-teal-50"
              >
                Usar horário de funcionamento
              </button>
            </div>
          </fieldset>
        </div>
      </section>

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
