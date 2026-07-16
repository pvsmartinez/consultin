import { useState, useMemo, useEffect } from 'react'
import { Calendar, dateFnsLocalizer, type EventProps, type SlotInfo, type View } from 'react-big-calendar'
import withDragAndDrop, { type EventInteractionArgs } from 'react-big-calendar/lib/addons/dragAndDrop'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css'
import { format, addDays, addMinutes, addMonths, addWeeks, endOfMonth, endOfWeek, getDay, parse, startOfDay, startOfMonth, startOfWeek } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  CalendarBlank,
  CheckCircle,
  CaretLeft,
  CaretRight,
  DoorOpen,
  Lock,
  Plus,
  SealCheck,
  Warning,
  WarningCircle,
  X,
  XCircle,
} from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAppointmentsQuery, useAppointmentMutations, useMyProfessionalRecords } from '../hooks/useAppointmentsMutations'
import { useAuthContext } from '../contexts/AuthContext'
import { useClinic } from '../hooks/useClinic'
import { useClinicModules } from '../hooks/useClinicModules'
import { useRooms } from '../hooks/useRooms'
import { useProfessionals } from '../hooks/useProfessionals'
import AppointmentModal from '../components/appointments/AppointmentModal'
import UpgradeModal from '../components/billing/UpgradeModal'
import { useClinicQuota } from '../hooks/useClinicQuota'
import { APPOINTMENT_STATUS_LABELS, type Appointment, type AppointmentStatus } from '../types'
import { getAppointmentSaveErrorMessage } from '../utils/appointmentErrors'
import { fillMissingRoomSelections } from '../utils/agendaRoomSelections'
import { APP_ROUTES } from '../lib/appRoutes'

const DAY_ORDER = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
type DayKey = typeof DAY_ORDER[number]
const PT_DAY_LABELS: Record<DayKey, string> = {
  sun: 'Domingo', mon: 'Segunda', tue: 'Terça', wed: 'Quarta',
  thu: 'Quinta', fri: 'Sexta', sat: 'Sábado',
}
type CalendarView = 'day' | 'week' | 'month'
type DayBreakdown = 'none' | 'room' | 'professional'

type AgendaCalendarResource = { id: string; title: string; color?: string }
type AgendaCalendarEvent = {
  id: string
  title: string
  start: Date
  end: Date
  resourceId?: string
  appointment: Appointment
  conflictNames?: string[]
  color: string
}

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales: { 'pt-BR': ptBR },
})

const DragAndDropCalendar = withDragAndDrop<AgendaCalendarEvent, AgendaCalendarResource>(Calendar)

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
const UNASSIGNED_ROOM_FILTER = '__unassigned__'

const STATUS_COLORS: Record<AppointmentStatus, string> = {
  scheduled: '#0d9488',
  confirmed: '#10b981',
  completed: '#94a3b8',
  cancelled: '#f43f5e',
  no_show:   '#f59e0b',
}

function normalizeName(name: string | null | undefined) {
  return (name ?? '').replace(/\s+/g, ' ').trim()
}

function getContrastingTextColor(hexColor: string) {
  const hex = hexColor.replace('#', '')
  const normalized = hex.length === 3
    ? hex.split('').map(char => `${char}${char}`).join('')
    : hex
  const r = parseInt(normalized.slice(0, 2), 16)
  const g = parseInt(normalized.slice(2, 4), 16)
  const b = parseInt(normalized.slice(4, 6), 16)
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return luminance > 0.68 ? '#0f172a' : '#ffffff'
}

function getStatusIcon(status: AppointmentStatus) {
  switch (status) {
    case 'confirmed':
      return CheckCircle
    case 'completed':
      return SealCheck
    case 'cancelled':
      return XCircle
    case 'no_show':
      return WarningCircle
    case 'scheduled':
    default:
      return CalendarBlank
  }
}

function timeToDate(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(':').map(Number)
  const date = new Date()
  date.setHours(hours || 0, minutes || 0, 0, 0)
  return date
}

function getCalendarQueryRange(date: Date, view: CalendarView) {
  if (view === 'day') {
    const start = startOfDay(date)
    return { start: start.toISOString(), end: addDays(start, 1).toISOString() }
  }

  if (view === 'month') {
    const start = startOfWeek(startOfMonth(date))
    const end = addDays(endOfWeek(endOfMonth(date)), 1)
    return { start: start.toISOString(), end: end.toISOString() }
  }

  const start = startOfWeek(date)
  return { start: start.toISOString(), end: addDays(start, 7).toISOString() }
}

