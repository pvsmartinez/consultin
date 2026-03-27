import { useState, useEffect } from 'react'
import { Trash, CalendarDots } from '@phosphor-icons/react'
import { getISOWeek } from 'date-fns'
import { toast } from 'sonner'
import { useAvailabilitySlots } from '../../hooks/useAvailabilitySlots'
import { useRooms } from '../../hooks/useRooms'
import type { AvailabilitySlot } from '../../types'

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const
const WEEKDAY_FULL   = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'] as const

type WeekParity = 'even' | 'odd' | null
type DaySlot   = { startTime: string; endTime: string }
type DayConfig = { slots: DaySlot[]; roomId: string | null; weekParity: WeekParity }

/** Returns upcoming dates for the given parity (next 4 occurrences). */
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
  professionalId: string
  clinicId?: string
  addSlotLabel?: string
}

/**
 * Shared availability editor.
 * Supports: multiple time slots per day · room assignment · weekly or biweekly (quinzenal) frequency.
 */
export default function AvailabilityEditor({
  professionalId,
  clinicId,
  addSlotLabel = '+ horário',
}: Props) {
  const { data: slots = [], isLoading: loadingSlots, upsert } = useAvailabilitySlots(professionalId, clinicId)
  const { data: rooms = [] } = useRooms()
  const activeRooms = rooms.filter(r => r.active)

  const [schedule, setSchedule] = useState<Partial<Record<number, DayConfig>>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!slots.length) { setSchedule({}); return }
    const map: Partial<Record<number, DayConfig>> = {}
    for (const s of slots) {
      if (!map[s.weekday]) {
        map[s.weekday] = { slots: [], roomId: s.roomId ?? null, weekParity: s.weekParity ?? null }
      } else {
        if (!map[s.weekday]!.roomId && s.roomId) map[s.weekday]!.roomId = s.roomId
        if (!map[s.weekday]!.weekParity && s.weekParity) map[s.weekday]!.weekParity = s.weekParity
      }
      map[s.weekday]!.slots.push({ startTime: s.startTime, endTime: s.endTime })
    }
    setSchedule(map)
  }, [slots])

  function toggleDay(day: number) {
    setSchedule(prev => {
      const next = { ...prev }
      if (next[day]) delete next[day]
      else next[day] = { slots: [{ startTime: '08:00', endTime: '18:00' }], roomId: null, weekParity: null }
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
      return { ...prev, [day]: { ...cfg, slots: [...cfg.slots, { startTime: '13:00', endTime: '17:00' }] } }
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

  function setDayRoom(day: number, roomId: string | null) {
    setSchedule(prev => ({ ...prev, [day]: { ...prev[day]!, roomId } }))
  }

  function setDayParity(day: number, weekParity: WeekParity) {
    setSchedule(prev => ({ ...prev, [day]: { ...prev[day]!, weekParity } }))
  }

  async function save() {
    if (!professionalId) return
    setSaving(true)
    try {
      const newSlots: Omit<AvailabilitySlot, 'id' | 'clinicId'>[] = []
      for (const [dayStr, cfg] of Object.entries(schedule)) {
        if (!cfg) continue
        for (const s of cfg.slots) {
          newSlots.push({
            professionalId,
            weekday:    Number(dayStr) as AvailabilitySlot['weekday'],
            startTime:  s.startTime,
            endTime:    s.endTime,
            active:     true,
            roomId:     cfg.roomId,
            weekParity: cfg.weekParity,
          })
        }
      }
      await upsert.mutateAsync(newSlots)
      toast.success('Disponibilidade salva')
    } catch {
      toast.error('Erro ao salvar disponibilidade')
    } finally {
      setSaving(false)
    }
  }

  if (loadingSlots) {
    return <p className="text-sm text-gray-400">Carregando disponibilidade...</p>
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {([0, 1, 2, 3, 4, 5, 6] as const).map(day => {
          const cfg = schedule[day]
          const active = !!cfg
          const preview = cfg?.weekParity ? parityPreview(day, cfg.weekParity) : ''
          return (
            <div key={day} className={`border rounded-xl p-3 bg-white transition-colors ${active ? 'border-teal-200' : 'border-gray-200'}`}>
              {/* Toggle + day label */}
              <div className="flex items-center gap-3 mb-2">
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
                  <button type="button" onClick={() => addSlot(day)} className="text-xs text-[#006970] hover:underline ml-auto">
                    {addSlotLabel}
                  </button>
                )}
              </div>

              {/* Time slots */}
              {active && cfg.slots.map((s, idx) => (
                <div key={idx} className="flex items-center gap-2 ml-7 mb-1.5">
                  <input type="time" value={s.startTime}
                    onChange={e => updateSlot(day, idx, 'startTime', e.target.value)}
                    className="border border-gray-300 rounded-lg px-2 py-1 text-sm" />
                  <span className="text-gray-400 text-xs">até</span>
                  <input type="time" value={s.endTime}
                    onChange={e => updateSlot(day, idx, 'endTime', e.target.value)}
                    className="border border-gray-300 rounded-lg px-2 py-1 text-sm" />
                  {cfg.slots.length > 1 && (
                    <button type="button" onClick={() => removeSlot(day, idx)} className="text-gray-400 hover:text-red-500">
                      <Trash size={13} />
                    </button>
                  )}
                </div>
              ))}

              {/* Room + frequency options */}
              {active && (
                <div className="ml-7 mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {activeRooms.length > 0 && (
                    <div>
                      <label className="block text-[11px] text-gray-400 mb-0.5">Sala</label>
                      <select
                        value={cfg.roomId ?? ''}
                        onChange={e => setDayRoom(day, e.target.value || null)}
                        className="w-full border border-gray-200 rounded-xl px-2 py-1 text-xs text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-[#0ea5b0]"
                      >
                        <option value="">Qualquer sala</option>
                        {activeRooms.map(r => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
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
                </div>
              )}

              {!active && <p className="text-xs text-gray-300 ml-7">Não disponível</p>}
            </div>
          )
        })}
      </div>

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving || !professionalId}
          className="px-5 py-2 text-sm text-white rounded-xl disabled:opacity-40 transition-all active:scale-[0.99]"
          style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
        >
          {saving ? 'Salvando...' : 'Salvar disponibilidade'}
        </button>
      </div>
    </div>
  )
}
