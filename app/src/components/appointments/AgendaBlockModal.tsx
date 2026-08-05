import { useEffect, useState } from 'react'
import { Prohibit, X } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz'
import { addDays, addMinutes } from 'date-fns'
import { TZ_BR } from '../../utils/date'
import { useAgendaBlockMutations } from '../../hooks/useAgendaBlocks'

/**
 * "Não vou poder atender" in as few clicks as possible.
 *
 * The presets are the reasons that actually show up in the clinic's own history —
 * holiday, lunch, meeting, trip, seeing patients elsewhere — so the common case is
 * pick-a-chip + save, with the free-text field there for anything else.
 */
const PRESETS = [
  { label: 'Feriado',          reason: 'Feriado',                    allDay: true },
  { label: 'Almoço',           reason: 'Almoço',                     minutes: 60 },
  { label: 'Reunião',          reason: 'Reunião',                    minutes: 60 },
  { label: 'Viagem',           reason: 'Viagem',                     allDay: true },
  { label: 'Outro consultório', reason: 'Atendimento em outro consultório', minutes: 240 },
] as const

const DURATIONS = [30, 60, 120, 240] as const

interface Props {
  open: boolean
  onClose: () => void
  /** Pre-fill from a calendar drag/click (YYYY-MM-DD / HH:MM in São Paulo) */
  initialDate?: string
  initialTime?: string
  initialDurationMin?: number
  initialProfessionalId?: string | null
  professionals: Array<{ id: string; name: string }>
}

export default function AgendaBlockModal({
  open, onClose, initialDate, initialTime, initialDurationMin,
  initialProfessionalId, professionals,
}: Props) {
  const { create } = useAgendaBlockMutations()
  const [date, setDate] = useState('')
  const [time, setTime] = useState('09:00')
  const [durationMin, setDurationMin] = useState<number>(60)
  const [allDay, setAllDay] = useState(false)
  const [days, setDays] = useState(1)
  const [reason, setReason] = useState('')
  const [professionalId, setProfessionalId] = useState<string>('')

  useEffect(() => {
    if (!open) return
    const today = formatInTimeZone(new Date().toISOString(), TZ_BR, 'yyyy-MM-dd')
    setDate(initialDate ?? today)
    setTime(initialTime ?? '09:00')
    setDurationMin(initialDurationMin ?? 60)
    setAllDay(false)
    setDays(1)
    setReason('')
    setProfessionalId(initialProfessionalId ?? '')
  }, [open, initialDate, initialTime, initialDurationMin, initialProfessionalId])

  if (!open) return null

  function applyPreset(preset: typeof PRESETS[number]) {
    setReason(preset.reason)
    if ('allDay' in preset && preset.allDay) {
      setAllDay(true)
    } else if ('minutes' in preset) {
      setAllDay(false)
      setDurationMin(preset.minutes)
    }
  }

  async function handleSave() {
    if (!date) { toast.error('Escolha a data'); return }
    const startsAt = allDay
      ? fromZonedTime(`${date}T00:00:00`, TZ_BR)
      : fromZonedTime(`${date}T${time}:00`, TZ_BR)
    const endsAt = allDay
      ? addDays(startsAt, Math.max(1, days))
      : addMinutes(startsAt, durationMin)

    try {
      await create.mutateAsync({
        professionalId: professionalId || null,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        allDay,
        reason: reason.trim() || null,
      })
      toast.success(allDay
        ? `Agenda bloqueada${days > 1 ? ` por ${days} dias` : ' no dia'}`
        : 'Horário bloqueado')
      onClose()
    } catch {
      toast.error('Não foi possível bloquear o horário')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
              <Prohibit size={16} />
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900">Bloquear agenda</p>
              <p className="mt-0.5 text-xs text-gray-500">Marque um período em que não haverá atendimento.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="mb-3 flex flex-wrap gap-1.5">
          {PRESETS.map(preset => (
            <button
              key={preset.label}
              type="button"
              onClick={() => applyPreset(preset)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                reason === preset.reason
                  ? 'border-[#0ea5b0] bg-[#0ea5b0]/10 text-[#006970]'
                  : 'border-gray-200 text-gray-600 hover:border-[#0ea5b0]/40 hover:text-[#006970]'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Motivo</label>
            <input
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Ex.: congresso, consulta médica"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-[#0ea5b0] focus:ring-[#0ea5b0]" />
            Dia inteiro
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                {allDay ? 'A partir de' : 'Data'}
              </label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]" />
            </div>
            {allDay ? (
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Quantos dias</label>
                <input type="number" min={1} max={60} value={days}
                  onChange={e => setDays(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]" />
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Horário</label>
                <input type="time" value={time} onChange={e => setTime(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]" />
              </div>
            )}
          </div>

          {!allDay && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Duração</label>
              <div className="flex flex-wrap gap-1.5">
                {DURATIONS.map(d => (
                  <button key={d} type="button" onClick={() => setDurationMin(d)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                      durationMin === d
                        ? 'border-[#0ea5b0] bg-[#0ea5b0]/10 text-[#006970]'
                        : 'border-gray-200 text-gray-600 hover:border-[#0ea5b0]/40'
                    }`}>
                    {d >= 60 ? `${d / 60}h` : `${d} min`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {professionals.length > 1 && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Quem fica indisponível</label>
              <select
                value={professionalId}
                onChange={e => setProfessionalId(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]"
              >
                <option value="">Clínica toda</option>
                {professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose}
            className="min-h-11 rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 transition hover:bg-gray-50">
            Cancelar
          </button>
          <button type="button" onClick={handleSave} disabled={create.isPending}
            className="min-h-11 rounded-xl px-4 py-2.5 text-sm font-medium text-white transition-all active:scale-[0.99] disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}>
            {create.isPending ? 'Bloqueando...' : 'Bloquear'}
          </button>
        </div>
      </div>
    </div>
  )
}
