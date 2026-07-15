import { forwardRef, useEffect, useImperativeHandle } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const calendarProps = vi.fn()

vi.mock('@fullcalendar/react', () => ({
  default: forwardRef(function FullCalendarMock(props: Record<string, unknown>, ref) {
    useImperativeHandle(ref, () => ({ getApi: () => ({ changeView: vi.fn() }) }))
    useEffect(() => {
      ;(props.datesSet as (info: {
        startStr: string
        endStr: string
        view: { type: string }
      }) => void)({
        startStr: '2026-07-12T00:00:00-03:00',
        endStr: '2026-07-19T00:00:00-03:00',
        view: { type: 'timeGridWeek' },
      })
    }, [props.datesSet])
    calendarProps(props)
    return <div data-testid="calendar" />
  }),
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuthContext: () => ({ role: 'admin', isSuperAdmin: false, profile: { clinicId: 'clinic-1' } }),
}))
vi.mock('../hooks/useClinic', () => ({
  useClinic: () => ({ data: undefined, update: { mutateAsync: vi.fn() } }),
}))
vi.mock('../hooks/useClinicModules', () => ({ useClinicModules: () => ({ hasRooms: false }) }))
vi.mock('../hooks/useRooms', () => ({ useRooms: () => ({ data: [] }) }))
vi.mock('../hooks/useProfessionals', () => ({ useProfessionals: () => ({ data: [] }) }))
vi.mock('../hooks/useRoomAvailability', () => ({
  useRoomAvailabilitySlots: () => ({ data: [] }),
  useClinicAvailabilitySlots: () => ({ data: [] }),
}))
vi.mock('../hooks/useAppointmentsMutations', () => ({
  useAppointmentsQuery: () => ({ data: [], isLoading: false }),
  useAppointmentMutations: () => ({ update: { isPending: false }, cancel: { mutateAsync: vi.fn() } }),
  useMyProfessionalRecords: () => ({ data: [] }),
}))
vi.mock('../hooks/useClinicQuota', () => ({
  useClinicQuota: () => ({ subscriptionRequired: false, exceeded: false }),
}))
vi.mock('../components/appointments/AppointmentModal', () => ({ default: () => null }))
vi.mock('../components/billing/UpgradeModal', () => ({ default: () => null }))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))

import AgendaPage from '../pages/AgendaPage'

describe('AgendaPage', () => {
  it('does not re-render indefinitely when FullCalendar emits datesSet again', () => {
    render(<AgendaPage />)

    expect(screen.getByTestId('calendar')).toBeInTheDocument()
    // The first callback synchronizes the initial date range; the second one
    // must not trigger another state update with the same values.
    expect(calendarProps).toHaveBeenCalledTimes(2)
  })
})
