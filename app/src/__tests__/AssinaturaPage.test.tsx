/**
 * Tests for AssinaturaPage — subscription ("Meu plano") page.
 *
 * AssinaturaPage is thin: it loads the clinic data and delegates to FinanceiroTab.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../hooks/useClinic', () => ({
  useClinic: vi.fn(),
}))
vi.mock('../pages-v1/settings/FinanceiroTab', () => ({
  default: ({ clinic }: { clinic: unknown }) =>
    <div data-testid="financeiro-tab">{JSON.stringify(clinic)}</div>,
}))

import { useClinic } from '../hooks/useClinic'
import AssinaturaPage from '../pages-v1/AssinaturaPage'

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderPage() {
  return render(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter>
        <AssinaturaPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AssinaturaPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading state while clinic is being fetched', () => {
    vi.mocked(useClinic).mockReturnValueOnce({ data: undefined, isLoading: true } as ReturnType<typeof useClinic>)
    renderPage()
    expect(screen.getByText(/carregando/i)).toBeInTheDocument()
  })

  it('renders nothing when clinic resolves to null', () => {
    vi.mocked(useClinic).mockReturnValueOnce({ data: null, isLoading: false } as ReturnType<typeof useClinic>)
    const { container } = renderPage()
    expect(container.firstChild).toBeNull()
  })

  it('renders the "Meu plano" heading when clinic is loaded', () => {
    vi.mocked(useClinic).mockReturnValueOnce({
      data: { id: 'clinic-1', name: 'Clínica Teste' },
      isLoading: false,
    } as ReturnType<typeof useClinic>)
    renderPage()
    expect(screen.getByRole('heading', { name: /meu plano/i })).toBeInTheDocument()
  })

  it('renders FinanceiroTab with the clinic data', () => {
    const clinic = { id: 'clinic-1', name: 'Clínica Teste' }
    vi.mocked(useClinic).mockReturnValueOnce({
      data: clinic,
      isLoading: false,
    } as ReturnType<typeof useClinic>)
    renderPage()
    expect(screen.getByTestId('financeiro-tab')).toBeInTheDocument()
  })
})
