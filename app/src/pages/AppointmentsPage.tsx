import { useState, useRef, useMemo } from 'react'
import FullCalendar from '@fullcalendar/react'
import interactionPlugin from '@fullcalendar/interaction'
import resourceTimeGridPlugin from '@fullcalendar/resource-timegrid'
import type { EventClickArg, EventInput } from '@fullcalendar/core'
import { format, addMinutes, startOfWeek, endOfWeek } from 'date-fns'
import { Plus, DoorOpen, UserCircle, X, Lock } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useAppointmentsQuery, useAppointmentMutations, useMyProfessionalRecords } from '../hooks/useAppointmentsMutations'
import { useAuthContext } from '../contexts/AuthContext'
import { useClinic } from '../hooks/useClinic'
import { useRooms, useCreateRoom } from '../hooks/useRooms'
import { useProfessionals } from '../hooks/useProfessionals'
import { useRoomAvailabilitySlots, useClinicAvailabilitySlots } from '../hooks/useRoomAvailability'
import AppointmentModal from '../components/appointments/AppointmentModal'
import type { Appointment } from '../types'

const DAY_ORDER = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
type DayKey = typeof DAY_ORDER[number]
const DAY_FC: Record<DayKey, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }
const PT_DAY_LABELS: Record<DayKey, string> = {
  sun: 'Domingo', mon: 'Segunda', tue: 'Terça', wed: 'Quarta',
  thu: 'Quinta', fri: 'Sexta', sat: 'Sábado',
}
type AgendaView = 'room' | 'prof'

// ─── per-resource businessHours helper ────────────────────────────────────────
type FCBusinessHour = { daysOfWeek: number[]; startTime: string; endTime: string }

function slotsToResourceBusinessHours(
  slots: Array<{ weekday: number; startTime: string; endTime: string }>,
): FCBusinessHour[] | undefined {
  if (!slots.length) return undefined
  return slots.map(s => ({ daysOfWeek: [s.weekday], startTime: s.startTime, endTime: s.endTime }))
}

/** Returns false if the date falls on a closed day or outside business hours */
function isInsideBusinessHours(
  date: Date,
  workingHours: Record<string, { start: string; end: string }> | null | undefined,
): boolean {
  if (!workingHours || Object.keys(workingHours).length === 0) return true
  const dayKey = DAY_ORDER[date.getDay() as 0|1|2|3|4|5|6]
  const hours = workingHours[dayKey]
  if (!hours) return false
  const [sh, sm] = hours.start.split(':').map(Number)
  const [eh, em] = hours.end.split(':').map(Number)
  const timeMin = date.getHours() * 60 + date.getMinutes()
  return timeMin >= sh * 60 + sm && timeMin < eh * 60 + em
}

