import { useState, useEffect, useRef } from 'react'
import { getISOWeek } from 'date-fns'
import { toast } from 'sonner'
import { useAvailabilitySlots } from '../../hooks/useAvailabilitySlots'
import { useRooms } from '../../hooks/useRooms'
import type { AvailabilitySlot, ClinicRoom } from '../../types'

// Visual grid: 06:00–22:00 in 30-min increments
const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const
const GRID_START  = 12           // slot index for 06:00
const GRID_END    = 44           // slot index for 22:00 (exclusive)
const TOTAL_SLOTS = GRID_END - GRID_START   // 32 slots
const SLOT_H      = 12           // px per 30-min row

type RecurrenceRule = string | null

const RECURRENCE_OPTIONS: { value: string; label: string }[] = [
  { value: '',            label: 'Toda semana' },
  { value: 'even',        label: 'A cada 2 sem. — Série A' },
  { value: 'odd',         label: 'A cada 2 sem. — Série B' },
  { value: 'every3:0',    label: 'A cada 3 sem. — Série A' },
  { value: 'every3:1',    label: 'A cada 3 sem. — Série B' },
  { value: 'every3:2',    label: 'A cada 3 sem. — Série C' },
  { value: 'every4:0',    label: 'A cada 4 sem. — Série A' },
  { value: 'every4:1',    label: 'A cada 4 sem. — Série B' },
  { value: 'every4:2',    label: 'A cada 4 sem. — Série C' },
  { value: 'every4:3',    label: 'A cada 4 sem. — Série D' },
  { value: 'monthly:1',   label: 'Mensal — 1ª ocorrência' },
  { value: 'monthly:2',   label: 'Mensal — 2ª ocorrência' },
  { value: 'monthly:3',   label: 'Mensal — 3ª ocorrência' },
  { value: 'monthly:4',   label: 'Mensal — 4ª ocorrência' },
  { value: 'monthly:last', label: 'Mensal — última' },
]

function slotToTime(slot: number): string {
  const h = Math.floor(slot / 2)
  const m = slot % 2 === 0 ? '00' : '30'
  return `${String(h).padStart(2, '0')}:${m}`
}

function timeToSlot(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 2 + (m >= 30 ? 1 : 0)
}

function slotsToRanges(cellSet: Set<number>): { startTime: string; endTime: string }[] {
  if (!cellSet.size) return []
  const sorted = [...cellSet].sort((a, b) => a - b)
  const ranges: { startTime: string; endTime: string }[] = []
  let start = sorted[0]
  let prev = sorted[0]
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== prev + 1) {
      ranges.push({ startTime: slotToTime(start), endTime: slotToTime(prev + 1) })
      start = sorted[i]
    }
    prev = sorted[i]
  }
  ranges.push({ startTime: slotToTime(start), endTime: slotToTime(prev + 1) })
  return ranges
}

function nthWeekdayOfMonth(year: number, month: number, dayOfWeek: number, n: number | 'last'): Date | null {
  const dates: Date[] = []
  for (let d = 1; d <= 31; d++) {
    const date = new Date(year, month, d)
    if (date.getMonth() !== month) break
    if (date.getDay() === dayOfWeek) dates.push(date)
  }
  if (n === 'last') return dates[dates.length - 1] ?? null
  return dates[(n as number) - 1] ?? null
}

function recurrencePreview(dayOfWeek: number, rule: RecurrenceRule): string {
  if (!rule) return ''
  const fmt = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  const dates: string[] = []
  if (rule === 'even' || rule === 'odd') {
    let d = new Date(); let checked = 0
    while (dates.length < 3 && checked < 60) {
      d = new Date(d.getTime() + 86_400_000); checked++
      if (d.getDay() !== dayOfWeek) continue
      if ((getISOWeek(d) % 2 === 0 ? 'even' : 'odd') === rule) dates.push(fmt(d))
    }
  } else if (rule.startsWith('every3:') || rule.startsWith('every4:')) {
    const n = rule.startsWith('every3:') ? 3 : 4
    const k = parseInt(rule.split(':')[1])
    let d = new Date(); let checked = 0
    while (dates.length < 3 && checked < 90) {
      d = new Date(d.getTime() + 86_400_000); checked++
      if (d.getDay() !== dayOfWeek) continue
      if (getISOWeek(d) % n === k) dates.push(fmt(d))
    }
  } else if (rule.startsWith('monthly:')) {
    const nStr = rule.split(':')[1]
    const n = nStr === 'last' ? 'last' as const : parseInt(nStr)
    const now = new Date()
    for (let mo = 0; mo < 8 && dates.length < 3; mo++) {
      const m = (now.getMonth() + mo) % 12
      const y = now.getFullYear() + Math.floor((now.getMonth() + mo) / 12)
      const found = nthWeekdayOfMonth(y, m, dayOfWeek, n)
      if (found && found > now) dates.push(fmt(found))
    }
  }
  return dates.join(', ')
}

interface Props {
  professionalId: string
  clinicId?: string
  addSlotLabel?: string  // kept for backward-compat, not used in visual grid
}

