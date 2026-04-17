import { useState, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import FullCalendar from '@fullcalendar/react'
import interactionPlugin from '@fullcalendar/interaction'
import resourceTimeGridPlugin from '@fullcalendar/resource-timegrid'
import dayGridPlugin from '@fullcalendar/daygrid'
import type { EventClickArg, EventInput } from '@fullcalendar/core'
import { format, addMinutes, startOfWeek, endOfWeek } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Plus, DoorOpen, UserCircle, X, Lock, Clock, CalendarBlank, Buildings, UsersFour, WhatsappLogo, CurrencyDollar, CheckCircle } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useAppointmentsQuery, useAppointmentMutations, useMyProfessionalRecords } from '../hooks/useAppointmentsMutations'
import { useAuthContext } from '../contexts/AuthContext'
import { useClinic } from '../hooks/useClinic'
import { useClinicModules } from '../hooks/useClinicModules'
import { useRooms, useCreateRoom } from '../hooks/useRooms'
import { useProfessionals } from '../hooks/useProfessionals'
import { useRoomAvailabilitySlots, useClinicAvailabilitySlots } from '../hooks/useRoomAvailability'
import AppointmentModal from '../components/appointments/AppointmentModal'
import RoomsDrawer from '../components/rooms/RoomsDrawer'
import UpgradeModal from '../components/billing/UpgradeModal'
import { useClinicQuota } from '../hooks/useClinicQuota'
import type { Appointment } from '../types'
import { buildSettingsPath, type SettingsTab } from '../lib/settingsNavigation'

const DAY_ORDER = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
type DayKey = typeof DAY_ORDER[number]
const DAY_FC: Record<DayKey, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }
const PT_DAY_LABELS: Record<DayKey, string> = {
  sun: 'Domingo', mon: 'Segunda', tue: 'Terça', wed: 'Quarta',
  thu: 'Quinta', fri: 'Sexta', sat: 'Sábado',
}
type AgendaView = 'room' | 'prof'

type FCBusinessHour = { daysOfWeek: number[]; startTime: string; endTime: string }

function slotsToResourceBusinessHours(
  slots: Array<{ weekday: number; startTime: string; endTime: string }>,
): FCBusinessHour[] | undefined {
  if (!slots.length) return undefined
  return slots.map(s => ({ daysOfWeek: [s.weekday], startTime: s.startTime, endTime: s.endTime }))
}

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

