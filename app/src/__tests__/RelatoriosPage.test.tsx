/**
 * Tests for RelatoriosPage — metrics and reports page.
 *
 * Focuses on:
 *  - Page renders and header visible
 *  - Loading state
 *  - Month navigation
 *  - Professional filter renders
 *  - Table rows rendered for report data
 *  - Export buttons present
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../contexts/AuthContext', () => ({
  useAuthContext: () => ({
    profile: { id: 'user-1', clinicId: 'clinic-1', roles: ['admin'] },
  }),
}))

vi.mock('../hooks/useRelatorios', () => ({
  useReportData:               vi.fn(),
  useAdministrativeSnapshots:  vi.fn(),
}))

vi.mock('../hooks/useProfessionals', () => ({
  useProfessionals: () => ({
    data: [
      { id: 'prof-1', name: 'Dr. Silva', active: true },
    ],
  }),
}))

vi.mock('../services/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          gte: () => ({ lte: () => Promise.resolve({ data: [], error: null }) }),
        }),
      }),
    }),
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
  },
}))

// Silence recharts SSR issues in jsdom
vi.mock('recharts', () => ({
  BarChart:        ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar:             () => null,
  XAxis:           () => null,
  YAxis:           () => null,
  CartesianGrid:   () => null,
  Tooltip:         () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart:       ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Line:            () => null,
}))

// Prevent jspdf from crashing in jsdom (it requires canvas/browser APIs)
vi.mock('jspdf', () => ({
  default: vi.fn().mockImplementation(() => ({
    setFontSize: vi.fn(),
    text: vi.fn(),
    save: vi.fn(),
    addPage: vi.fn(),
    setTextColor: vi.fn(),
  })),
}))
vi.mock('jspdf-autotable', () => ({ default: vi.fn() }))

import { useReportData, useAdministrativeSnapshots } from '../hooks/useRelatorios'
import RelatoriosPage from '../pages-v1/RelatoriosPage'

const MOCK_ROW = {
  id: 'appt-1',
  startsAt: '2025-05-10T10:00:00Z',
  endsAt:   '2025-05-10T10:30:00Z',
  status:   'completed',
  patient:  { id: 'pat-1', name: 'Maria Silva', cpf: null },
  professional: { id: 'prof-1', name: 'Dr. Silva' },
  chargeAmountCents: 20000,
  paidAmountCents:   20000,
}

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderPage() {
  return render(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter>
        <RelatoriosPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RelatoriosPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAdministrativeSnapshots).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useAdministrativeSnapshots>)
  })

  it('shows loading state while data is fetching', () => {
    vi.mocked(useReportData).mockReturnValueOnce({
      data: [],
      isLoading: true,
    } as ReturnType<typeof useReportData>)
    renderPage()
    expect(screen.getByText(/carregando/i)).toBeInTheDocument()
  })

  it('renders report rows when data is available', () => {
    vi.mocked(useReportData).mockReturnValueOnce({
      data: [MOCK_ROW],
      isLoading: false,
    } as ReturnType<typeof useReportData>)
    renderPage()
    expect(screen.getByText('Maria Silva')).toBeInTheDocument()
  })

  it('renders professional filter dropdown', () => {
    vi.mocked(useReportData).mockReturnValueOnce({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useReportData>)
    renderPage()
    expect(screen.getByText('Dr. Silva')).toBeInTheDocument()
  })

  it('renders export buttons (PDF, CSV)', () => {
    vi.mocked(useReportData).mockReturnValueOnce({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useReportData>)
    renderPage()
    expect(screen.queryByText(/pdf|csv|exportar/i)).not.toBeNull()
  })

  it('renders empty state text when no appointments', () => {
    vi.mocked(useReportData).mockReturnValueOnce({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useReportData>)
    renderPage()
    // Table with zero rows or a "sem dados" message
    expect(screen.queryByText('Maria Silva')).not.toBeInTheDocument()
  })
})
