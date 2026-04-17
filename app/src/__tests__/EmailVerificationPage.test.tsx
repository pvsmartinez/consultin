import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mockNavigate = vi.fn()
const mockMarkEmailAsVerified = vi.fn()
const mockIsEmailVerificationPending = vi.fn()
const mockUseAuthContext = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('../contexts/AuthContext', () => ({
  useAuthContext: () => mockUseAuthContext(),
}))

vi.mock('../lib/emailVerification', () => ({
  EMAIL_VERIFICATION_PATH: '/email-verificado',
  isEmailVerificationPending: (...args: unknown[]) => mockIsEmailVerificationPending(...args),
  markEmailAsVerified: (...args: unknown[]) => mockMarkEmailAsVerified(...args),
}))

vi.mock('../components/seo/Seo', () => ({
  Seo: () => null,
}))

import EmailVerificationPage from '../pages-v1/EmailVerificationPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <EmailVerificationPage />
    </MemoryRouter>,
  )
}

describe('EmailVerificationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuthContext.mockReturnValue({
      session: {
        user: {
          id: 'user-1',
          email: 'dr@clinica.com',
          user_metadata: {},
          app_metadata: { provider: 'email' },
        },
      },
    })
  })

  it('marks the email as verified when the link is opened', async () => {
    mockIsEmailVerificationPending.mockReturnValue(true)
    mockMarkEmailAsVerified.mockResolvedValue({ error: null })

    renderPage()

    await waitFor(() => {
      expect(mockMarkEmailAsVerified).toHaveBeenCalled()
      expect(screen.getByText(/e-mail validado com sucesso/i)).toBeInTheDocument()
    })
  })

  it('shows retry guidance when verification fails', async () => {
    mockIsEmailVerificationPending.mockReturnValue(true)
    mockMarkEmailAsVerified.mockResolvedValue({ error: new Error('fail') })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/não conseguimos concluir a validação/i)).toBeInTheDocument()
    })
  })

  it('shows loading state while waiting for the session', () => {
    mockUseAuthContext.mockReturnValue({ session: null })

    renderPage()

    expect(screen.getByText(/validando seu acesso/i)).toBeInTheDocument()
    expect(mockMarkEmailAsVerified).not.toHaveBeenCalled()
  })
})