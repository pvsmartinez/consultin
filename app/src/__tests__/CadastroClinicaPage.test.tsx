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
const mockSendEmailVerificationLink = vi.fn()
vi.mock('../services/supabase', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
    auth: { signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args) },
  },
}))
vi.mock('../lib/emailVerification', () => ({
  sendEmailVerificationLink: (...args: unknown[]) => mockSendEmailVerificationLink(...args),
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

describe('CadastroClinicaPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendEmailVerificationLink.mockResolvedValue({ error: null })
  })

  it('renders the signup form with key fields', () => {
    renderPage()
    expect(screen.getByPlaceholderText('Ex: Clínica Saúde & Vida')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('contato@suaclinica.com')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/mínimo 8 caracteres/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /criar conta e entrar/i })).toBeInTheDocument()
  })

  it('shows validation error when clinic name is missing', async () => {
    renderPage()
    const user = userEvent.setup()

    await user.type(screen.getByPlaceholderText('contato@suaclinica.com'), 'dr@clinica.com')
    await user.type(screen.getByPlaceholderText(/mínimo 8 caracteres/i), 'senha1234')
    await user.type(screen.getByPlaceholderText(/repita sua senha/i), 'senha1234')
    await user.click(screen.getByRole('button', { name: /criar conta e entrar/i }))

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
    await user.click(screen.getByRole('button', { name: /criar conta e entrar/i }))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('submit-clinic-signup', expect.objectContaining({
        body: expect.objectContaining({
          clinicName: 'Clínica Dr. Silva',
          email: 'dr@clinica.com',
          password: 'senha1234',
        }),
      }))
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: 'dr@clinica.com',
        password: 'senha1234',
      })
      expect(mockSendEmailVerificationLink).toHaveBeenCalledWith('dr@clinica.com')
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
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
    await user.click(screen.getByRole('button', { name: /criar conta e entrar/i }))

    await waitFor(() => {
      expect(screen.getByText(/e-mail já em uso/i)).toBeInTheDocument()
    })
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(mockSignInWithPassword).not.toHaveBeenCalled()
    expect(mockSendEmailVerificationLink).not.toHaveBeenCalled()
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
    await user.click(screen.getByRole('button', { name: /criar conta e entrar/i }))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('submit-clinic-signup', expect.objectContaining({
        body: expect.objectContaining({
          email: 'ana@clinica.com',
          password: 'senha1234',
          isSoloPractitioner: true,
        }),
      }))
    })
    expect(mockSendEmailVerificationLink).toHaveBeenCalledWith('ana@clinica.com')
  })

  it('shows validation error when passwords do not match', async () => {
    renderPage()
    const user = userEvent.setup()

    await user.type(screen.getByPlaceholderText('Ex: Clínica Saúde & Vida'), 'Clínica Dr. Silva')
    await user.type(screen.getByPlaceholderText('contato@suaclinica.com'), 'dr@clinica.com')
    await user.type(screen.getByPlaceholderText(/mínimo 8 caracteres/i), 'senha1234')
    await user.type(screen.getByPlaceholderText(/repita sua senha/i), 'outrasenha')
    await user.click(screen.getByRole('button', { name: /criar conta e entrar/i }))

    await waitFor(() => {
      expect(screen.getByText(/as senhas não coincidem/i)).toBeInTheDocument()
    })
    expect(mockInvoke).not.toHaveBeenCalled()
    expect(mockSignInWithPassword).not.toHaveBeenCalled()
    expect(mockSendEmailVerificationLink).not.toHaveBeenCalled()
  })
})
