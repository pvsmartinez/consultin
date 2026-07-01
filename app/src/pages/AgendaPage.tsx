import { useState, useRef, useMemo, useEffect } from 'react'
import FullCalendar from '@fullcalendar/react'
import interactionPlugin from '@fullcalendar/interaction'
import dayGridPlugin from '@fullcalendar/daygrid'
import resourceTimeGridPlugin from '@fullcalendar/resource-timegrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import type { EventClickArg, EventContentArg, EventInput } from '@fullcalendar/core'
import { format, addMinutes, startOfWeek, endOfWeek } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  CalendarBlank,
  CheckCircle,
  DoorOpen,
  Lock,
  Plus,
  SealCheck,
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
import { useRoomAvailabilitySlots, useClinicAvailabilitySlots } from '../hooks/useRoomAvailability'
import AppointmentModal from '../components/appointments/AppointmentModal'
import UpgradeModal from '../components/billing/UpgradeModal'
import { useClinicQuota } from '../hooks/useClinicQuota'
import { APPOINTMENT_STATUS_LABELS, type Appointment, type AppointmentStatus } from '../types'
import { getAppointmentSaveErrorMessage } from '../utils/appointmentErrors'
import { APP_ROUTES } from '../lib/appRoutes'

const DAY_ORDER = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
type DayKey = typeof DAY_ORDER[number]
const DAY_FC: Record<DayKey, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }
const PT_DAY_LABELS: Record<DayKey, string> = {
  sun: 'Domingo', mon: 'Segunda', tue: 'Terça', wed: 'Quarta',
  thu: 'Quinta', fri: 'Sexta', sat: 'Sábado',
}
type CalendarView = 'timeGridDay' | 'timeGridWeek' | 'dayGridMonth'
type DayBreakdown = 'none' | 'room' | 'professional'
type ResolvedCalendarView = CalendarView | 'resourceTimeGridDay'

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

function stripProfessionalPrefix(name: string) {
  return name.replace(/^(dr\.?|dra\.?|doutor|doutora)\s+/i, '').trim()
}

function formatProfessionalDisplayName(name: string | null | undefined) {
  const cleanName = stripProfessionalPrefix(normalizeName(name) || 'Profissional')
  return `Dr. ${cleanName}`
}

function shortenWithEllipsis(value: string, maxLength: number) {
  if (value.length <= maxLength) return value
  return `${value.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`
}

function formatPatientDisplayName(name: string | null | undefined, maxLength = 24) {
  const cleanName = normalizeName(name) || 'Paciente'
  const parts = cleanName.split(' ').filter(Boolean)
  if (parts.length <= 1) return shortenWithEllipsis(cleanName, maxLength)

  const firstAndLast = `${parts[0]} ${parts[parts.length - 1]}`
  if (firstAndLast.length <= maxLength) return firstAndLast

  const abbreviatedLast = `${parts[0]} ${parts[parts.length - 1][0]}.`
  if (abbreviatedLast.length <= maxLength) return abbreviatedLast

  return shortenWithEllipsis(parts[0], maxLength)
}

