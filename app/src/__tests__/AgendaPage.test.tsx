import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ComponentType } from 'react'

const calendarProps = vi.fn()

vi.mock('react-big-calendar', () => ({
  Calendar: function CalendarMock(props: Record<string, unknown>) {
    calendarProps(props)
    return <div data-testid="calendar" />
  },
  dateFnsLocalizer: () => ({}),
}))
vi.mock('react-big-calendar/lib/addons/dragAndDrop', () => ({
  default: (Component: ComponentType<Record<string, unknown>>) => Component,
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
  it('uses the free calendar without a datesSet render loop', () => {
    render(<AgendaPage />)

    expect(screen.getByTestId('calendar')).toBeInTheDocument()
    expect(calendarProps).toHaveBeenCalledTimes(1)
    expect(calendarProps.mock.calls[0]?.[0]).toMatchObject({
      toolbar: false,
      view: 'week',
      views: ['month', 'week', 'work_week', 'day'],
    })
  })
})
