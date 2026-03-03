import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventClickArg } from '@fullcalendar/core'
import type { EventInput } from '@fullcalendar/core'
import { format, startOfWeek, endOfWeek } from 'date-fns'
import { Plus } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useAppointmentsQuery, useAppointmentMutations, useMyProfessionalRecords } from '../hooks/useAppointmentsMutations'
import { useAuthContext } from '../contexts/AuthContext'
import AppointmentModal from '../components/appointments/AppointmentModal'
import type { Appointment } from '../types'

// Distinct muted palette for multi-clinic colour-coding in the professional view
const CLINIC_PALETTE = ['#6366f1', '#0ea5e9', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6']

const STATUS_COLORS: Record<string, string> = {
  scheduled: '#0d9488',
  confirmed: '#10b981',
  completed: '#94a3b8',
  cancelled: '#f43f5e',
  no_show: '#f59e0b',
}

export default function AppointmentsPage({ myOnly = false }: { myOnly?: boolean }) {
  const calendarRef = useRef<FullCalendar>(null)
  const today = new Date()
  const [range, setRange] = useState({
    start: startOfWeek(today).toISOString(),
    end: endOfWeek(today).toISOString(),
  })

  const { role } = useAuthContext()
  const { data: myProfRecords = [] } = useMyProfessionalRecords()
  // Personal view: role=professional always; or any role visiting /minha-agenda
  const isPersonalView = myOnly || role === 'professional'
  // Personal view: filter by this user's professional IDs.
  // An empty array (records not yet loaded / no linked record) is intentional —
  // useAppointmentsQuery skips the query when ids=[] to avoid showing all clinic data.
  const professionalFilter = isPersonalView ? myProfRecords.map(r => r.id) : null

  const { data: appointments = [], isLoading } = useAppointmentsQuery(range.start, range.end, professionalFilter)
  const { update } = useAppointmentMutations()

  // Build a clinicId → colour map for the professional multi-clinic view
  const clinicColorMap = Object.fromEntries(
    myProfRecords.map((r, i) => [r.clinicId, CLINIC_PALETTE[i % CLINIC_PALETTE.length]])
  )
  const multiClinic = myProfRecords.length > 1

  const [modalOpen, setModalOpen] = useState(false)
  const [editingAppt, setEditingAppt] = useState<Appointment | null>(null)
  const [initialSlot, setInitialSlot] = useState<{ date: string; time: string; durationMin: number } | null>(null)

  const events: EventInput[] = (appointments as (Appointment & { clinicName?: string | null })[]).map(a => {
    // Multi-clinic professional: colour by clinic; single-clinic: colour by room/status
    const color = multiClinic
      ? (clinicColorMap[a.clinicId] ?? '#6366f1')
      : (a.clinicRoom?.color ?? STATUS_COLORS[a.status] ?? '#0d9488')
    const title = multiClinic && a.clinicName
      ? `[${a.clinicName}] ${a.patient?.name ?? 'Paciente'}`
      : (a.patient?.name ?? 'Paciente')
    return {
      id: a.id,
      title,
      start: a.startsAt,
      end: a.endsAt,
      backgroundColor: color,
      borderColor: color,
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-800">
          {isPersonalView ? 'Minha Agenda' : 'Agenda'}
        </h1>
        <div className="flex items-center gap-2">
          {isPersonalView && (
            <Link to="/minha-disponibilidade"
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">
              Minha disponibilidade
            </Link>
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
          ref={calendarRef}
          plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          locale="pt-br"
          headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' }}
          buttonText={{ today: 'Hoje', month: 'Mês', week: 'Semana', day: 'Dia' }}
          slotMinTime="07:00:00"
          slotMaxTime="20:00:00"
          slotDuration="00:30:00"
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
    </div>
  )
}
