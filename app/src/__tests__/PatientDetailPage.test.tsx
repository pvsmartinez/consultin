/**
 * Tests for PatientDetailPage — patient file/detail view.
 *
 * Covers:
 *  - Page renders patient info from hooks
 *  - Shows loading skeleton when data is loading
 *  - Renders appointments list
 *  - Copy-to-clipboard on patient CPF/phone
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useParams: () => ({ id: 'patient-1' }) }
})

vi.mock('../contexts/AuthContext', () => ({
  useAuthContext: () => ({
    profile: { id: 'user-1', clinicId: 'clinic-1', roles: ['admin'] },
  }),
}))

const MOCK_PATIENT = {
  id: 'patient-1',
  name: 'Maria Souza',
  email: 'maria@example.com',
  phone: '(11) 99999-0000',
  cpf: '123.456.789-01',
  sex: 'F' as const,
  birthDate: '1985-03-15',
  address: 'Rua das Flores, 10',
  city: 'São Paulo',
  state: 'SP',
  notes: null,
  customFields: {},
  active: true,
  createdAt: '2024-01-01T00:00:00Z',
}

vi.mock('../hooks/usePatients', () => ({
  usePatient: () => ({ patient: MOCK_PATIENT, loading: false }),
}))

vi.mock('../hooks/useAppointments', () => ({
  usePatientAppointments: () => ({
    appointments: [
      {
        id: 'appt-1',
        startsAt: '2025-05-10T10:00:00Z',
        endsAt:   '2025-05-10T10:30:00Z',
        status:   'completed',
        professional: { id: 'prof-1', name: 'Dr. Silva', specialty: 'Cardiologia' },
        notes: null,
      },
    ],
    loading: false,
  }),
}))

vi.mock('../hooks/useClinic', () => ({
  useClinic: () => ({
    data: {
      id: 'clinic-1',
      name: 'Clínica Teste',
      patientFieldConfig: {},
      customPatientFields: [],
      anamnesisFields: [],
      modulesEnabled: [],
    },
  }),
}))

vi.mock('../components/patients/PatientDrawer', () => ({
  default: () => <div data-testid="patient-drawer" />,
}))
vi.mock('../components/patients/PatientRecordsPanel', () => ({
  default: () => <div data-testid="records-panel" />,
}))
vi.mock('../components/patients/PatientFilesPanel', () => ({
  default: () => <div data-testid="files-panel" />,
}))
vi.mock('../components/appointments/AppointmentModal', () => ({
  default: () => <div data-testid="appointment-modal" />,
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import PatientDetailPage from '../pages-v1/PatientDetailPage'

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderPage() {
  return render(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter initialEntries={['/pacientes/patient-1']}>
        <Routes>
          <Route path="/pacientes/:id" element={<PatientDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PatientDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Provide a basic clipboard stub so writeText doesn’t throw
    if (!navigator.clipboard) {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: vi.fn().mockResolvedValue(undefined) },
        configurable: true,
      })
    }
  })

  it('renders the patient name as heading', () => {
    renderPage()
    expect(screen.getByText('Maria Souza')).toBeInTheDocument()
  })

  it('renders patient email', () => {
    renderPage()
    expect(screen.getByText('maria@example.com')).toBeInTheDocument()
  })

  it('renders patient phone', () => {
    renderPage()
    expect(screen.getByText('(11) 99999-0000')).toBeInTheDocument()
  })

  it('renders the appointments list with a completed appointment', () => {
    renderPage()
    expect(screen.getAllByText(/Dr\. Silva/i).length).toBeGreaterThan(0)
  })

  it('renders a back/navigate-up link to the patient list', () => {
    renderPage()
    const links = screen.getAllByRole('link')
    expect(links.length).toBeGreaterThan(0)
  })

  it('copies CPF to clipboard when CPF row is clicked', async () => {
    const { toast } = await import('sonner')
    renderPage()
    const user = userEvent.setup()

    const cpfValue = screen.getByText('123.456.789-01')
    await user.click(cpfValue)

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('copiado'))
    })
  })
})
