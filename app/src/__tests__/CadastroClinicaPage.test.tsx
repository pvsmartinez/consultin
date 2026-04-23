/**
 * Tests for CadastroClinicaPage — public clinic/practitioner signup form.
 *
 * Covers:
 *  - Page renders with required fields
 *  - Validation: email required, clinic name required, password confirmation
 *  - Solo practitioner toggle hides/shows responsible name field
 *  - Successful form submission creates the account and signs in immediately
 *  - Server error is shown when edge function fails
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

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
const mockSignInWithPassword = vi.fn()
vi.mock('../services/supabase', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
    auth: { signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args) },
  },
}))
const mockTrackSignup = vi.fn()
const mockTrackPublicEvent = vi.fn()
vi.mock('../lib/googleAds', () => ({
  trackSignup: (...args: unknown[]) => mockTrackSignup(...args),
  trackGenerateLead: vi.fn(),
  trackOnboardingComplete: vi.fn(),
  trackWhatsappCtaClick: vi.fn(),
}))

vi.mock('../lib/publicAnalytics', () => ({
  trackPublicEvent: (...args: unknown[]) => mockTrackPublicEvent(...args),
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

describe('CadastroClinicaPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.sessionStorage.clear()
    window.history.replaceState({}, '', '/cadastro-clinica?utm_source=google&utm_campaign=search-brand&gclid=test-gclid')
  })

  it('renders the signup form with key fields', () => {
    renderPage()
    expect(screen.getByPlaceholderText('Ex: Clínica Saúde & Vida')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('contato@suaclinica.com')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/mínimo 8 caracteres/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /entrar no consultin agora/i })).toBeInTheDocument()
  })

  it('shows validation error when clinic name is missing', async () => {
    renderPage()
    const user = userEvent.setup()

    await user.type(screen.getByPlaceholderText('contato@suaclinica.com'), 'dr@clinica.com')
    await user.type(screen.getByPlaceholderText(/mínimo 8 caracteres/i), 'senha1234')
    await user.type(screen.getByPlaceholderText(/repita sua senha/i), 'senha1234')
    await user.click(screen.getByRole('button', { name: /entrar no consultin agora/i }))

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
    await user.type(screen.getByPlaceholderText(/mínimo 8 caracteres/i), 'senha1234')
    await user.type(screen.getByPlaceholderText(/repita sua senha/i), 'senha1234')
    fireEvent.submit(document.querySelector('form')!)

    await waitFor(() => {
      expect(screen.getAllByText(/e-mail inválido/i).length).toBeGreaterThan(0)
    })
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('submits successfully, signs in, and navigates to the app', async () => {
    mockInvoke.mockResolvedValueOnce({ error: null })
    mockSignInWithPassword.mockResolvedValueOnce({ error: null })
    renderPage()
    const user = userEvent.setup()

    await user.type(screen.getByPlaceholderText('Ex: Clínica Saúde & Vida'), 'Clínica Dr. Silva')
    await user.type(screen.getByPlaceholderText('contato@suaclinica.com'), 'dr@clinica.com')
    await user.type(screen.getByPlaceholderText(/mínimo 8 caracteres/i), 'senha1234')
    await user.type(screen.getByPlaceholderText(/repita sua senha/i), 'senha1234')
    await user.click(screen.getByRole('button', { name: /entrar no consultin agora/i }))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('submit-clinic-signup', expect.objectContaining({
        body: expect.objectContaining({
          clinicName: 'Clínica Dr. Silva',
          email: 'dr@clinica.com',
          password: 'senha1234',
          attribution: expect.objectContaining({
            utmSource: 'google',
            utmCampaign: 'search-brand',
            gclid: 'test-gclid',
            pagePath: '/cadastro-clinica',
          }),
        }),
      }))
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: 'dr@clinica.com',
        password: 'senha1234',
      })
      expect(mockTrackPublicEvent).toHaveBeenCalledWith('clinic_signup_submit', expect.objectContaining({
        utmSource: 'google',
        utmCampaign: 'search-brand',
        gclid: 'test-gclid',
      }))
      expect(mockTrackSignup).toHaveBeenCalledWith({ method: 'clinic_form' })
      expect(mockNavigate).toHaveBeenCalledWith('/agenda', { replace: true })
    })
  })

  it('shows server error when edge function fails', async () => {
    mockInvoke.mockResolvedValueOnce({ error: { message: 'E-mail já em uso.' } })
    renderPage()
    const user = userEvent.setup()

    await user.type(screen.getByPlaceholderText('Ex: Clínica Saúde & Vida'), 'Clínica Dr. Silva')
    await user.type(screen.getByPlaceholderText('contato@suaclinica.com'), 'dr@clinica.com')
    await user.type(screen.getByPlaceholderText(/mínimo 8 caracteres/i), 'senha1234')
    await user.type(screen.getByPlaceholderText(/repita sua senha/i), 'senha1234')
    await user.click(screen.getByRole('button', { name: /entrar no consultin agora/i }))

    await waitFor(() => {
      expect(screen.getByText(/e-mail já em uso/i)).toBeInTheDocument()
    })
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(mockSignInWithPassword).not.toHaveBeenCalled()
    expect(mockTrackSignup).not.toHaveBeenCalled()
  })

  it('sends isSoloPractitioner=true when solo toggle is active', async () => {
    mockInvoke.mockResolvedValueOnce({ error: null })
    mockSignInWithPassword.mockResolvedValueOnce({ error: null })
    renderPage()
    const user = userEvent.setup()

    const soloToggle = screen.queryByText(/profissional liberal/i) ||
      screen.queryByRole('button', { name: /profissional liberal/i })
    if (soloToggle) await user.click(soloToggle)

    await user.type(screen.getByPlaceholderText(/Ex: .*/), 'Dr. Ana')
    await user.type(screen.getByPlaceholderText('contato@suaclinica.com'), 'ana@clinica.com')
    await user.type(screen.getByPlaceholderText(/mínimo 8 caracteres/i), 'senha1234')
    await user.type(screen.getByPlaceholderText(/repita sua senha/i), 'senha1234')
    await user.click(screen.getByRole('button', { name: /entrar no consultin agora/i }))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('submit-clinic-signup', expect.objectContaining({
        body: expect.objectContaining({
          email: 'ana@clinica.com',
          password: 'senha1234',
          isSoloPractitioner: true,
        }),
      }))
    })
    expect(mockTrackSignup).toHaveBeenCalledWith({ method: 'clinic_form' })
  })

  it('shows validation error when passwords do not match', async () => {
    renderPage()
    const user = userEvent.setup()

    await user.type(screen.getByPlaceholderText('Ex: Clínica Saúde & Vida'), 'Clínica Dr. Silva')
    await user.type(screen.getByPlaceholderText('contato@suaclinica.com'), 'dr@clinica.com')
    await user.type(screen.getByPlaceholderText(/mínimo 8 caracteres/i), 'senha1234')
    await user.type(screen.getByPlaceholderText(/repita sua senha/i), 'outrasenha')
    await user.click(screen.getByRole('button', { name: /entrar no consultin agora/i }))

    await waitFor(() => {
      expect(screen.getByText(/as senhas não coincidem/i)).toBeInTheDocument()
    })
    expect(mockInvoke).not.toHaveBeenCalled()
    expect(mockSignInWithPassword).not.toHaveBeenCalled()
    expect(mockTrackSignup).not.toHaveBeenCalled()
  })

  it('signs into the existing account when the email already exists and the password is correct', async () => {
    mockInvoke.mockResolvedValueOnce({
      error: { message: JSON.stringify({ error: 'Este e-mail já possui uma conta. Entre com sua senha para continuar.', code: 'ACCOUNT_EXISTS' }) },
    })
    mockSignInWithPassword.mockResolvedValueOnce({ error: null })
    renderPage()
    const user = userEvent.setup()

    await user.type(screen.getByPlaceholderText('Ex: Clínica Saúde & Vida'), 'Clínica Dr. Silva')
    await user.type(screen.getByPlaceholderText('contato@suaclinica.com'), 'dr@clinica.com')
    await user.type(screen.getByPlaceholderText(/mínimo 8 caracteres/i), 'senha1234')
    await user.type(screen.getByPlaceholderText(/repita sua senha/i), 'senha1234')
    await user.click(screen.getByRole('button', { name: /entrar no consultin agora/i }))

    await waitFor(() => {
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: 'dr@clinica.com',
        password: 'senha1234',
      })
      expect(mockNavigate).toHaveBeenCalledWith('/agenda', { replace: true })
    })

    expect(mockTrackSignup).not.toHaveBeenCalled()
  })

  it('shows a friendly error when the account exists but the password is wrong', async () => {
    mockInvoke.mockResolvedValueOnce({
      error: { message: JSON.stringify({ error: 'Este e-mail já possui uma conta. Entre com sua senha para continuar.', code: 'ACCOUNT_EXISTS' }) },
    })
    mockSignInWithPassword.mockResolvedValueOnce({ error: new Error('Invalid login credentials') })
    renderPage()
    const user = userEvent.setup()

    await user.type(screen.getByPlaceholderText('Ex: Clínica Saúde & Vida'), 'Clínica Dr. Silva')
    await user.type(screen.getByPlaceholderText('contato@suaclinica.com'), 'dr@clinica.com')
    await user.type(screen.getByPlaceholderText(/mínimo 8 caracteres/i), 'senha-errada')
    await user.type(screen.getByPlaceholderText(/repita sua senha/i), 'senha-errada')
    await user.click(screen.getByRole('button', { name: /entrar no consultin agora/i }))

    await waitFor(() => {
      expect(screen.getByText(/esse e-mail já existe. use a senha correta para entrar na sua conta/i)).toBeInTheDocument()
      expect(screen.getByText(/este e-mail já possui uma conta/i)).toBeInTheDocument()
    })

    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