function getNameInitials(name: string | null | undefined) {
  const parts = normalizeName(name).split(' ').filter(Boolean)
  return (parts.length ? parts : ['P'])
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('')
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

function minutesToFcDuration(totalMinutes: number) {
  const safeMinutes = Math.max(5, totalMinutes)
  const hours = Math.floor(safeMinutes / 60)
  const minutes = safeMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`
}

function renderAppointmentEvent(arg: EventContentArg) {
  const appointment = arg.event.extendedProps.appointment as Appointment | undefined
  if (!appointment) {
    return <span className="truncate px-1 text-xs font-medium">{arg.event.title}</span>
  }

  const isMonthView = arg.view.type === 'dayGridMonth'
  const cardColor = appointment.clinicRoom?.color ?? arg.event.backgroundColor ?? STATUS_COLORS[appointment.status]
  const textColor = getContrastingTextColor(cardColor)
  const mutedTextColor = textColor === '#ffffff' ? 'rgba(255,255,255,0.82)' : 'rgba(15,23,42,0.72)'
  const statusColor = STATUS_COLORS[appointment.status]
  const StatusIcon = getStatusIcon(appointment.status)
  const professionalName = formatProfessionalDisplayName(appointment.professional?.name)
  const patientShortName = formatPatientDisplayName(appointment.patient?.name)
  const patientFullName = normalizeName(appointment.patient?.name) || 'Paciente'
  const photoUrl = appointment.professional?.photoUrl ?? null
  const professionalInitials = getNameInitials(appointment.professional?.name)
  const compactProfessionalName = shortenWithEllipsis(professionalName, 18)
  const eventStart = arg.event.start
  const eventEnd = arg.event.end
  const durationMin = eventStart && eventEnd
    ? Math.max(1, Math.round((eventEnd.getTime() - eventStart.getTime()) / 60000))
    : 30
  const isShortEvent = durationMin <= 30

  if (isMonthView) {
    return (
      <div
        className="flex h-full items-center gap-1.5 overflow-hidden rounded-md px-2 py-1"
        style={{ backgroundColor: cardColor, color: textColor }}
        title={`${professionalName} · ${patientFullName}`}
      >
        <span
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white/95 shadow-sm"
          style={{ color: statusColor }}
          aria-label={APPOINTMENT_STATUS_LABELS[appointment.status]}
        >
          <StatusIcon size={10} weight="fill" />
        </span>
        <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/70 bg-white/20 text-[9px] font-semibold">
          {photoUrl ? (
            <img src={photoUrl} alt={professionalName} className="h-full w-full object-cover" />
          ) : (
            professionalInitials
          )}
        </span>
        <span className="truncate text-[11px] font-semibold">{patientShortName}</span>
      </div>
    )
  }

  if (isShortEvent) {
    return (
      <div
        className="relative isolate h-full min-h-[24px] overflow-hidden rounded-[10px] px-2 py-1"
        style={{ backgroundColor: cardColor, color: textColor }}
        title={`${professionalName} · ${patientFullName}`}
      >
        <div className="flex h-full min-w-0 items-center gap-1.5">
          <span
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white/95 shadow-sm"
            style={{ color: statusColor }}
            aria-label={APPOINTMENT_STATUS_LABELS[appointment.status]}
            title={APPOINTMENT_STATUS_LABELS[appointment.status]}
          >
            <StatusIcon size={10} weight="fill" />
          </span>
          <p className="truncate text-[10px] font-semibold leading-none" style={{ color: mutedTextColor }}>
            {arg.timeText}
          </p>
          <p className="truncate text-[12px] font-semibold leading-none" title={patientFullName}>
            {patientShortName}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="relative isolate h-full min-h-[56px] overflow-hidden rounded-[14px] px-2.5 py-2"
      style={{ backgroundColor: cardColor, color: textColor }}
      title={`${professionalName} · ${patientFullName}`}
    >
      <span
        className="absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-white/95 shadow-sm"
        style={{ color: statusColor }}
        aria-label={APPOINTMENT_STATUS_LABELS[appointment.status]}
        title={APPOINTMENT_STATUS_LABELS[appointment.status]}
      >
        <StatusIcon size={13} weight="fill" />
      </span>

      <span className="absolute bottom-2 left-2 z-10 flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border-2 border-white/70 bg-white/15 text-[10px] font-semibold shadow-sm">
        {photoUrl ? (
          <img src={photoUrl} alt={professionalName} className="h-full w-full object-cover" />
        ) : (
          professionalInitials
        )}
      </span>

      <div className="flex h-full min-w-0 flex-col justify-between pl-10 pr-1">
        <div className="min-w-0">
          <p className="truncate text-[8px] font-semibold uppercase tracking-[0.16em]" style={{ color: mutedTextColor }}>
            {APPOINTMENT_STATUS_LABELS[appointment.status]}
          </p>
          <p className="mt-1 truncate text-[10px] font-semibold uppercase tracking-[0.1em] leading-none" style={{ color: mutedTextColor }} title={professionalName}>
            {compactProfessionalName}
          </p>
        </div>

        <div className="min-w-0">
          <p className="truncate text-[10px] font-semibold leading-none" style={{ color: mutedTextColor }}>
            {arg.timeText}
          </p>
          <p className="mt-1 truncate text-[14px] font-semibold leading-none tracking-tight" title={patientFullName}>
            {patientShortName}
          </p>
        </div>
      </div>
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
  const calendarRef = useRef<FullCalendar>(null)
  const today = new Date()
  const [range, setRange] = useState({
    start: startOfWeek(today).toISOString(),
    end: endOfWeek(today).toISOString(),
  })

  const [calendarView, setCalendarView]           = useState<CalendarView>('timeGridWeek')
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

  const { data: appointments = [], isLoading } = useAppointmentsQuery(range.start, range.end, queryProfessionalFilter)
  const { update, cancel } = useAppointmentMutations()

  const clinicColorMap = Object.fromEntries(
    myProfRecords.map((r, i) => [r.clinicId, CLINIC_PALETTE[i % CLINIC_PALETTE.length]])
  )
  const multiClinic = myProfRecords.length > 1

  const calendarBusinessHours = useMemo(() => {
    if (filterRoomId) {
      const selectedRoomSlots = roomAvailSlots.filter(slot => slot.roomId === filterRoomId)
      const selectedRoomHours = slotsToResourceBusinessHours(
        selectedRoomSlots.map(slot => ({
          weekday: slot.weekday,
          startTime: slot.startTime,
          endTime: slot.endTime,
        }))
      )
      if (selectedRoomHours?.length) return selectedRoomHours
    }

    if (filterProfId) {
      const selectedProfessionalSlots = clinicAvailSlots.filter(slot => slot.professional_id === filterProfId)
      const selectedProfessionalHours = slotsToResourceBusinessHours(
        selectedProfessionalSlots.map(slot => ({
          weekday: slot.weekday,
          startTime: slot.start_time,
          endTime: slot.end_time,
        }))
      )
      if (selectedProfessionalHours?.length) return selectedProfessionalHours
    }

    return businessHours
  }, [businessHours, clinicAvailSlots, filterProfId, filterRoomId, roomAvailSlots])

  const filteredAppointments = useMemo(() => (
    (appointments as (Appointment & { clinicName?: string | null })[]).filter(appointment => {
      if (filterRoomId === UNASSIGNED_ROOM_FILTER && appointment.roomId) return false
      if (filterRoomId && filterRoomId !== UNASSIGNED_ROOM_FILTER && appointment.roomId !== filterRoomId) return false
      if (!isPersonalView && filterProfId && appointment.professionalId !== filterProfId) return false
      return true
    })
  ), [appointments, filterProfId, filterRoomId, isPersonalView])

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
    setSelectedRoomByAppointment(prev => {
      const next = { ...prev }
      unassignedAppointments.forEach(appointment => {
        if (!next[appointment.id]) next[appointment.id] = defaultRoomId
      })
      return next
    })
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

  const resolvedCalendarView: ResolvedCalendarView = calendarView === 'timeGridDay' && dayBreakdown !== 'none'
    ? 'resourceTimeGridDay'
    : calendarView

  const dayBreakdownResources = useMemo(() => {
    if (resolvedCalendarView !== 'resourceTimeGridDay') return undefined

    if (dayBreakdown === 'room') {
      const resources: Array<{
        id: string
        title: string
        eventColor?: string
        businessHours?: FCBusinessHour[]
      }> = []
      const roomSource = filterRoomId
        ? activeRooms.filter(room => room.id === filterRoomId)
        : activeRooms

      resources.push(...roomSource.map(room => {
        const roomSlots = roomAvailSlots.filter(slot => slot.roomId === room.id)
        const resourceBusinessHours = slotsToResourceBusinessHours(
          roomSlots.map(slot => ({
            weekday: slot.weekday,
            startTime: slot.startTime,
            endTime: slot.endTime,
          }))
        )
        return {
          id: room.id,
          title: room.name,
          eventColor: room.color,
          ...(resourceBusinessHours ? { businessHours: resourceBusinessHours } : {}),
        }
      }))

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
    const resources = professionalSource.map(professional => {
      const professionalSlots = clinicAvailSlots.filter(slot => slot.professional_id === professional.id)
      const resourceBusinessHours = slotsToResourceBusinessHours(
        professionalSlots.map(slot => ({
          weekday: slot.weekday,
          startTime: slot.start_time,
          endTime: slot.end_time,
        }))
      )
      return {
        id: professional.id,
        title: professional.name,
        ...(resourceBusinessHours ? { businessHours: resourceBusinessHours } : {}),
      }
    })

    const hasUnassignedProfessionalAppointments = filteredAppointments.some(appointment => !appointment.professionalId)
    if (hasUnassignedProfessionalAppointments) {
      resources.push({ id: '__no_prof__', title: 'Sem profissional' })
    }

    return resources
  }, [
    activeProfessionals,
    activeRooms,
    clinicAvailSlots,
    dayBreakdown,
    filterProfId,
    filterRoomId,
    filteredAppointments,
    isPersonalView,
    personalProfessionalFilter,
    resolvedCalendarView,
    roomAvailSlots,
  ])

  function openNewAppointmentModal() {
    if (quota.subscriptionRequired || quota.exceeded) {
      setUpgradeModalOpen(true)
      return
    }
    setModalOpen(true)
  }

  const events: EventInput[] = filteredAppointments.map(a => {
    const color = a.clinicRoom?.color
      ?? (multiClinic ? (clinicColorMap[a.clinicId] ?? '#6366f1') : STATUS_COLORS[a.status])
    const title = multiClinic && a.clinicName
      ? `[${a.clinicName}] ${a.patient?.name ?? 'Paciente'}`
      : (a.patient?.name ?? 'Paciente')
    return {
      id: a.id, title,
      start: a.startsAt, end: a.endsAt,
      backgroundColor: color, borderColor: color,
      ...(resolvedCalendarView === 'resourceTimeGridDay'
        ? {
            resourceId: dayBreakdown === 'room'
              ? (a.roomId ?? '__no_room__')
              : (a.professionalId ?? '__no_prof__'),
          }
        : {}),
      extendedProps: { appointment: a },
    }
  })

  function handleDateSelect(arg: {
    start: Date
    end: Date
    startStr: string
    endStr: string
    allDay: boolean
    resource?: { id: string }
  }) {
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
      ? (arg.resource?.id && arg.resource.id !== '__no_prof__' ? arg.resource.id : '')
      : (filterProfId || (isPersonalView ? (personalProfessionalFilter[0] ?? '') : ''))
    const initialRoomId = dayBreakdown === 'room'
      ? (arg.resource?.id && arg.resource.id !== '__no_room__' ? arg.resource.id : '')
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

  function handleEventClick(arg: EventClickArg) {
    setEditingAppt(arg.event.extendedProps.appointment as Appointment)
    setInitialSlot(null)
    setModalOpen(true)
  }

  async function handleEventDrop(arg: { event: { id: string; startStr: string; endStr: string; start: Date | null; extendedProps: Record<string, unknown> }; revert: () => void }) {
    if (update.isPending) { arg.revert(); return }
    const appt = arg.event.extendedProps.appointment as Appointment
    const newStart = arg.event.start!
    const diffMs = new Date(appt.endsAt).getTime() - new Date(appt.startsAt).getTime()
    try {
      await update.mutateAsync({
        id: appt.id, patientId: appt.patientId,
        professionalId: appt.professionalId,
        startsAt: newStart.toISOString(),
        endsAt: new Date(newStart.getTime() + diffMs).toISOString(),
        status: appt.status, notes: appt.notes,
        chargeAmountCents: appt.chargeAmountCents,
        roomId: appt.roomId,
        serviceTypeId: appt.serviceTypeId,
        professionalFeeCents: appt.professionalFeeCents,
      })
      toast.success('Consulta remarcada')
    } catch (error) {
      arg.revert()
      toast.error(getAppointmentSaveErrorMessage(error, 'Não foi possível remarcar a consulta'))
    }
  }

  async function handleEventResize(arg: { event: { end: Date | null; extendedProps: Record<string, unknown> }; revert: () => void }) {
    if (update.isPending) { arg.revert(); return }
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
    } catch (error) {
      arg.revert()
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

  const fcPlugins    = [resourceTimeGridPlugin, timeGridPlugin, dayGridPlugin, interactionPlugin]
  const fcButtonText = {
    today: 'Hoje', week: 'Semana', day: 'Dia', month: 'Mês',
    resourceTimeGridDay: 'Dia',
    timeGridWeek: 'Semana', timeGridDay: 'Dia', dayGridMonth: 'Mês',
  }

  const pageTitle = isPersonalView ? 'Minha Agenda' : 'Agenda'
  const todayHeadline = format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })
  const effectiveSlotDuration = Math.max(15, clinic?.slotDurationMinutes ?? 30)
  const slotDuration = minutesToFcDuration(effectiveSlotDuration)
  const eventMinHeight = effectiveSlotDuration <= 15 ? 22 : 34

  function handleViewChange(nextView: CalendarView) {
    setCalendarView(nextView)
    const nextResolvedView = nextView === 'timeGridDay' && dayBreakdown !== 'none'
      ? 'resourceTimeGridDay'
      : nextView
    calendarRef.current?.getApi().changeView(nextResolvedView)
  }

  function handleDayBreakdownChange(nextBreakdown: DayBreakdown) {
    setDayBreakdown(nextBreakdown)
    if (calendarView !== 'timeGridDay') return
    const nextResolvedView = nextBreakdown === 'none' ? 'timeGridDay' : 'resourceTimeGridDay'
    calendarRef.current?.getApi().changeView(nextResolvedView)
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
              <option value="timeGridDay">Dia</option>
              <option value="timeGridWeek">Semana</option>
              <option value="dayGridMonth">Mês</option>
            </select>
          </label>
          {calendarView === 'timeGridDay' && (
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

      <div className={`bg-white rounded-xl border border-gray-100 p-4 relative ${isLoading ? 'opacity-60' : ''}`}>
        <FullCalendar
          ref={calendarRef}
          plugins={fcPlugins}
          initialView={resolvedCalendarView}
          locale="pt-br"
          headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
          buttonText={fcButtonText}
          slotMinTime={`${slotMin}:00`}
          slotMaxTime={`${slotMax}:00`}
          slotDuration={slotDuration}
          snapDuration={slotDuration}
          businessHours={calendarBusinessHours}
          resources={dayBreakdownResources}
          allDaySlot={false}
          nowIndicator
          navLinks
          editable={!isPersonalView}
          selectable={!isPersonalView}
          selectMirror
          dayMaxEvents
          eventClassNames={() => ['consultin-agenda-event']}
          eventContent={renderAppointmentEvent}
          eventMinHeight={eventMinHeight}
          events={events}
          select={handleDateSelect}
          eventClick={handleEventClick}
          eventDrop={handleEventDrop}
          eventResize={handleEventResize}
          datesSet={info => {
            setRange({ start: info.startStr, end: info.endStr })
            if (info.view.type === 'resourceTimeGridDay') {
              setCalendarView('timeGridDay')
              return
            }
            setCalendarView(info.view.type as CalendarView)
          }}
          contentHeight={820}
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