// Distinct muted palette for multi-clinic colour-coding in the professional view
const CLINIC_PALETTE = ['#6366f1', '#0ea5e9', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6']

const STATUS_COLORS: Record<string, string> = {
  scheduled: '#0d9488',
  confirmed: '#10b981',
  completed: '#94a3b8',
  cancelled: '#f43f5e',
  no_show:   '#f59e0b',
}

// ─── closed-slot unlock modal ─────────────────────────────────────────────

interface ClosedSlotPending {
  startDate: Date
  date: string      // yyyy-MM-dd
  time: string      // HH:mm
  durationMin: number
  dayKey: DayKey
}

function ClosedSlotModal({
  pending, onJustThis, onOpenRecurring, onCancel, clinic,
}: {
  pending: ClosedSlotPending
  onJustThis: () => void
  onOpenRecurring: () => void
  onCancel: () => void
  clinic: { workingHours?: Record<string, { start: string; end: string }> | null } | undefined
}) {
  const dayLabel = PT_DAY_LABELS[pending.dayKey]
  const dayHours = clinic?.workingHours?.[pending.dayKey]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-80">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
            <Lock size={16} className="text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">Horário fechado</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {dayLabel} às {pending.time} está fora do horário de funcionamento
              {dayHours ? ` (${dayHours.start}–${dayHours.end})` : ' (dia fechado)'}.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <button onClick={onJustThis}
            className="w-full px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Agendar só desta vez
          </button>
          <button onClick={onOpenRecurring}
            className="w-full px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">
            Abrir toda {dayLabel} a partir das {pending.time}
          </button>
          <button onClick={onCancel}
            className="w-full px-4 py-2 text-sm text-gray-400 hover:text-gray-600">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── extend-hours modal ────────────────────────────────────────────────────

interface ExtendConfirm {
  appt: Appointment
  newEndsAt: string
  dayKey: DayKey
  newEndTime: string
}

function ExtendModal({ data, onJustThis, onAlways, onCancel }: {
  data: ExtendConfirm
  onJustThis: () => void
  onAlways: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-80">
        <div className="flex items-start justify-between mb-3">
          <p className="text-sm font-semibold text-gray-800">Consulta além do horário</p>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Essa consulta termina às <strong>{data.newEndTime}</strong>, além do horário
          configurado da clínica. Deseja salvar só esta consulta ou também atualizar o
          horário da clínica?
        </p>
        <div className="flex flex-col gap-2">
          <button onClick={onJustThis}
            className="w-full px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Só esta consulta
          </button>
          <button onClick={onAlways}
            className="w-full px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">
            Atualizar horário da clínica também
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── quick room creation ───────────────────────────────────────────────────

const ROOM_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444']

function AddRoomModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(ROOM_COLORS[0])
  const { mutateAsync, isPending } = useCreateRoom()

  async function handleCreate() {
    if (!name.trim()) return
    try {
      await mutateAsync({ name: name.trim(), color })
      toast.success(`Sala "${name}" criada`)
      onClose()
    } catch {
      toast.error('Erro ao criar sala')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-72">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-gray-800">Nova sala</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <input
          autoFocus value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          placeholder="Nome da sala"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3"
        />
        <div className="flex gap-2 mb-4">
          {ROOM_COLORS.map(c => (
            <button key={c} type="button" onClick={() => setColor(c)}
              className={`w-6 h-6 rounded-full border-2 transition-all ${color === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
              style={{ background: c }} />
          ))}
        </div>
        <button onClick={handleCreate} disabled={isPending || !name.trim()}
          className="w-full px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
          {isPending ? 'Criando...' : 'Criar sala'}
        </button>
      </div>
    </div>
  )
}

export default function AppointmentsPage({ myOnly = false }: { myOnly?: boolean }) {
  const calendarRef = useRef<FullCalendar>(null)
  const today = new Date()
  const [range, setRange] = useState({
    start: startOfWeek(today).toISOString(),
    end: endOfWeek(today).toISOString(),
  })

  const [agendaView, setAgendaView]         = useState<AgendaView>('room')
  const [filterProfId, setFilterProfId]     = useState<string>('')
  const [extendConfirm, setExtendConfirm]   = useState<ExtendConfirm | null>(null)
  const [closedSlotPending, setClosedSlotPending] = useState<ClosedSlotPending | null>(null)
  const [addRoomOpen, setAddRoomOpen]       = useState(false)

  const { role }                          = useAuthContext()
  const { data: clinic, update: clinicUpdate } = useClinic()
  const { data: rooms = [] }              = useRooms()
  const { data: professionals = [] }      = useProfessionals()
  const { data: myProfRecords = [] }      = useMyProfessionalRecords()
  const { data: roomAvailSlots = [] }     = useRoomAvailabilitySlots()
  const { data: clinicAvailSlots = [] }   = useClinicAvailabilitySlots()

  // Business hours + slot limits from clinic config
  const { businessHours, slotMin, slotMax, todayOpen, todayLabel } = useMemo(() => {
    const wh = clinic?.workingHours ?? {}
    const entries = Object.entries(wh)
    const bh = entries.map(([day, h]) => ({
      daysOfWeek: [DAY_FC[day as DayKey] ?? 0],
      startTime: h!.start,
      endTime: h!.end,
    }))
    const starts = entries.map(([, h]) => h!.start).sort()
    const ends   = entries.map(([, h]) => h!.end).sort()
    const todayKey = DAY_ORDER[today.getDay() as 0|1|2|3|4|5|6]
    const todayHours = wh[todayKey as keyof typeof wh]
    return {
      businessHours: bh.length ? bh : false,
      slotMin: starts[0] ?? '07:00',
      slotMax: ends[ends.length - 1] ?? '20:00',
      todayOpen: !!todayHours,
      todayLabel: todayHours ? `Aberta · ${todayHours.start}–${todayHours.end}` : 'Fechada hoje',
    }
  }, [clinic?.workingHours])

  const isPersonalView = myOnly || role === 'professional'
  const professionalFilter = isPersonalView ? myProfRecords.map(r => r.id) : null

  // When only 1 active room, always use professional view
  const activeRoomCount      = rooms.filter(r => r.active).length
  const effectiveAgendaView: AgendaView = activeRoomCount <= 1 ? 'prof' : agendaView

  const { data: appointments = [], isLoading } = useAppointmentsQuery(range.start, range.end, professionalFilter)
  const { update } = useAppointmentMutations()

  const clinicColorMap = Object.fromEntries(
    myProfRecords.map((r, i) => [r.clinicId, CLINIC_PALETTE[i % CLINIC_PALETTE.length]])
  )
  const multiClinic = myProfRecords.length > 1

  const [modalOpen, setModalOpen]     = useState(false)
  const [editingAppt, setEditingAppt] = useState<Appointment | null>(null)
  const [initialSlot, setInitialSlot] = useState<{ date: string; time: string; durationMin: number; professionalId?: string } | null>(null)

  // Resources for resource views — include per-resource businessHours
  // so each column shades its own unavailable time independently of the global clinic hours.
  const resources: { id: string; title: string; eventColor?: string; businessHours?: FCBusinessHour[] | false }[] = useMemo(() => {
    if (effectiveAgendaView === 'room') {
      const active = rooms.filter(r => r.active)
      if (!active.length) return [{ id: '__no_room__', title: 'Sem sala' }]
      return active.map(r => {
        const rSlots = roomAvailSlots.filter(s => s.roomId === r.id)
        const bh = slotsToResourceBusinessHours(
          rSlots.map(s => ({ weekday: s.weekday, startTime: s.startTime, endTime: s.endTime }))
        )
        return { id: r.id, title: r.name, eventColor: r.color, ...(bh ? { businessHours: bh } : {}) }
      })
    }
    // effectiveAgendaView === 'prof'
    const active = professionals.filter(p => p.active)
    const source = filterProfId
      ? active.filter(p => p.id === filterProfId)
      : active
    if (!source.length) return [{ id: '__no_prof__', title: 'Sem profissional' }]
    return source.map(p => {
      const pSlots = clinicAvailSlots.filter(s => s.professional_id === p.id)
      const bh = slotsToResourceBusinessHours(
        pSlots.map(s => ({ weekday: s.weekday, startTime: s.start_time, endTime: s.end_time }))
      )
      return { id: p.id, title: p.name, ...(bh ? { businessHours: bh } : {}) }
    })
  }, [effectiveAgendaView, rooms, professionals, filterProfId, roomAvailSlots, clinicAvailSlots])

  const events: EventInput[] = (appointments as (Appointment & { clinicName?: string | null })[]).map(a => {
    const color = multiClinic
      ? (clinicColorMap[a.clinicId] ?? '#6366f1')
      : (a.clinicRoom?.color ?? STATUS_COLORS[a.status] ?? '#0d9488')
    const title = multiClinic && a.clinicName
      ? `[${a.clinicName}] ${a.patient?.name ?? 'Paciente'}`
      : (a.patient?.name ?? 'Paciente')
    const resourceId = effectiveAgendaView === 'room'
      ? (a.roomId ?? '__no_room__')
      : a.professionalId
    return {
      id: a.id, title,
      start: a.startsAt, end: a.endsAt,
      backgroundColor: color, borderColor: color,
      resourceId,
      extendedProps: { appointment: a },
    }
  })

  function handleDateSelect(arg: { start: Date; end: Date; startStr: string; endStr: string; allDay: boolean; resource?: { id: string } }) {
    const durationMin = Math.max(15, Math.round((arg.end.getTime() - arg.start.getTime()) / 60000))
    // Owner/admin can schedule outside hours but must confirm
    if (!isPersonalView && clinic?.workingHours && !isInsideBusinessHours(arg.start, clinic.workingHours)) {
      const dayKey = DAY_ORDER[arg.start.getDay() as 0|1|2|3|4|5|6]
      setClosedSlotPending({
        startDate: arg.start,
        date: format(arg.start, 'yyyy-MM-dd'),
        time: format(arg.start, 'HH:mm'),
        durationMin,
        dayKey,
      })
      return
    }
    const profId = effectiveAgendaView === 'prof' ? (arg.resource?.id ?? '') : ''
    setEditingAppt(null)
    setInitialSlot({ date: format(arg.start, 'yyyy-MM-dd'), time: format(arg.start, 'HH:mm'), durationMin, professionalId: profId })
    setModalOpen(true)
  }

  function handleClosedSlotScheduleOnce() {
    if (!closedSlotPending) return
    const { date, time, durationMin } = closedSlotPending
    setClosedSlotPending(null)
    setEditingAppt(null)
    setInitialSlot({ date, time, durationMin })
    setModalOpen(true)
  }

  async function handleClosedSlotOpenRecurring() {
    if (!closedSlotPending || !clinic) return
    const { startDate, dayKey, durationMin } = closedSlotPending
    const time = format(startDate, 'HH:mm')
    const wh = (clinic.workingHours ?? {}) as Record<string, { start: string; end: string }>
    const current = wh[dayKey]
    let newStart = current?.start ?? time
    let newEnd   = current?.end   ?? format(addMinutes(startDate, durationMin), 'HH:mm')
    if (!current) {
      newStart = time
      newEnd   = format(addMinutes(startDate, durationMin), 'HH:mm')
    } else {
      const clickedMin = startDate.getHours() * 60 + startDate.getMinutes()
      const [sh, sm]   = current.start.split(':').map(Number)
      if (clickedMin < sh * 60 + sm) {
        newStart = time
      } else {
        newEnd = format(addMinutes(startDate, durationMin), 'HH:mm')
      }
    }
    try {
      await clinicUpdate.mutateAsync({
        workingHours: { ...wh, [dayKey]: { start: newStart, end: newEnd } },
      })
      toast.success(`Horário de ${PT_DAY_LABELS[dayKey]} atualizado`)
    } catch {
      toast.error('Erro ao atualizar horário')
    }
    const { date, time: t, durationMin: dur } = closedSlotPending
    setClosedSlotPending(null)
    setEditingAppt(null)
    setInitialSlot({ date, time: t, durationMin: dur })
    setModalOpen(true)
  }

  function handleEventClick(arg: EventClickArg) {
    setEditingAppt(arg.event.extendedProps.appointment as Appointment)
    setInitialSlot(null)
    setModalOpen(true)
  }

  async function handleEventDrop(arg: { event: { id: string; startStr: string; endStr: string; start: Date | null; extendedProps: Record<string, unknown> }; revert: () => void }) {
    const appt = arg.event.extendedProps.appointment as Appointment
    const newStart = arg.event.start!
    const diffMs = new Date(appt.endsAt).getTime() - new Date(appt.startsAt).getTime()
    try {
      await update.mutateAsync({
        id: appt.id, patientId: appt.patientId, professionalId: appt.professionalId,
        startsAt: newStart.toISOString(),
        endsAt: new Date(newStart.getTime() + diffMs).toISOString(),
        status: appt.status, notes: appt.notes, chargeAmountCents: appt.chargeAmountCents,
      })
      toast.success('Consulta remarcada')
    } catch {
      arg.revert()
      toast.error('Conflito de horário — não foi possível remarcar')
    }
  }

  async function handleEventResize(arg: { event: { end: Date | null; extendedProps: Record<string, unknown> }; revert: () => void }) {
    const appt = arg.event.extendedProps.appointment as Appointment
    const newEnd = arg.event.end!
    const dayKey = DAY_ORDER[newEnd.getDay() as 0|1|2|3|4|5|6]
    const clinicEnd = clinic?.workingHours?.[dayKey]?.end

    if (clinicEnd) {
      const [ch, cm] = clinicEnd.split(':').map(Number)
      const newEndMin = newEnd.getHours() * 60 + newEnd.getMinutes()
      if (newEndMin > ch * 60 + cm) {
        const hh = String(newEnd.getHours()).padStart(2, '0')
        const mm = String(newEnd.getMinutes()).padStart(2, '0')
        setExtendConfirm({ appt, newEndsAt: newEnd.toISOString(), dayKey, newEndTime: `${hh}:${mm}` })
        arg.revert()
        return
      }
    }
    try {
      await update.mutateAsync({
        id: appt.id, patientId: appt.patientId, professionalId: appt.professionalId,
        startsAt: appt.startsAt, endsAt: newEnd.toISOString(),
        status: appt.status, notes: appt.notes, chargeAmountCents: appt.chargeAmountCents,
      })
      toast.success('Consulta atualizada')
    } catch {
      arg.revert()
      toast.error('Erro ao atualizar')
    }
  }

  async function commitExtend(also: boolean) {
    if (!extendConfirm) return
    const { appt, newEndsAt, dayKey, newEndTime } = extendConfirm
    setExtendConfirm(null)
    try {
      await update.mutateAsync({
        id: appt.id, patientId: appt.patientId, professionalId: appt.professionalId,
        startsAt: appt.startsAt, endsAt: newEndsAt,
        status: appt.status, notes: appt.notes, chargeAmountCents: appt.chargeAmountCents,
      })
      if (also && clinic?.workingHours) {
        const current = clinic.workingHours[dayKey]
        const updated = {
          ...(clinic.workingHours as Record<string, { start: string; end: string }>),
          [dayKey]: { start: current?.start ?? '08:00', end: newEndTime },
        }
        await clinicUpdate.mutateAsync({ workingHours: updated as Record<string, { start: string; end: string }> })
        toast.success('Consulta salva e horário da clínica atualizado')
      } else {
        toast.success('Consulta salva')
      }
    } catch {
      toast.error('Erro ao salvar')
    }
  }

  // View config — always resource view
  const fcPlugins    = [resourceTimeGridPlugin, interactionPlugin]
  const fcInitialView = 'resourceTimeGridWeek'
  const headerRight  = 'resourceTimeGridWeek,resourceTimeGridDay'
  const fcButtonText = { today: 'Hoje', week: 'Semana', day: 'Dia', resourceTimeGridWeek: 'Semana', resourceTimeGridDay: 'Dia' }
  const activeProfessionals = professionals.filter(p => p.active)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-lg font-semibold text-gray-800">
          {isPersonalView ? 'Minha Agenda' : 'Agenda'}
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          {clinic?.workingHours && Object.keys(clinic.workingHours).length > 0 && (
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              todayOpen
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-red-50 text-red-600 border border-red-200'
            }`}>
              {todayLabel}
            </span>
          )}
          {/* Professional filter */}
          {!isPersonalView && activeProfessionals.length > 1 && (
            <select
              value={filterProfId}
              onChange={e => setFilterProfId(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Todos os profissionais</option>
              {activeProfessionals.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
          {/* Room/prof toggle — only if clinic has more than 1 room */}
          {!isPersonalView && activeRoomCount > 1 && (
            <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden text-xs">
              {([
                ['room', DoorOpen,     'Por sala'],
                ['prof', UserCircle,   'Profissional'],
              ] as const).map(([v, Icon, label]) => (
                <button key={v} onClick={() => setAgendaView(v)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 transition-colors ${
                    agendaView === v ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                  }`}>
                  <Icon size={14} />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>
          )}
          {agendaView === 'room' && !isPersonalView && activeRoomCount > 1 && (
            <button onClick={() => setAddRoomOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-dashed border-gray-300 text-gray-500 rounded-lg hover:border-blue-400 hover:text-blue-600 transition-colors">
              <Plus size={13} /> Sala
            </button>
          )}
          {!isPersonalView && (
            <button onClick={() => { setEditingAppt(null); setInitialSlot(null); setModalOpen(true) }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
              <Plus size={16} /> Nova consulta
            </button>
          )}
        </div>
      </div>

      {/* Multi-clinic legend */}
      {multiClinic && (
        <div className="flex flex-wrap gap-3 px-1">
          {myProfRecords.map((r, i) => (
            <span key={r.clinicId} className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="w-3 h-3 rounded-full inline-block" style={{ background: CLINIC_PALETTE[i % CLINIC_PALETTE.length] }} />
              {r.clinicName ?? r.clinicId}
            </span>
          ))}
        </div>
      )}

      {/* Read-only notice for professionals */}
      {isPersonalView && role === 'professional' && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700">
          <Lock size={13} className="shrink-0 text-blue-500" />
          <span>
            Você está vendo apenas suas próprias consultas. Para alterar sua disponibilidade, acesse{' '}
            <a href="/minha-disponibilidade" className="font-semibold underline hover:text-blue-900">Meus Horários</a>.
          </span>
        </div>
      )}

      <div className={`bg-white rounded-xl border border-gray-100 p-4 relative ${isLoading ? 'opacity-60' : ''}`}>
        <FullCalendar
          key={effectiveAgendaView}
          ref={calendarRef}
          plugins={fcPlugins}
          initialView={fcInitialView}
          locale="pt-br"
          headerToolbar={{ left: 'prev,next today', center: 'title', right: headerRight }}
          buttonText={fcButtonText}
          slotMinTime={`${slotMin}:00`}
          slotMaxTime={`${slotMax}:00`}
          slotDuration="00:30:00"
          businessHours={businessHours}
          resources={resources}
          allDaySlot={false}
          nowIndicator
          editable={!isPersonalView}
          selectable={!isPersonalView}
          selectMirror
          dayMaxEvents
          events={events}
          select={handleDateSelect}
          eventClick={handleEventClick}
          eventDrop={handleEventDrop}
          eventResize={handleEventResize}
          datesSet={info => setRange({ start: info.startStr, end: info.endStr })}
          contentHeight={620}
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', meridiem: false }}
          slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          schedulerLicenseKey="GPL-My-Project-Is-Open-Source"
        />
      </div>

      <AppointmentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        appointment={editingAppt}
        initialDate={initialSlot?.date}
        initialTime={initialSlot?.time}
        initialDurationMin={initialSlot?.durationMin}
        initialProfessionalId={initialSlot?.professionalId}
      />

      {extendConfirm && (
        <ExtendModal
          data={extendConfirm}
          onJustThis={() => commitExtend(false)}
          onAlways={() => commitExtend(true)}
          onCancel={() => setExtendConfirm(null)}
        />
      )}

      {addRoomOpen && (
        <AddRoomModal onClose={() => setAddRoomOpen(false)} />
      )}

      {closedSlotPending && (
        <ClosedSlotModal
          pending={closedSlotPending}
          clinic={clinic}
          onJustThis={handleClosedSlotScheduleOnce}
          onOpenRecurring={handleClosedSlotOpenRecurring}
          onCancel={() => setClosedSlotPending(null)}
        />
      )}
    </div>
  )
}