function renderAppointmentEvent({ event }: EventProps<AgendaCalendarEvent>) {
  const { appointment, conflictNames, color, end, start } = event
  const hasConflict = !!conflictNames?.length
  const patientFullName = normalizeName(appointment.patient?.name) || 'Paciente'
  const durationMin = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000))
  const isFifteenMinuteEvent = durationMin <= 15
  const isCompact = durationMin <= 30
  const StatusIcon = getStatusIcon(appointment.status)
  const conflictTitle = hasConflict ? `Conflito de horário com: ${conflictNames.join(', ')}` : undefined

  return (
    <div
      className={`relative flex h-full min-w-0 flex-col justify-center overflow-hidden px-1.5 py-1 ${hasConflict ? 'pr-5' : ''}`}
      style={{ color: getContrastingTextColor(color) }}
      title={conflictTitle ?? `${patientFullName} · ${APPOINTMENT_STATUS_LABELS[appointment.status]}`}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        {appointment.serviceType && (
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/80 shadow-sm"
            style={{ backgroundColor: appointment.serviceType.color }}
            role="img"
            aria-label={`Tipo de atendimento: ${appointment.serviceType.name}`}
            title={appointment.serviceType.name}
          />
        )}
        <p className={`min-w-0 font-bold leading-tight tracking-tight ${isFifteenMinuteEvent ? 'truncate text-[11px]' : isCompact ? 'line-clamp-2 text-[12px]' : 'line-clamp-2 text-[14px]'}`}>
          {patientFullName}
        </p>
      </div>
      {!isCompact && appointment.serviceType && (
        <p className="mt-0.5 truncate pl-4 text-[10px] font-medium opacity-85">{appointment.serviceType.name}</p>
      )}
      {hasConflict && <Warning size={13} weight="fill" className="absolute right-1 top-1 text-red-100 drop-shadow" aria-label={conflictTitle} />}
      <span className="sr-only"><StatusIcon />{APPOINTMENT_STATUS_LABELS[appointment.status]}</span>
    </div>
  )
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

