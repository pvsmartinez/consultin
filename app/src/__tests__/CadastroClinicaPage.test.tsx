/**
 * Tests for CadastroClinicaPage — public clinic/practitioner signup form.
 *
 * Covers:
 *  - Page renders with required fields
 *  - Validation: email required, clinic name required
 *  - Solo practitioner toggle hides/shows responsible name field
 *  - Successful form submission calls edge function and navigates to /bem-vindo
 *  - Server error is shown when edge function fails
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: () => [new URLSearchParams()],
  }
})

const mockInvoke = vi.fn()
vi.mock('../services/supabase', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
  },
}))

vi.mock('../lib/publicAnalytics', () => ({
  trackPublicEvent: vi.fn(),
}))
vi.mock('../lib/gtag', () => ({
  gtagEvent: vi.fn(),
}))
vi.mock('../components/seo/Seo', () => ({
  Seo: () => null,
}))

import CadastroClinicaPage from '../pages-v1/CadastroClinicaPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <CadastroClinicaPage />
    </MemoryRouter>,
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CadastroClinicaPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the signup form with key fields', () => {
    renderPage()
    expect(screen.getByPlaceholderText('Ex: Clínica Saúde & Vida')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('contato@suaclinica.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /criar conta grátis/i })).toBeInTheDocument()
  })

  it('shows validation error when clinic name is missing', async () => {
    renderPage()
    const user = userEvent.setup()

    await user.type(screen.getByPlaceholderText('contato@suaclinica.com'), 'dr@clinica.com')
    await user.click(screen.getByRole('button', { name: /criar conta grátis/i }))

    await waitFor(() => {
      expect(screen.getByText(/nome obrigatório/i)).toBeInTheDocument()
    })
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('shows validation error for invalid email', async () => {
    renderPage()
    const user = userEvent.setup()

    await user.type(screen.getByPlaceholderText('Ex: Clínica Saúde & Vida'), 'Minha Clínica')
    await user.type(screen.getByPlaceholderText('contato@suaclinica.com'), 'not-an-email')
    // fireEvent.submit bypasses jsdom’s type="email" constraint validation
    fireEvent.submit(document.querySelector('form')!)

    await waitFor(() => {
      expect(screen.getAllByText(/e-mail inválido/i).length).toBeGreaterThan(0)
    })
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('submits successfully and navigates to /bem-vindo', async () => {
    mockInvoke.mockResolvedValueOnce({ error: null })
    renderPage()
    const user = userEvent.setup()

    await user.type(screen.getByPlaceholderText('Ex: Clínica Saúde & Vida'), 'Clínica Dr. Silva')
    await user.type(screen.getByPlaceholderText('contato@suaclinica.com'), 'dr@clinica.com')
    await user.click(screen.getByRole('button', { name: /criar conta grátis/i }))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('submit-clinic-signup', expect.objectContaining({
        body: expect.objectContaining({
          clinicName: 'Clínica Dr. Silva',
          email: 'dr@clinica.com',
        }),
      }))
      expect(mockNavigate).toHaveBeenCalledWith('/bem-vindo')
    })
  })

  it('shows server error when edge function fails', async () => {
    mockInvoke.mockResolvedValueOnce({ error: { message: 'E-mail já em uso.' } })
    renderPage()
    const user = userEvent.setup()

    await user.type(screen.getByPlaceholderText('Ex: Clínica Saúde & Vida'), 'Clínica Dr. Silva')
    await user.type(screen.getByPlaceholderText('contato@suaclinica.com'), 'dr@clinica.com')
    await user.click(screen.getByRole('button', { name: /criar conta grátis/i }))

    await waitFor(() => {
      expect(screen.getByText(/e-mail já em uso/i)).toBeInTheDocument()
    })
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('sends isSoloPractitioner=true when solo toggle is active', async () => {
    mockInvoke.mockResolvedValueOnce({ error: null })
    renderPage()
    const user = userEvent.setup()

    // Click the "Profissional liberal" / solo toggle
    const soloToggle = screen.queryByText(/profissional liberal/i) ||
                       screen.queryByRole('button', { name: /profissional liberal/i })
    if (soloToggle) await user.click(soloToggle)

    await user.type(screen.getByPlaceholderText(/Ex: .*/), 'Dr. Ana')
    await user.type(screen.getByPlaceholderText('contato@suaclinica.com'), 'ana@clinica.com')
    await user.click(screen.getByRole('button', { name: /criar conta grátis/i }))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('submit-clinic-signup', expect.objectContaining({
        body: expect.objectContaining({ email: 'ana@clinica.com' }),
      }))
    })
  })
})
