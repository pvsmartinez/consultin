import { useState, useRef, useMemo } from 'react'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import resourceTimeGridPlugin from '@fullcalendar/resource-timegrid'
import type { EventClickArg, EventInput } from '@fullcalendar/core'
import { format, startOfWeek, endOfWeek } from 'date-fns'
import { Plus, DoorOpen, UserCircle, CalendarBlank, X } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useAppointmentsQuery, useAppointmentMutations, useMyProfessionalRecords } from '../hooks/useAppointmentsMutations'
import { useAuthContext } from '../contexts/AuthContext'
import { useClinic } from '../hooks/useClinic'
import { useRooms, useCreateRoom } from '../hooks/useRooms'
import { useProfessionals } from '../hooks/useProfessionals'
import AppointmentModal from '../components/appointments/AppointmentModal'
import type { Appointment } from '../types'

const DAY_ORDER = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
type DayKey = typeof DAY_ORDER[number]
const DAY_FC: Record<DayKey, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }
type AgendaView = 'default' | 'room' | 'prof'

// Distinct muted palette for multi-clinic colour-coding in the professional view
const CLINIC_PALETTE = ['#6366f1', '#0ea5e9', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6']

const STATUS_COLORS: Record<string, string> = {
  scheduled: '#0d9488',
  confirmed: '#10b981',
  completed: '#94a3b8',
  cancelled: '#f43f5e',
  no_show:   '#f59e0b',
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

  const [agendaView, setAgendaView]       = useState<AgendaView>('default')
  const [extendConfirm, setExtendConfirm] = useState<ExtendConfirm | null>(null)
  const [addRoomOpen, setAddRoomOpen]     = useState(false)

  const { role }                          = useAuthContext()
  const { data: clinic, update: clinicUpdate } = useClinic()
  const { data: rooms = [] }              = useRooms()
  const { data: professionals = [] }      = useProfessionals()
  const { data: myProfRecords = [] }      = useMyProfessionalRecords()

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

  const { data: appointments = [], isLoading } = useAppointmentsQuery(range.start, range.end, professionalFilter)
  const { update } = useAppointmentMutations()

  const clinicColorMap = Object.fromEntries(
    myProfRecords.map((r, i) => [r.clinicId, CLINIC_PALETTE[i % CLINIC_PALETTE.length]])
  )
  const multiClinic = myProfRecords.length > 1

  const [modalOpen, setModalOpen]     = useState(false)
  const [editingAppt, setEditingAppt] = useState<Appointment | null>(null)
  const [initialSlot, setInitialSlot] = useState<{ date: string; time: string; durationMin: number } | null>(null)

  // Resources for resource views
  const resources: { id: string; title: string; eventColor?: string }[] | undefined = useMemo(() => {
    if (agendaView === 'room') {
      const active = rooms.filter(r => r.active)
      return active.length
        ? active.map(r => ({ id: r.id, title: r.name, eventColor: r.color }))
        : [{ id: '__no_room__', title: 'Sem sala' }]
    }
    if (agendaView === 'prof') {
      const active = professionals.filter(p => p.active)
      return active.length ? active.map(p => ({ id: p.id, title: p.name })) : undefined
    }
    return undefined
  }, [agendaView, rooms, professionals])

  const events: EventInput[] = (appointments as (Appointment & { clinicName?: string | null })[]).map(a => {
    const color = multiClinic
      ? (clinicColorMap[a.clinicId] ?? '#6366f1')
      : (a.clinicRoom?.color ?? STATUS_COLORS[a.status] ?? '#0d9488')
    const title = multiClinic && a.clinicName
      ? `[${a.clinicName}] ${a.patient?.name ?? 'Paciente'}`
      : (a.patient?.name ?? 'Paciente')
    const resourceId = agendaView === 'room'
      ? (a.roomId ?? '__no_room__')
      : agendaView === 'prof' ? a.professionalId : undefined
    return {
      id: a.id, title,
      start: a.startsAt, end: a.endsAt,
      backgroundColor: color, borderColor: color,
      resourceId,
      extendedProps: { appointment: a },
    }
  })

  function handleDateSelect(arg: { start: Date; end: Date; startStr: string; endStr: string; allDay: boolean }) {
    setEditingAppt(null)
    const durationMin = Math.max(15, Math.round((arg.end.getTime() - arg.start.getTime()) / 60000))
    setInitialSlot({ date: format(arg.start, 'yyyy-MM-dd'), time: format(arg.start, 'HH:mm'), durationMin })
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

  // View config
  const isResourceView = agendaView !== 'default'
  const fcPlugins     = isResourceView ? [resourceTimeGridPlugin, interactionPlugin] : [timeGridPlugin, dayGridPlugin, interactionPlugin]
  const fcInitialView = isResourceView ? 'resourceTimeGridWeek' : 'timeGridWeek'
  const headerRight   = isResourceView ? 'resourceTimeGridWeek,resourceTimeGridDay' : 'dayGridMonth,timeGridWeek,timeGridDay'
  const fcButtonText  = { today: 'Hoje', month: 'Mês', week: 'Semana', day: 'Dia', resourceTimeGridWeek: 'Semana', resourceTimeGridDay: 'Dia' }

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
          {!isPersonalView && (
            <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden text-xs">
              {([
                ['default', CalendarBlank, 'Padrão'],
                ['room',    DoorOpen,      'Por sala'],
                ['prof',    UserCircle,    'Profissional'],
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
          {agendaView === 'room' && !isPersonalView && (
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

      <div className={`bg-white rounded-xl border border-gray-100 p-4 relative ${isLoading ? 'opacity-60' : ''}`}>
        <FullCalendar
          key={agendaView}
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
        />
      </div>

      <AppointmentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        appointment={editingAppt}
        initialDate={initialSlot?.date}
        initialTime={initialSlot?.time}
        initialDurationMin={initialSlot?.durationMin}
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
    </div>
  )
}