function UnassignedRoomsModal({
  appointments,
  activeRooms,
  selectedRoomByAppointment,
  resolvingAppointmentId,
  cancelingAppointmentId,
  onSelectRoom,
  onAssignRoom,
  onEditAppointment,
  onCancelAppointment,
  onManageRooms,
  onClose,
}: {
  appointments: Appointment[]
  activeRooms: Array<{ id: string; name: string }>
  selectedRoomByAppointment: Record<string, string>
  resolvingAppointmentId: string | null
  cancelingAppointmentId: string | null
  onSelectRoom: (appointmentId: string, roomId: string) => void
  onAssignRoom: (appointmentId: string) => void
  onEditAppointment: (appointmentId: string) => void
  onCancelAppointment: (appointmentId: string) => void
  onManageRooms: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-[95vw] max-w-2xl max-h-[85vh] overflow-hidden">
        <div className="flex items-start justify-between mb-3">
          <p className="text-sm font-semibold text-gray-800">Resolver consultas sem sala</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          {appointments.length} consulta{appointments.length === 1 ? '' : 's'} sem sala neste período. Resolva aqui agora: vincule sala, edite ou cancele.
        </p>

        <div className="space-y-2 overflow-y-auto pr-1 max-h-[52vh]">
          {appointments.map(appointment => {
            const startsAt = new Date(appointment.startsAt)
            const selectedRoomId = selectedRoomByAppointment[appointment.id] ?? ''
            const isAssigning = resolvingAppointmentId === appointment.id
            const isCanceling = cancelingAppointmentId === appointment.id
            const isBusy = isAssigning || isCanceling

            return (
              <div key={appointment.id} className="rounded-xl border border-gray-200 bg-white p-3">
                <div className="mb-2 min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">{appointment.patient?.name ?? 'Paciente sem nome'}</p>
                  <p className="truncate text-xs text-gray-500">
                    {format(startsAt, 'dd/MM HH:mm')} · {appointment.professional?.name ?? 'Sem profissional'}
                  </p>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <select
                    value={selectedRoomId}
                    onChange={event => onSelectRoom(appointment.id, event.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]"
                    disabled={isBusy}
                  >
                    <option value="">Selecionar sala...</option>
                    {activeRooms.map(room => (
                      <option key={room.id} value={room.id}>{room.name}</option>
                    ))}
                  </select>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => onAssignRoom(appointment.id)}
                      disabled={!selectedRoomId || isBusy}
                      className="rounded-lg bg-[#006970] px-3 py-2 text-xs font-medium text-white hover:bg-[#00555b] disabled:opacity-50"
                    >
                      {isAssigning ? 'Salvando...' : 'Vincular sala'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onEditAppointment(appointment.id)}
                      disabled={isBusy}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => onCancelAppointment(appointment.id)}
                      disabled={isBusy}
                      className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {isCanceling ? 'Cancelando...' : 'Cancelar'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-4 border-t border-gray-100 pt-3 flex flex-col gap-2 sm:flex-row sm:justify-between">
          <button
            onClick={onManageRooms}
            className="w-full sm:w-auto px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Gerenciar salas completo
          </button>
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

function RoomsQuickFilterModal({
  open,
  activeRooms,
  selectedRoomId,
  onSelectRoom,
  onManageRooms,
  onClose,
}: {
  open: boolean
  activeRooms: Array<{ id: string; name: string }>
  selectedRoomId: string
  onSelectRoom: (roomId: string) => void
  onManageRooms: () => void
  onClose: () => void
}) {
  if (!open) return null

  const isAllSelected = selectedRoomId === ''
  const isUnassignedSelected = selectedRoomId === UNASSIGNED_ROOM_FILTER

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl p-5 w-[92vw] max-w-sm"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <p className="text-sm font-semibold text-gray-800">Filtro rápido de salas</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => onSelectRoom('')}
            className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
              isAllSelected
                ? 'border-[#0ea5b0] bg-[#0ea5b0]/10 text-[#006970]'
                : 'border-gray-200 text-gray-700 hover:border-[#0ea5b0]/40 hover:text-[#006970]'
            }`}
          >
            Todas as salas
          </button>
          <button
            type="button"
            onClick={() => onSelectRoom(UNASSIGNED_ROOM_FILTER)}
            className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
              isUnassignedSelected
                ? 'border-[#0ea5b0] bg-[#0ea5b0]/10 text-[#006970]'
                : 'border-gray-200 text-gray-700 hover:border-[#0ea5b0]/40 hover:text-[#006970]'
            }`}
          >
            Sem sala
          </button>
          {activeRooms.map(room => (
            <button
              key={room.id}
              type="button"
              onClick={() => onSelectRoom(room.id)}
              className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                selectedRoomId === room.id
                  ? 'border-[#0ea5b0] bg-[#0ea5b0]/10 text-[#006970]'
                  : 'border-gray-200 text-gray-700 hover:border-[#0ea5b0]/40 hover:text-[#006970]'
              }`}
            >
              {room.name}
            </button>
          ))}
        </div>

        <div className="mt-4 pt-3 border-t border-gray-100">
          <button
            type="button"
            onClick={onManageRooms}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Abrir gerenciamento completo
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function AgendaPage({ myOnly = false }: { myOnly?: boolean }) {
  const navigate = useNavigate()
  const today = new Date()
  const [calendarDate, setCalendarDate] = useState(today)

  const [calendarView, setCalendarView]           = useState<CalendarView>('week')
  const [dayBreakdown, setDayBreakdown]           = useState<DayBreakdown>('none')
  const [filterRoomId, setFilterRoomId]           = useState<string>('')
  const [filterProfId, setFilterProfId]           = useState<string>('')
  const [extendConfirm, setExtendConfirm]         = useState<ExtendConfirm | null>(null)
  const [closedSlotPending, setClosedSlotPending] = useState<ClosedSlotPending | null>(null)
  const [roomsQuickOpen, setRoomsQuickOpen]       = useState(false)
  const [unassignedPopupOpen, setUnassignedPopupOpen] = useState(false)
  const [lastUnassignedPromptCount, setLastUnassignedPromptCount] = useState(0)
  const [selectedRoomByAppointment, setSelectedRoomByAppointment] = useState<Record<string, string>>({})
  const [resolvingAppointmentId, setResolvingAppointmentId] = useState<string | null>(null)
  const [cancelingAppointmentId, setCancelingAppointmentId] = useState<string | null>(null)

  const { role, isSuperAdmin, profile } = useAuthContext()
  const { data: clinic, update: clinicUpdate } = useClinic()
  const { hasRooms } = useClinicModules()
  const { data: rooms = [] }              = useRooms()
  const { data: professionals = [] }      = useProfessionals()
  const { data: myProfRecords = [] }      = useMyProfessionalRecords()

  const { slotMin, slotMax, todayOpen, todayLabel } = useMemo(() => {
    const wh = clinic?.workingHours ?? {}
    const entries = Object.entries(wh)
    const starts = entries.map(([, h]) => h!.start).sort()
    const ends   = entries.map(([, h]) => h!.end).sort()
    const todayKey = DAY_ORDER[today.getDay() as 0|1|2|3|4|5|6]
    const todayHours = wh[todayKey as keyof typeof wh]
    return {
      slotMin: starts[0] ?? '07:00',
      slotMax: ends[ends.length - 1] ?? '20:00',
      todayOpen: !!todayHours,
      todayLabel: todayHours ? `Aberta · ${todayHours.start}–${todayHours.end}` : 'Fechada hoje',
    }
  }, [clinic?.workingHours])

  const isPersonalView = myOnly || role === 'professional'
  const calendarDisplay = useMemo(() => {
    const visibleDays = clinic?.calendarVisibleDays?.length
      ? clinic.calendarVisibleDays
      : [0, 1, 2, 3, 4, 5, 6]

    return {
      visibleDays,
      slotMin: clinic?.calendarDisplayStartTime ?? slotMin,
      slotMax: clinic?.calendarDisplayEndTime ?? slotMax,
    }
  }, [clinic?.calendarDisplayEndTime, clinic?.calendarDisplayStartTime, clinic?.calendarVisibleDays, slotMin, slotMax])
  const activeRooms = rooms.filter(r => r.active)
  const activeProfessionals = professionals.filter(p => p.active)
  const currentClinicProfessionalIds = myProfRecords
    .filter(record => record.clinicId === profile?.clinicId)
    .map(record => record.id)
  const personalProfessionalFilter = currentClinicProfessionalIds.length > 0
    ? currentClinicProfessionalIds
    : myProfRecords.map(record => record.id)
  const queryProfessionalFilter = isPersonalView
    ? personalProfessionalFilter
    : (filterProfId || null)
  // Keep data loading tied to the controlled calendar state. React Big Calendar
  // can omit range-change callbacks during controlled navigation, which otherwise
  // leaves the agenda rendering a new period with the previous period's data.
  const calendarRange = useMemo(
    () => getCalendarQueryRange(calendarDate, calendarView),
    [calendarDate, calendarView],
  )

  const { data: appointments = [], isLoading } = useAppointmentsQuery(
    calendarRange.start,
    calendarRange.end,
    queryProfessionalFilter,
  )
  const { update, cancel } = useAppointmentMutations()

  const clinicColorMap = Object.fromEntries(
    myProfRecords.map((r, i) => [r.clinicId, CLINIC_PALETTE[i % CLINIC_PALETTE.length]])
  )
  const multiClinic = myProfRecords.length > 1

  const filteredAppointments = useMemo(() => (
    (appointments as (Appointment & { clinicName?: string | null })[]).filter(appointment => {
      if (filterRoomId === UNASSIGNED_ROOM_FILTER && appointment.roomId) return false
      if (filterRoomId && filterRoomId !== UNASSIGNED_ROOM_FILTER && appointment.roomId !== filterRoomId) return false
      if (!isPersonalView && filterProfId && appointment.professionalId !== filterProfId) return false
      return true
    })
  ), [appointments, filterProfId, filterRoomId, isPersonalView])

  // Overlaps are allowed (a professional may intentionally double-book — e.g. covering
  // no-shows or running two patients in parallel) but flagged visually so nothing is hidden.
  const conflictMap = useMemo(() => {
    const map = new Map<string, string[]>()
    const active = (appointments as Appointment[]).filter(
      a => a.status !== 'cancelled' && a.status !== 'no_show' && a.professionalId
    )
    for (let i = 0; i < active.length; i++) {
      const a = active[i]
      const aStart = new Date(a.startsAt).getTime()
      const aEnd = new Date(a.endsAt).getTime()
      for (let j = i + 1; j < active.length; j++) {
        const b = active[j]
        if (a.professionalId !== b.professionalId) continue
        const bStart = new Date(b.startsAt).getTime()
        const bEnd = new Date(b.endsAt).getTime()
        if (aStart < bEnd && bStart < aEnd) {
          const aName = normalizeName(a.patient?.name) || 'Paciente'
          const bName = normalizeName(b.patient?.name) || 'Paciente'
          map.set(a.id, [...(map.get(a.id) ?? []), bName])
          map.set(b.id, [...(map.get(b.id) ?? []), aName])
        }
      }
    }
    return map
  }, [appointments])

  const unassignedAppointments = useMemo(
    () => (appointments as Appointment[]).filter(appointment => !appointment.roomId && appointment.status !== 'cancelled'),
    [appointments],
  )

  const unassignedAppointmentsCount = unassignedAppointments.length

  useEffect(() => {
    if (!hasRooms) return
    if (activeRooms.length === 0) return
    if (unassignedAppointmentsCount <= 0) return
    if (unassignedAppointmentsCount === lastUnassignedPromptCount) return

    setUnassignedPopupOpen(true)
    setLastUnassignedPromptCount(unassignedAppointmentsCount)
  }, [
    activeRooms.length,
    hasRooms,
    lastUnassignedPromptCount,
    unassignedAppointmentsCount,
  ])

  useEffect(() => {
    if (!unassignedPopupOpen) return
    if (activeRooms.length === 0) return

    const defaultRoomId = activeRooms[0].id
    setSelectedRoomByAppointment(prev =>
      fillMissingRoomSelections(prev, unassignedAppointments, defaultRoomId),
    )
  }, [activeRooms, unassignedAppointments, unassignedPopupOpen])

  const [modalOpen, setModalOpen]           = useState(false)
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false)
  const [editingAppt, setEditingAppt]       = useState<Appointment | null>(null)
  const [initialSlot, setInitialSlot]       = useState<{
    date: string
    time: string
    durationMin: number
    professionalId?: string
    roomId?: string
  } | null>(null)
  const quota = useClinicQuota(clinic)

  const dayBreakdownResources = useMemo(() => {
    if (calendarView !== 'day' || dayBreakdown === 'none') return undefined

    if (dayBreakdown === 'room') {
      const resources: AgendaCalendarResource[] = []
      const roomSource = filterRoomId
        ? activeRooms.filter(room => room.id === filterRoomId)
        : activeRooms

      resources.push(...roomSource.map(room => ({ id: room.id, title: room.name, color: room.color })))

      const hasUnassignedRoomAppointments = filteredAppointments.some(appointment => !appointment.roomId)
      if (hasUnassignedRoomAppointments) {
        resources.push({ id: '__no_room__', title: 'Sem sala' })
      }

      return resources
    }

    const professionalIds = isPersonalView
      ? personalProfessionalFilter
      : (filterProfId ? [filterProfId] : activeProfessionals.map(professional => professional.id))
    const professionalSource = activeProfessionals.filter(professional => professionalIds.includes(professional.id))
    const resources = professionalSource.map(professional => ({ id: professional.id, title: professional.name }))

    const hasUnassignedProfessionalAppointments = filteredAppointments.some(appointment => !appointment.professionalId)
    if (hasUnassignedProfessionalAppointments) {
      resources.push({ id: '__no_prof__', title: 'Sem profissional' })
    }

    return resources
  }, [
    activeProfessionals,
    activeRooms,
    dayBreakdown,
    filterProfId,
    filterRoomId,
    filteredAppointments,
    isPersonalView,
    personalProfessionalFilter,
  ])

  function openNewAppointmentModal() {
    if (quota.subscriptionRequired || quota.exceeded) {
      setUpgradeModalOpen(true)
      return
    }
    setModalOpen(true)
  }

  const events: AgendaCalendarEvent[] = filteredAppointments.map(a => {
    const color = a.clinicRoom?.color
      ?? (multiClinic ? (clinicColorMap[a.clinicId] ?? '#6366f1') : STATUS_COLORS[a.status])
    const title = multiClinic && a.clinicName
      ? `[${a.clinicName}] ${a.patient?.name ?? 'Paciente'}`
      : (a.patient?.name ?? 'Paciente')
    return {
      id: a.id, title,
      start: new Date(a.startsAt), end: new Date(a.endsAt),
      color,
      ...(calendarView === 'day' && dayBreakdown !== 'none'
        ? {
            resourceId: dayBreakdown === 'room'
              ? (a.roomId ?? '__no_room__')
              : (a.professionalId ?? '__no_prof__'),
          }
        : {}),
      appointment: a,
      conflictNames: conflictMap.get(a.id),
    }
  })

  function handleDateSelect(arg: SlotInfo) {
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
    const initialProfessionalId = dayBreakdown === 'professional'
      ? (arg.resourceId && arg.resourceId !== '__no_prof__' ? String(arg.resourceId) : '')
      : (filterProfId || (isPersonalView ? (personalProfessionalFilter[0] ?? '') : ''))
    const initialRoomId = dayBreakdown === 'room'
      ? (arg.resourceId && arg.resourceId !== '__no_room__' ? String(arg.resourceId) : '')
      : filterRoomId
    setEditingAppt(null)
    setInitialSlot({
      date: format(arg.start, 'yyyy-MM-dd'),
      time: format(arg.start, 'HH:mm'),
      durationMin,
      professionalId: initialProfessionalId,
      roomId: initialRoomId,
    })
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

  function handleEventClick(event: AgendaCalendarEvent) {
    setEditingAppt(event.appointment)
    setInitialSlot(null)
    setModalOpen(true)
  }

  async function handleEventDrop({ event, start, resourceId }: EventInteractionArgs<AgendaCalendarEvent>) {
    if (update.isPending) return
    const appt = event.appointment
    const newStart = new Date(start)
    const movedRoomId = dayBreakdown === 'room' && resourceId
      ? (resourceId === '__no_room__' ? null : String(resourceId))
      : appt.roomId
    const movedProfessionalId = dayBreakdown === 'professional' && resourceId
      ? (resourceId === '__no_prof__' ? appt.professionalId : String(resourceId))
      : appt.professionalId
    const diffMs = new Date(appt.endsAt).getTime() - new Date(appt.startsAt).getTime()
    try {
      await update.mutateAsync({
        id: appt.id, patientId: appt.patientId,
        professionalId: movedProfessionalId,
        startsAt: newStart.toISOString(),
        endsAt: new Date(newStart.getTime() + diffMs).toISOString(),
        status: appt.status, notes: appt.notes,
        chargeAmountCents: appt.chargeAmountCents,
        roomId: movedRoomId,
        serviceTypeId: appt.serviceTypeId,
        professionalFeeCents: appt.professionalFeeCents,
      })
      toast.success('Consulta remarcada')
    } catch (error) {
      toast.error(getAppointmentSaveErrorMessage(error, 'Não foi possível remarcar a consulta'))
    }
  }

  async function handleEventResize({ event, end }: EventInteractionArgs<AgendaCalendarEvent>) {
    if (update.isPending) return
    const appt = event.appointment
    const newEnd = new Date(end)
    const dayKey = DAY_ORDER[newEnd.getDay() as 0|1|2|3|4|5|6]
    const clinicEnd = clinic?.workingHours?.[dayKey]?.end
    if (clinicEnd) {
      const [ch, cm] = clinicEnd.split(':').map(Number)
      const newEndMin = newEnd.getHours() * 60 + newEnd.getMinutes()
      if (newEndMin > ch * 60 + cm) {
        const hh = String(newEnd.getHours()).padStart(2, '0')
        const mm = String(newEnd.getMinutes()).padStart(2, '0')
        setExtendConfirm({ appt, newEndsAt: newEnd.toISOString(), dayKey, newEndTime: `${hh}:${mm}` })
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
    } catch (error) {
      toast.error(getAppointmentSaveErrorMessage(error, 'Não foi possível atualizar a consulta'))
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
    } catch (error) {
      toast.error(getAppointmentSaveErrorMessage(error, 'Não foi possível salvar a consulta'))
    }
  }

  function handleEditUnassignedAppointment(appointmentId: string) {
    const appointment = unassignedAppointments.find(item => item.id === appointmentId)
    if (!appointment) return
    setEditingAppt(appointment)
    setInitialSlot(null)
    setUnassignedPopupOpen(false)
    setModalOpen(true)
  }

  async function handleAssignRoomToAppointment(appointmentId: string) {
    const roomId = selectedRoomByAppointment[appointmentId]
    if (!roomId) {
      toast.error('Selecione uma sala para vincular')
      return
    }

    const appointment = unassignedAppointments.find(item => item.id === appointmentId)
    if (!appointment) {
      toast.error('Consulta não encontrada na lista atual')
      return
    }

    setResolvingAppointmentId(appointmentId)
    try {
      await update.mutateAsync({
        id: appointment.id,
        patientId: appointment.patientId,
        professionalId: appointment.professionalId,
        startsAt: appointment.startsAt,
        endsAt: appointment.endsAt,
        status: appointment.status,
        notes: appointment.notes,
        chargeAmountCents: appointment.chargeAmountCents,
        roomId,
        serviceTypeId: appointment.serviceTypeId,
        professionalFeeCents: appointment.professionalFeeCents,
      })
      toast.success('Sala vinculada com sucesso')
    } catch (error) {
      toast.error(getAppointmentSaveErrorMessage(error, 'Não foi possível vincular a sala'))
    } finally {
      setResolvingAppointmentId(null)
    }
  }

  async function handleCancelUnassignedAppointment(appointmentId: string) {
    setCancelingAppointmentId(appointmentId)
    try {
      await cancel.mutateAsync(appointmentId)
      toast.success('Consulta cancelada')
    } catch (error) {
      toast.error(getAppointmentSaveErrorMessage(error, 'Não foi possível cancelar a consulta'))
    } finally {
      setCancelingAppointmentId(null)
    }
  }

  const pageTitle = isPersonalView ? 'Minha Agenda' : 'Agenda'
  const todayHeadline = format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })
  const hideWeekend = !calendarDisplay.visibleDays.includes(0) && !calendarDisplay.visibleDays.includes(6)
  const rbcView: View = calendarView === 'week' && hideWeekend ? 'work_week' : calendarView
  const calendarViews: View[] = hideWeekend
    ? ['week', 'work_week', 'day']
    : ['month', 'week', 'work_week', 'day']
  const calendarPeriodLabel = calendarView === 'month'
    ? format(calendarDate, "MMMM 'de' yyyy", { locale: ptBR })
    : calendarView === 'week'
      ? `${format(startOfWeek(calendarDate), 'dd/MM')} – ${format(endOfWeek(calendarDate), 'dd/MM')}`
      : format(calendarDate, "EEEE, d 'de' MMMM", { locale: ptBR })

  function handleCalendarNavigate(nextDate: Date) {
    setCalendarDate(nextDate)
  }

  function navigateCalendar(direction: -1 | 1) {
    const nextDate = calendarView === 'month'
      ? addMonths(calendarDate, direction)
      : calendarView === 'week'
        ? addWeeks(calendarDate, direction)
        : addDays(calendarDate, direction)
    setCalendarDate(nextDate)
  }

  function handleViewChange(nextView: CalendarView) {
    setCalendarView(nextView)
  }

  useEffect(() => {
    if (hideWeekend && calendarView === 'month') setCalendarView('week')
  }, [calendarView, hideWeekend])

  function handleDayBreakdownChange(nextBreakdown: DayBreakdown) {
    setDayBreakdown(nextBreakdown)
  }

  return (
    <div className="space-y-4">
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
          {hasRooms && activeRooms.length > 1 && (
            <label className="flex min-h-11 w-full min-w-[210px] flex-col justify-center rounded-xl border border-gray-200 bg-[#f8fafb] px-3 py-2 text-xs font-medium text-gray-500 sm:w-auto">
              Sala
              <select
                value={filterRoomId}
                onChange={e => setFilterRoomId(e.target.value)}
                className="mt-0.5 bg-transparent text-sm font-semibold text-gray-700 focus:outline-none"
              >
                <option value="">Todas as salas</option>
                <option value={UNASSIGNED_ROOM_FILTER}>Sem sala</option>
                {activeRooms.map(room => (
                  <option key={room.id} value={room.id}>{room.name}</option>
                ))}
              </select>
            </label>
          )}
          {!isPersonalView && activeProfessionals.length > 1 && (
            <label className="flex min-h-11 w-full min-w-[230px] flex-col justify-center rounded-xl border border-gray-200 bg-[#f8fafb] px-3 py-2 text-xs font-medium text-gray-500 sm:w-auto">
              Profissional
              <select
                value={filterProfId}
                onChange={e => setFilterProfId(e.target.value)}
                className="mt-0.5 bg-transparent text-sm font-semibold text-gray-700 focus:outline-none"
              >
                <option value="">Todos os profissionais</option>
                {activeProfessionals.map(professional => (
                  <option key={professional.id} value={professional.id}>{professional.name}</option>
                ))}
              </select>
            </label>
          )}
          <label className="flex min-h-11 w-full min-w-[190px] flex-col justify-center rounded-xl border border-gray-200 bg-[#f8fafb] px-3 py-2 text-xs font-medium text-gray-500 sm:w-auto">
            Visualização
            <select
              value={calendarView}
              onChange={e => handleViewChange(e.target.value as CalendarView)}
              className="mt-0.5 bg-transparent text-sm font-semibold text-gray-700 focus:outline-none"
            >
              <option value="day">Dia</option>
              <option value="week">Semana</option>
              {!hideWeekend && <option value="month">Mês</option>}
            </select>
          </label>
          <div className="flex min-h-11 items-center gap-1 rounded-xl border border-gray-200 bg-[#f8fafb] px-1.5 py-1 sm:ml-auto" aria-label="Navegação do calendário">
            <button type="button" onClick={() => navigateCalendar(-1)} className="rounded-lg p-2 text-gray-600 transition hover:bg-white hover:text-[#006970]" aria-label="Período anterior">
              <CaretLeft size={16} />
            </button>
            <button type="button" onClick={() => setCalendarDate(new Date())} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-[#006970] transition hover:bg-white">
              Hoje
            </button>
            <button type="button" onClick={() => navigateCalendar(1)} className="rounded-lg p-2 text-gray-600 transition hover:bg-white hover:text-[#006970]" aria-label="Próximo período">
              <CaretRight size={16} />
            </button>
          </div>
          {calendarView === 'day' && (
            <label className="flex min-h-11 w-full min-w-[210px] flex-col justify-center rounded-xl border border-gray-200 bg-[#f8fafb] px-3 py-2 text-xs font-medium text-gray-500 sm:w-auto">
              Breakdown
              <select
                value={dayBreakdown}
                onChange={e => handleDayBreakdownChange(e.target.value as DayBreakdown)}
                className="mt-0.5 bg-transparent text-sm font-semibold text-gray-700 focus:outline-none"
              >
                <option value="none">Sem breakdown</option>
                <option value="room">Por sala</option>
                <option value="professional">Por profissional</option>
              </select>
            </label>
          )}
          {hasRooms && (role === 'admin' || isSuperAdmin) && (
            <button
              onClick={() => setRoomsQuickOpen(true)}
              className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-[#f8fafb] px-3 py-2.5 text-sm text-gray-600 transition-colors hover:border-[#0ea5b0]/40 hover:text-[#0ea5b0] sm:w-auto"
            >
              <DoorOpen size={14} /> Salas rápidas
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
        <div className="flex items-center gap-2 px-4 py-2.5 bg-teal-50 border border-teal-100 rounded-xl text-xs text-[#006970]">
          <Lock size={13} className="shrink-0 text-[#0ea5b0]" />
          <span>Você está vendo apenas suas próprias consultas.</span>
        </div>
      )}

      <div className={`overflow-hidden rounded-xl border border-gray-100 bg-white p-4 ${isLoading ? 'opacity-60' : ''}`}>
        <div className="mb-3 flex items-center justify-between gap-3 px-1">
          <h2 className="capitalize text-base font-semibold text-gray-800">{calendarPeriodLabel}</h2>
          {hideWeekend && calendarView === 'week' && <span className="text-xs text-gray-500">Segunda a sexta</span>}
        </div>
        <DragAndDropCalendar
          localizer={localizer}
          culture="pt-BR"
          date={calendarDate}
          view={rbcView}
          views={calendarViews}
          toolbar={false}
          events={events}
          resources={dayBreakdownResources}
          resourceAccessor="resourceId"
          resourceIdAccessor="id"
          resourceTitleAccessor="title"
          onNavigate={handleCalendarNavigate}
          onView={view => setCalendarView(view === 'work_week' ? 'week' : view as CalendarView)}
          onSelectSlot={handleDateSelect}
          onSelectEvent={handleEventClick}
          onEventDrop={handleEventDrop}
          onEventResize={handleEventResize}
          selectable={!isPersonalView && calendarView !== 'month'}
          resizable={!isPersonalView}
          draggableAccessor={() => !isPersonalView}
          resizableAccessor={() => !isPersonalView}
          step={15}
          timeslots={2}
          min={timeToDate(calendarDisplay.slotMin)}
          max={timeToDate(calendarDisplay.slotMax)}
          scrollToTime={timeToDate(calendarDisplay.slotMin)}
          dayLayoutAlgorithm="no-overlap"
          showAllEvents
          popup
          components={{ event: renderAppointmentEvent }}
          eventPropGetter={event => ({
            className: 'consultin-agenda-event',
            style: { backgroundColor: event.color, borderColor: event.color, color: getContrastingTextColor(event.color) },
          })}
          formats={{
            timeGutterFormat: date => format(date, 'HH:mm'),
            dayHeaderFormat: date => format(date, "EEEE, dd/MM", { locale: ptBR }),
            weekdayFormat: date => format(date, 'EEE', { locale: ptBR }),
            dayRangeHeaderFormat: ({ start, end }) => `${format(start, 'dd/MM')} – ${format(end, 'dd/MM')}`,
          }}
          messages={{ showMore: count => `+${count} consultas`, noEventsInRange: 'Nenhuma consulta neste período' }}
          style={{ height: 820 }}
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
        initialRoomId={initialSlot?.roomId}
      />

      {extendConfirm && (
        <ExtendModal
          data={extendConfirm}
          onJustThis={() => commitExtend(false)}
          onAlways={() => commitExtend(true)}
          onCancel={() => setExtendConfirm(null)}
        />
      )}

      <RoomsQuickFilterModal
        open={roomsQuickOpen}
        activeRooms={activeRooms.map(room => ({ id: room.id, name: room.name }))}
        selectedRoomId={filterRoomId}
        onSelectRoom={roomId => {
          setFilterRoomId(roomId)
          setRoomsQuickOpen(false)
        }}
        onManageRooms={() => {
          setRoomsQuickOpen(false)
          navigate(APP_ROUTES.staff.rooms)
        }}
        onClose={() => setRoomsQuickOpen(false)}
      />

      {unassignedPopupOpen && (
        <UnassignedRoomsModal
          appointments={unassignedAppointments}
          activeRooms={activeRooms.map(room => ({ id: room.id, name: room.name }))}
          selectedRoomByAppointment={selectedRoomByAppointment}
          resolvingAppointmentId={resolvingAppointmentId}
          cancelingAppointmentId={cancelingAppointmentId}
          onSelectRoom={(appointmentId, roomId) => {
            setSelectedRoomByAppointment(prev => ({ ...prev, [appointmentId]: roomId }))
          }}
          onAssignRoom={handleAssignRoomToAppointment}
          onEditAppointment={handleEditUnassignedAppointment}
          onCancelAppointment={handleCancelUnassignedAppointment}
          onManageRooms={() => {
            setUnassignedPopupOpen(false)
            navigate(APP_ROUTES.staff.rooms)
          }}
          onClose={() => setUnassignedPopupOpen(false)}
        />
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
