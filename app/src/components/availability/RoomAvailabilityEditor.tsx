import { useState, useEffect } from 'react'
import { Trash, CalendarDots } from '@phosphor-icons/react'
import { getISOWeek } from 'date-fns'
import { toast } from 'sonner'
import { useRoomAvailabilitySlots } from '../../hooks/useRoomAvailability'
import type { RoomAvailabilitySlot } from '../../types'

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const
const WEEKDAY_FULL   = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'] as const

type WeekParity = 'even' | 'odd' | null
type DaySlot    = { startTime: string; endTime: string }
type DayConfig  = { slots: DaySlot[]; weekParity: WeekParity }

/** Preview: next 4 occurrences matching the given ISO-week parity */
function parityPreview(dayOfWeek: number, parity: WeekParity): string {
  if (!parity) return ''
  const dates: string[] = []
  let d = new Date()
  let checked = 0
  while (dates.length < 4 && checked < 60) {
    d = new Date(d.getTime() + 86_400_000)
    checked++
    if (d.getDay() !== dayOfWeek) continue
    const thisParity = getISOWeek(d) % 2 === 0 ? 'even' : 'odd'
    if (thisParity === parity) {
      dates.push(d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }))
    }
  }
  return dates.join(', ')
}

interface Props {
  roomId: string
}

/**
 * Editor of weekly availability windows for a single clinic room.
 * Used inside SalasTab — one collapsible editor per room card.
 */