export default function AvailabilityEditor({ professionalId, clinicId }: Props) {
  const { data: slots = [], isLoading, upsert } = useAvailabilitySlots(professionalId, clinicId)
  const { data: rooms = [] } = useRooms()
  const activeRooms = rooms.filter(r => r.active)

  // cells[day] = Set of absolute slot indices marked as available
  const [cells, setCells] = useState<Partial<Record<number, Set<number>>>>({})
  const [recurrences, setRecurrences] = useState<Partial<Record<number, RecurrenceRule>>>({})
  const [roomIds, setRoomIds] = useState<Partial<Record<number, string | null>>>({})
  const [saving, setSaving] = useState(false)

  const dragRef = useRef<{ day: number; startSlot: number; mode: 'add' | 'remove' } | null>(null)

  useEffect(() => {
    const stop = () => { dragRef.current = null }
    window.addEventListener('mouseup', stop)
    return () => window.removeEventListener('mouseup', stop)
  }, [])

  // Sync from remote data or apply Mon–Fri 08–18 default for new professionals
  useEffect(() => {
    if (isLoading) return
    if (!slots.length) {
      const s08 = timeToSlot('08:00')
      const e18 = timeToSlot('18:00')
      const defaultCells: Partial<Record<number, Set<number>>> = {}
      for (const day of [1, 2, 3, 4, 5]) {
        const set = new Set<number>()
        for (let i = s08; i < e18; i++) set.add(i)
        defaultCells[day] = set
      }
      setCells(defaultCells); setRecurrences({}); setRoomIds({})
      return
    }
    const newCells: Partial<Record<number, Set<number>>> = {}
    const newRec: Partial<Record<number, RecurrenceRule>> = {}
    const newRooms: Partial<Record<number, string | null>> = {}
    for (const s of slots) {
      if (!newCells[s.weekday]) {
        newCells[s.weekday] = new Set()
        newRec[s.weekday] = s.weekParity
        newRooms[s.weekday] = s.roomId ?? null
      }
      const start = Math.max(timeToSlot(s.startTime), GRID_START)
      const end   = Math.min(timeToSlot(s.endTime),   GRID_END)
      for (let i = start; i < end; i++) newCells[s.weekday]!.add(i)
    }
    setCells(newCells); setRecurrences(newRec); setRoomIds(newRooms)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(slots), isLoading])

  // --- Drag interaction ---

  function applyDrag(day: number, endSlot: number) {
    const drag = dragRef.current
    if (!drag) return
    const { startSlot, mode } = drag
    const minS = Math.min(startSlot, endSlot)
    const maxS = Math.max(startSlot, endSlot)
    setCells(prev => {
      const current = new Set(prev[day] ?? [])
      for (let i = minS; i <= maxS; i++) {
        if (mode === 'add') current.add(i)
        else current.delete(i)
      }
      if (current.size === 0) { const next = { ...prev }; delete next[day]; return next }
      return { ...prev, [day]: current }
    })
  }

  function handleMouseDown(day: number, slot: number, e: React.MouseEvent) {
    e.preventDefault()
    const mode = cells[day]?.has(slot) ? 'remove' : 'add'
    dragRef.current = { day, startSlot: slot, mode }
    applyDrag(day, slot)
  }

  function handleMouseEnter(day: number, slot: number) {
    if (!dragRef.current || dragRef.current.day !== day) return
    applyDrag(day, slot)
  }

  // --- Day quick-actions ---

  function closeDay(day: number) {
    setCells(prev => { const next = { ...prev }; delete next[day]; return next })
  }

  function openAllDay(day: number) {
    const set = new Set<number>()
    for (let i = GRID_START; i < GRID_END; i++) set.add(i)
    setCells(prev => ({ ...prev, [day]: set }))
  }

  // --- Save ---

  async function save() {
    if (!professionalId) return
    setSaving(true)
    try {
      const newSlots: Omit<AvailabilitySlot, 'id' | 'clinicId'>[] = []
      for (const [dayStr, cellSet] of Object.entries(cells)) {
        if (!cellSet?.size) continue
        const day = Number(dayStr) as AvailabilitySlot['weekday']
        for (const r of slotsToRanges(cellSet)) {
          newSlots.push({
            professionalId,
            weekday:    day,
            startTime:  r.startTime,
            endTime:    r.endTime,
            active:     true,
            roomId:     roomIds[day] ?? null,
            weekParity: recurrences[day] ?? null,
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

  if (isLoading) return <p className="text-sm text-gray-400">Carregando disponibilidade...</p>

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Arraste nas colunas para marcar os horários. Configure recorrência e sala por dia abaixo do grid.
      </p>

      <div className="select-none">
        {/* Day headers with quick-action buttons */}
        <div className="flex">
          <div className="w-10 flex-shrink-0" />
          {([0, 1, 2, 3, 4, 5, 6] as const).map(day => {
            const isOpen    = !!(cells[day]?.size)
            const isFullDay = cells[day]?.size === TOTAL_SLOTS
            return (
              <div key={day} className="flex-1 flex flex-col items-center gap-1 pb-1.5 min-w-0">
                <span className={`text-[11px] font-semibold ${isOpen ? 'text-gray-700' : 'text-gray-400'}`}>
                  {WEEKDAY_LABELS[day]}
                </span>
                <div className="flex gap-0.5">
                  <button type="button" onClick={() => closeDay(day)} title="Fechar dia"
                    className={`text-[9px] px-1 py-0.5 rounded leading-none transition-colors ${
                      !isOpen ? 'bg-gray-200 text-gray-700 font-semibold' : 'text-gray-400 hover:bg-gray-100'
                    }`}>Fech.</button>
                  <button type="button" onClick={() => openAllDay(day)} title="Dia inteiro"
                    className={`text-[9px] px-1 py-0.5 rounded leading-none transition-colors ${
                      isFullDay ? 'bg-teal-100 text-teal-700 font-semibold' : 'text-gray-400 hover:bg-gray-100'
                    }`}>Todo</button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Grid body */}
        <div className="flex border border-gray-200 rounded-xl overflow-hidden">
          {/* Hour axis */}
          <div className="w-10 flex-shrink-0 bg-gray-50 border-r border-gray-100">
            {Array.from({ length: TOTAL_SLOTS }, (_, i) => {
              const absSlot = GRID_START + i
              const isHour  = absSlot % 2 === 0
              return (
                <div key={i} style={{ height: SLOT_H }}
                  className={`flex items-center justify-end pr-1 ${isHour && i > 0 ? 'border-t border-gray-200' : ''}`}>
                  {isHour && (
                    <span className="text-[8px] text-gray-400 leading-none tabular-nums">
                      {slotToTime(absSlot)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          {/* Day columns */}
          {([0, 1, 2, 3, 4, 5, 6] as const).map(day => (
            <div key={day} className="flex-1 border-l border-gray-100">
              {Array.from({ length: TOTAL_SLOTS }, (_, i) => {
                const absSlot      = GRID_START + i
                const isSelected   = !!(cells[day]?.has(absSlot))
                const isHourBorder = absSlot % 2 === 0 && i > 0
                return (
                  <div key={i} style={{ height: SLOT_H }}
                    className={`cursor-pointer transition-colors ${isHourBorder ? 'border-t' : ''} ${
                      isSelected
                        ? `bg-teal-400 hover:bg-teal-500 ${isHourBorder ? 'border-teal-500' : ''}`
                        : `bg-white hover:bg-teal-50 ${isHourBorder ? 'border-gray-100' : ''}`
                    }`}
                    onMouseDown={e => handleMouseDown(day, absSlot, e)}
                    onMouseEnter={() => handleMouseEnter(day, absSlot)}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Option rows aligned with grid columns */}
      <div className="space-y-1.5">
        {/* Room row (only if clinic has rooms) */}
        {activeRooms.length > 0 && (
          <div className="flex items-center">
            <span className="w-10 flex-shrink-0 text-[9px] text-gray-400 text-right pr-1.5">Sala</span>
            {([0, 1, 2, 3, 4, 5, 6] as const).map(day => (
              <div key={day} className="flex-1 px-0.5">
                <select
                  value={roomIds[day] ?? ''}
                  onChange={e => setRoomIds(prev => ({ ...prev, [day]: e.target.value || null }))}
                  disabled={!cells[day]?.size}
                  title={`Sala — ${WEEKDAY_LABELS[day]}`}
                  className="w-full border border-gray-200 rounded px-0.5 py-0.5 text-[8px] bg-white disabled:opacity-25 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-teal-400"
                >
                  <option value="">Qualquer</option>
                  {activeRooms.map((r: ClinicRoom) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}

        {/* Recurrence row */}
        <div className="flex items-start">
          <span className="w-10 flex-shrink-0 text-[9px] text-gray-400 text-right pr-1.5 pt-1">Rec.</span>
          {([0, 1, 2, 3, 4, 5, 6] as const).map(day => {
            const rule    = recurrences[day] ?? null
            const preview = cells[day]?.size ? recurrencePreview(day, rule) : ''
            return (
              <div key={day} className="flex-1 px-0.5">
                <select
                  value={rule ?? ''}
                  onChange={e => setRecurrences(prev => ({ ...prev, [day]: e.target.value || null }))}
                  disabled={!cells[day]?.size}
                  title={`Recorrência — ${WEEKDAY_LABELS[day]}`}
                  className="w-full border border-gray-200 rounded px-0.5 py-0.5 text-[8px] bg-white disabled:opacity-25 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-teal-400"
                >
                  {RECURRENCE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {preview && (
                  <p className="text-[7px] text-teal-600 leading-tight mt-0.5 truncate" title={preview}>
                    {preview}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend + Save */}
      <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3 text-[10px] text-gray-400">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-teal-400 inline-block" />
            Disponível
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-white border border-gray-200 inline-block" />
            Fechado
          </span>
        </div>
        <button onClick={save} disabled={saving || !professionalId}
          className="min-h-11 w-full rounded-xl px-4 py-2.5 text-sm text-white transition-all active:scale-[0.98] disabled:opacity-40 sm:w-auto"
          style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}>
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  )
}