const CLINIC_PALETTE = ['#6366f1', '#0ea5e9', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6']

const STATUS_COLORS: Record<string, string> = {
  scheduled: '#0d9488',
  confirmed: '#10b981',
  completed: '#94a3b8',
  cancelled: '#f43f5e',
  no_show:   '#f59e0b',
}

// ─── Closed-slot unlock modal ─────────────────────────────────────────────────

interface ClosedSlotPending {
  startDate: Date
  date: string
  time: string
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
            className="w-full px-4 py-2 text-sm text-white rounded-lg transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}>
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

// ─── Extend-hours modal ───────────────────────────────────────────────────────

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
            className="w-full px-4 py-2 text-sm text-white rounded-lg transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}>
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

// ─────────────────────────────────────────────────────────────────────────────

export default function AgendaPage({ myOnly = false }: { myOnly?: boolean }) {
  const calendarRef = useRef<FullCalendar>(null)
  const today = new Date()
  const [range, setRange] = useState({
    start: startOfWeek(today).toISOString(),
    end: endOfWeek(today).toISOString(),
  })

  const [agendaView, setAgendaView]               = useState<AgendaView>('room')
  const [filterProfId, setFilterProfId]           = useState<string>('')
  const [extendConfirm, setExtendConfirm]         = useState<ExtendConfirm | null>(null)
  const [closedSlotPending, setClosedSlotPending] = useState<ClosedSlotPending | null>(null)
  const [roomsDrawerOpen, setRoomsDrawerOpen]     = useState(false)

  const { role, isSuperAdmin, session, profile } = useAuthContext()
  const { data: clinic, update: clinicUpdate } = useClinic()
  const { hasRooms, hasStaff, hasWhatsApp, hasFinancial, enableModule, disableModule } = useClinicModules()
  const { data: rooms = [] }              = useRooms()
  const createRoom                        = useCreateRoom()
  const { data: professionals = [], create: createProfessional } = useProfessionals()
  const { data: myProfRecords = [] }      = useMyProfessionalRecords()
  const { data: roomAvailSlots = [] }     = useRoomAvailabilitySlots()
  const { data: clinicAvailSlots = [] }   = useClinicAvailabilitySlots()

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

  const activeRoomCount      = rooms.filter(r => r.active).length
  const effectiveAgendaView: AgendaView = activeRoomCount <= 1 ? 'prof' : agendaView

  const { data: appointments = [], isLoading } = useAppointmentsQuery(range.start, range.end, professionalFilter)
  const { update } = useAppointmentMutations()

  const clinicColorMap = Object.fromEntries(
    myProfRecords.map((r, i) => [r.clinicId, CLINIC_PALETTE[i % CLINIC_PALETTE.length]])
  )
  const multiClinic = myProfRecords.length > 1

  const [modalOpen, setModalOpen]           = useState(false)
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false)
  const [editingAppt, setEditingAppt]       = useState<Appointment | null>(null)
  const [initialSlot, setInitialSlot]       = useState<{ date: string; time: string; durationMin: number; professionalId?: string } | null>(null)
  const [togglingModule, setTogglingModule] = useState<string | null>(null)
  const navigate = useNavigate()
  const quota = useClinicQuota(clinic)

  function openNewAppointmentModal() {
    if (quota.subscriptionRequired || quota.exceeded) {
      setUpgradeModalOpen(true)
      return
    }
    setModalOpen(true)
  }

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
    const active = professionals.filter(p => p.active)
    const source = filterProfId
      ? active.filter(p => p.id === filterProfId)
      : active
    if (!source.length) return [{ id: '__solo__', title: '' }]
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

  // Once we've seen events, never show welcome screen again (even when navigating to empty week)
  const hasSeenEvents = useRef(false)
  if (events.length > 0) hasSeenEvents.current = true
  const showWelcome = !isLoading && !hasSeenEvents.current && events.length === 0 && !isPersonalView

  function handleDateSelect(arg: { start: Date; end: Date; startStr: string; endStr: string; allDay: boolean; resource?: { id: string } }) {
    const durationMin = Math.max(15, Math.round((arg.end.getTime() - arg.start.getTime()) / 60000))
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
    openNewAppointmentModal()
  }

  function handleClosedSlotScheduleOnce() {
    if (!closedSlotPending) return
    const { date, time, durationMin } = closedSlotPending
    setClosedSlotPending(null)
    setEditingAppt(null)
    setInitialSlot({ date, time, durationMin })
    openNewAppointmentModal()
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
      await clinicUpdate.mutateAsync({ workingHours: { ...wh, [dayKey]: { start: newStart, end: newEnd } } })
      toast.success(`Horário de ${PT_DAY_LABELS[dayKey]} atualizado`)
    } catch {
      toast.error('Erro ao atualizar horário')
    }
    const { date, time: t, durationMin: dur } = closedSlotPending
    setClosedSlotPending(null)
    setEditingAppt(null)
    setInitialSlot({ date, time: t, durationMin: dur })
    openNewAppointmentModal()
  }

  function handleEventClick(arg: EventClickArg) {
    setEditingAppt(arg.event.extendedProps.appointment as Appointment)
    setInitialSlot(null)
    setModalOpen(true)
  }

  async function handleEventDrop(arg: { event: { id: string; startStr: string; endStr: string; start: Date | null; extendedProps: Record<string, unknown>; getResources: () => Array<{ id: string }> }; revert: () => void }) {
    const appt = arg.event.extendedProps.appointment as Appointment
    const newStart = arg.event.start!
    const diffMs = new Date(appt.endsAt).getTime() - new Date(appt.startsAt).getTime()
    // Detect resource column change (pro or room view)
    const newResourceId = arg.event.getResources()[0]?.id
    const newProfessionalId = effectiveAgendaView === 'prof' && newResourceId && newResourceId !== '__solo__'
      ? newResourceId
      : appt.professionalId
    const newRoomId = effectiveAgendaView === 'room' && newResourceId && newResourceId !== '__no_room__'
      ? newResourceId
      : appt.roomId
    try {
      await update.mutateAsync({
        id: appt.id, patientId: appt.patientId,
        professionalId: newProfessionalId,
        startsAt: newStart.toISOString(),
        endsAt: new Date(newStart.getTime() + diffMs).toISOString(),
        status: appt.status, notes: appt.notes,
        chargeAmountCents: appt.chargeAmountCents,
        roomId: newRoomId,
        serviceTypeId: appt.serviceTypeId,
        professionalFeeCents: appt.professionalFeeCents,
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
        status: appt.status, notes: appt.notes,
        chargeAmountCents: appt.chargeAmountCents,
        roomId: appt.roomId,
        serviceTypeId: appt.serviceTypeId,
        professionalFeeCents: appt.professionalFeeCents,
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
        status: appt.status, notes: appt.notes,
        chargeAmountCents: appt.chargeAmountCents,
        roomId: appt.roomId,
        serviceTypeId: appt.serviceTypeId,
        professionalFeeCents: appt.professionalFeeCents,
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

  const fcPlugins    = [resourceTimeGridPlugin, dayGridPlugin, interactionPlugin]
  const fcInitialView = 'resourceTimeGridWeek'
  const headerRight  = 'resourceTimeGridDay,resourceTimeGridWeek,dayGridMonth'
  const fcButtonText = {
    today: 'Hoje', week: 'Semana', day: 'Dia', month: 'Mês',
    resourceTimeGridWeek: 'Semana', resourceTimeGridDay: 'Dia', dayGridMonth: 'Mês',
  }

  const activeProfessionals = professionals.filter(p => p.active)
  const pageTitle = isPersonalView ? 'Minha Agenda' : 'Agenda'
  const todayHeadline = format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })

  return (
    <div className="space-y-4">
      {!showWelcome && (
      <div className="rounded-[28px] bg-white/90 border border-gray-200/80 px-4 py-4 shadow-sm sm:px-6 sm:py-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#0ea5b0] mb-2">
              {todayHeadline}
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-bold tracking-tight text-gray-900">{pageTitle}</h1>
              {clinic?.workingHours && Object.keys(clinic.workingHours).length > 0 && (
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                  todayOpen
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-red-50 text-red-600 border border-red-200'
                }`}>
                  {todayLabel}
                </span>
              )}
            </div>
          </div>
          {!isPersonalView && (
            <button
              onClick={() => { setEditingAppt(null); setInitialSlot(null); openNewAppointmentModal() }}
              className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm text-white shadow-sm transition-all active:scale-95 sm:w-auto"
              style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
            >
              <Plus size={16} /> Nova consulta
            </button>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-stretch gap-2">
          {!isPersonalView && activeProfessionals.length > 1 && (
            <select
              value={filterProfId}
              onChange={e => setFilterProfId(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-gray-200 bg-[#f8fafb] px-3 py-2.5 text-base text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#0ea5b0] sm:w-auto"
            >
              <option value="">Todos os profissionais</option>
              {activeProfessionals.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
          {!isPersonalView && hasRooms && (role === 'admin' || isSuperAdmin) && (
            <button
              onClick={() => setRoomsDrawerOpen(true)}
              className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-[#f8fafb] px-3 py-2.5 text-sm text-gray-600 transition-colors hover:border-[#0ea5b0]/40 hover:text-[#0ea5b0] sm:w-auto"
            >
              <DoorOpen size={14} /> Salas
            </button>
          )}
          {!isPersonalView && activeRoomCount > 1 && (
            <div className="flex w-full items-center rounded-xl border border-gray-200 bg-[#f8fafb] p-1 text-sm sm:w-auto">
              {([
                ['room', DoorOpen,     'Por sala'],
                ['prof', UserCircle,   'Profissional'],
              ] as const).map(([v, Icon, label]) => (
                <button key={v} onClick={() => setAgendaView(v)}
                  className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 transition-colors sm:flex-none ${
                    agendaView === v ? 'bg-white text-[#006970] shadow-sm' : 'text-gray-600 hover:bg-white/70'
                  }`}
                >
                  <Icon size={14} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      )}{/* end !showWelcome header */}

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
        <div className="flex items-center gap-2 px-4 py-2.5 bg-teal-50 border border-teal-100 rounded-xl text-xs text-[#006970]">
          <Lock size={13} className="shrink-0 text-[#0ea5b0]" />
          <span>Você está vendo apenas suas próprias consultas.</span>
        </div>
      )}

      {/* Empty state — shown when there are no appointments at all (new clinic) */}
      {showWelcome ? (
        <div className="bg-white rounded-2xl border border-gray-100 px-8 pt-16 pb-12 flex flex-col items-center gap-5 text-center">
          <div className="w-16 h-16 rounded-2xl bg-teal-50 flex items-center justify-center">
            <CalendarBlank size={32} className="text-[#0ea5b0]" />
          </div>
          <div className="max-w-sm">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Bem-vindo ao Consultin!</h2>
            <p className="text-sm text-gray-500">
              Sua agenda está vazia. Agende a primeira consulta clicando abaixo — o cadastro do paciente pode ser feito na hora.
            </p>
          </div>
          <button
            onClick={() => { setEditingAppt(null); setInitialSlot(null); openNewAppointmentModal() }}
            className="flex items-center gap-2 px-5 py-3 text-white text-sm font-medium rounded-xl transition-all active:scale-95 shadow-sm"
            style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}
          >
            <Plus size={16} /> Agendar primeira consulta
          </button>

          {/* Module extras */}
          <div className="mt-4 w-full max-w-lg">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-4">Extras disponíveis</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {([
                { key: 'staff'     as const, label: 'Equipe',     desc: 'Múltiplos profissionais e horários individuais',  icon: UsersFour,      active: hasStaff,    tab: 'usuarios'  as SettingsTab },
                { key: 'rooms'     as const, label: 'Salas',      desc: 'Gerencie salas e filtre a agenda por espaço',    icon: Buildings,      active: hasRooms,    tab: 'salas'     as SettingsTab },
                { key: 'whatsapp'  as const, label: 'WhatsApp',   desc: 'Lembretes automáticos e caixa de mensagens',    icon: WhatsappLogo,   active: hasWhatsApp, tab: 'whatsapp'  as SettingsTab },
                { key: 'financial' as const, label: 'Financeiro', desc: 'Cobranças, pagamentos e fluxo de caixa',         icon: CurrencyDollar, active: hasFinancial, tab: 'pagamento' as SettingsTab },
              ]).map(({ key, label, desc, icon: Icon, active, tab }) => (
                <button
                  key={key}
                  disabled={togglingModule === key}
                  onClick={async () => {
                    setTogglingModule(key)
                    if (active) {
                      await disableModule(key)
                      setTogglingModule(null)
                    } else {
                      await enableModule(key)
                      if (key === 'rooms' && rooms.length === 0) {
                        await createRoom.mutateAsync({ name: 'Sala 1', color: '#6366f1' })
                      }
                      if (key === 'staff' && professionals.length === 0) {
                        await createProfessional.mutateAsync({
                          name: profile?.name ?? session?.user.email ?? 'Profissional',
                          email: session?.user.email ?? null,
                          userId: session?.user.id ?? null,
                          specialty: null,
                          councilId: null,
                          phone: null,
                          active: true,
                          customFields: {},
                        })
                      }
                      setTogglingModule(null)
                      navigate(buildSettingsPath(tab))
                    }
                  }}
                  className={`text-left p-4 rounded-2xl border transition-all ${
                    active
                      ? 'border-teal-200 bg-teal-50/50'
                      : 'border-gray-200 bg-white hover:border-teal-200 hover:bg-teal-50/20'
                  } disabled:opacity-60`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                      active ? 'bg-teal-100 text-[#006970]' : 'bg-gray-100 text-gray-400'
                    }`}>
                      <Icon size={16} />
                    </div>
                    {active
                      ? <CheckCircle size={16} weight="fill" className="text-[#0ea5b0]" />
                      : <span className="text-[10px] font-medium text-gray-400 border border-gray-200 rounded-full px-2 py-0.5">Ativar</span>
                    }
                  </div>
                  <p className="text-sm font-semibold text-gray-800">{label}</p>
                  <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
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
          navLinks
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
          resourceLabelContent={(arg: { resource: { id: string; title: string } }) => {
            const rid = arg.resource.id
            if (rid === '__no_room__' || rid === '__solo__' || isPersonalView || (role !== 'admin' && !isSuperAdmin)) {
              return <span>{arg.resource.title}</span>
            }
            return (
              <div className="flex items-center gap-1.5 group w-full justify-between">
                <span className="text-sm font-medium truncate">{arg.resource.title}</span>
                <button
                  onClick={e => { e.stopPropagation(); setRoomsDrawerOpen(true) }}
                  title="Gerenciar salas"
                  className="flex-shrink-0 p-1 rounded hover:bg-gray-100 text-gray-300 hover:text-gray-600 transition-colors"
                >
                  <Clock size={13} />
                </button>
              </div>
            )
          }}
        />
      </div>
      )}{/* end empty-state conditional */}

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

      {roomsDrawerOpen && (
        <RoomsDrawer onClose={() => setRoomsDrawerOpen(false)} />
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

      {upgradeModalOpen && (
        <UpgradeModal
          quota={quota}
          onClose={() => setUpgradeModalOpen(false)}
        />
      )}
    </div>
  )
}