export default function RoomAvailabilityEditor({ roomId }: Props) {
  const { data: allSlots = [], isLoading, upsert } = useRoomAvailabilitySlots()
  const slots = allSlots.filter(s => s.roomId === roomId)

  const [schedule, setSchedule] = useState<Partial<Record<number, DayConfig>>>({})
  const [saving, setSaving] = useState(false)

  // Sync local state whenever remote slots change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isLoading) return
    if (!slots.length) { setSchedule({}); return }
    const map: Partial<Record<number, DayConfig>> = {}
    for (const s of slots) {
      if (!map[s.weekday]) {
        map[s.weekday] = { slots: [], weekParity: s.weekParity ?? null }
      }
      map[s.weekday]!.slots.push({ startTime: s.startTime, endTime: s.endTime })
    }
    setSchedule(map)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(slots), isLoading])

  function toggleDay(day: number) {
    setSchedule(prev => {
      const next = { ...prev }
      if (next[day]) delete next[day]
      else next[day] = { slots: [{ startTime: '08:00', endTime: '18:00' }], weekParity: null }
      return next
    })
  }

  function updateSlot(day: number, idx: number, field: 'startTime' | 'endTime', value: string) {
    setSchedule(prev => {
      const cfg = prev[day]!
      const newSlots = [...cfg.slots]
      newSlots[idx] = { ...newSlots[idx], [field]: value }
      return { ...prev, [day]: { ...cfg, slots: newSlots } }
    })
  }

  function addSlot(day: number) {
    setSchedule(prev => {
      const cfg = prev[day]!
      return { ...prev, [day]: { ...cfg, slots: [...cfg.slots, { startTime: '14:00', endTime: '18:00' }] } }
    })
  }

  function removeSlot(day: number, idx: number) {
    setSchedule(prev => {
      const cfg = prev[day]!
      const newSlots = cfg.slots.filter((_, i) => i !== idx)
      if (newSlots.length === 0) { const next = { ...prev }; delete next[day]; return next }
      return { ...prev, [day]: { ...cfg, slots: newSlots } }
    })
  }

  function setDayParity(day: number, weekParity: WeekParity) {
    setSchedule(prev => ({ ...prev, [day]: { ...prev[day]!, weekParity } }))
  }

  async function save() {
    setSaving(true)
    try {
      const newSlots: Omit<RoomAvailabilitySlot, 'id' | 'clinicId'>[] = []
      for (const [dayStr, cfg] of Object.entries(schedule)) {
        if (!cfg) continue
        for (const s of cfg.slots) {
          newSlots.push({
            roomId,
            weekday:    Number(dayStr) as RoomAvailabilitySlot['weekday'],
            startTime:  s.startTime,
            endTime:    s.endTime,
            active:     true,
            weekParity: cfg.weekParity,
          })
        }
      }
      await upsert.mutateAsync({ roomId, slots: newSlots })
      toast.success('Disponibilidade da sala salva')
    } catch {
      toast.error('Erro ao salvar disponibilidade da sala')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
    return <p className="text-xs text-gray-400 py-2">Carregando...</p>
  }

  return (
    <div className="space-y-2 pt-2">
      <p className="text-xs text-gray-500">
        Marque os dias e horários em que esta sala está disponível para uso. Fora desses horários, a coluna da sala aparecerá bloqueada na agenda.
      </p>

      <div className="space-y-1.5">
        {([0, 1, 2, 3, 4, 5, 6] as const).map(day => {
          const cfg     = schedule[day]
          const active  = !!cfg
          const preview = cfg?.weekParity ? parityPreview(day, cfg.weekParity) : ''
          return (
            <div key={day}
              className={`border rounded-xl p-3 bg-white transition-colors ${active ? 'border-teal-200' : 'border-gray-100'}`}
            >
              {/* Day toggle */}
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => toggleDay(day)}
                    className="rounded border-gray-300 accent-blue-600"
                  />
                  <span className="text-sm font-semibold text-gray-700 w-10">{WEEKDAY_LABELS[day]}</span>
                </label>
                {active && (
                  <button type="button" onClick={() => addSlot(day)}
                    className="text-xs text-[#006970] hover:underline ml-auto">
                    + horário
                  </button>
                )}
              </div>

              {/* Time windows */}
              {active && cfg.slots.map((s, idx) => (
                <div key={idx} className="flex items-center gap-2 ml-7 mt-1.5">
                  <input type="time" value={s.startTime}
                    onChange={e => updateSlot(day, idx, 'startTime', e.target.value)}
                    className="border border-gray-300 rounded-lg px-2 py-1 text-sm" />
                  <span className="text-gray-400 text-xs">até</span>
                  <input type="time" value={s.endTime}
                    onChange={e => updateSlot(day, idx, 'endTime', e.target.value)}
                    className="border border-gray-300 rounded-lg px-2 py-1 text-sm" />
                  {cfg.slots.length > 1 && (
                    <button type="button" onClick={() => removeSlot(day, idx)}
                      className="text-gray-400 hover:text-red-500">
                      <Trash size={13} />
                    </button>
                  )}
                </div>
              ))}

              {/* Frequency */}
              {active && (
                <div className="ml-7 mt-2 max-w-xs">
                  <label className="block text-[11px] text-gray-400 mb-0.5">Frequência</label>
                  <select
                    value={cfg.weekParity ?? ''}
                    onChange={e => setDayParity(day, (e.target.value || null) as WeekParity)}
                    className="w-full border border-gray-200 rounded-xl px-2 py-1 text-xs text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-[#0ea5b0]"
                  >
                    <option value="">Toda semana</option>
                    <option value="even">Quinzenal A (semanas pares)</option>
                    <option value="odd">Quinzenal B (semanas ímpares)</option>
                  </select>
                  {cfg.weekParity && preview && (
                    <p className="text-[10px] text-[#0ea5b0] mt-0.5 flex items-center gap-1">
                      <CalendarDots size={10} />
                      Próx. {WEEKDAY_FULL[day].toLowerCase()}s: {preview}
                    </p>
                  )}
                </div>
              )}

              {!active && (
                <p className="text-xs text-gray-300 ml-7 mt-0.5">Sala fechada neste dia</p>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex justify-end pt-1">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-1.5 text-sm text-white rounded-xl disabled:opacity-40 transition-all active:scale-[0.98]"
          style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
        >
          {saving ? 'Salvando...' : 'Salvar disponibilidade'}
        </button>
      </div>
    </div>
  )
}
