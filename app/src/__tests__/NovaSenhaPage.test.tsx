/**
 * Tests for NovaSenhaPage — password creation/reset page.
 *
 * Covers two modes tracked by the URL hash:
 *  - Invite mode  (hash contains "type=invite"): shown to new users from clinic invite emails
 *  - Reset mode   (no "type=invite"):            shown to users who requested a password reset
 *
 * Critical behavior: the "Bem-vindo! Crie sua senha" title is shown for invites
 * (not for resets), because the bug where invites never showed this page was fixed
 * in AuthContext.tsx via the type=invite hash detection.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockClearRecoveryMode = vi.fn()
const mockRefreshProfile = vi.fn().mockResolvedValue(undefined)
vi.mock('../contexts/AuthContext', () => ({
  useAuthContext: () => ({
    clearRecoveryMode: mockClearRecoveryMode,
    refreshProfile: mockRefreshProfile,
  }),
}))

const mockGetSession = vi.fn()
const mockUpdateUser = vi.fn()
vi.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      updateUser:  (args: unknown) => mockUpdateUser(args),
    },
  },
}))

import NovaSenhaPage from '../pages-v1/NovaSenhaPage'

// Helper to set the window hash before rendering
function renderPageWithHash(hash = '') {
  Object.defineProperty(window, 'location', {
    value: { hash },
    writable: true,
  })
  return render(<NovaSenhaPage />)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('NovaSenhaPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRefreshProfile.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('in reset mode (no type=invite)', () => {
    it('renders the "Criar nova senha" heading', () => {
      renderPageWithHash('')
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/criar nova senha/i)
    })

    it('renders password and confirm inputs', () => {
      renderPageWithHash('')
      expect(screen.getAllByPlaceholderText(/mínimo 6 caracteres/i)).toHaveLength(1)
      expect(screen.getByPlaceholderText(/repita a senha/i)).toBeInTheDocument()
    })
  })

  describe('in invite mode (type=invite in hash)', () => {
    it('renders the "Bem-vindo! Crie sua senha" heading', () => {
      renderPageWithHash('#access_token=tok&type=invite')
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/bem-vindo.*crie sua senha/i)
    })

    it('renders invite-specific subtitle', () => {
      renderPageWithHash('#access_token=tok&type=invite')
      expect(screen.getByText(/defina uma senha para acessar sua conta/i)).toBeInTheDocument()
    })
  })

  describe('validation', () => {
    it('shows error when password is shorter than 6 characters', async () => {
      renderPageWithHash('')
      const user = userEvent.setup()

      await user.type(screen.getAllByPlaceholderText(/mínimo 6 caracteres/i)[0], 'abc')
      await user.type(screen.getByPlaceholderText(/repita a senha/i), 'abc')
      await user.click(screen.getByRole('button', { name: /salvar nova senha/i }))

      expect(screen.getByText(/pelo menos 6/i)).toBeInTheDocument()
      expect(mockUpdateUser).not.toHaveBeenCalled()
    })

    it('shows error when passwords do not match', async () => {
      renderPageWithHash('')
      const user = userEvent.setup()

      await user.type(screen.getAllByPlaceholderText(/mínimo 6 caracteres/i)[0], 'senha123')
      await user.type(screen.getByPlaceholderText(/repita a senha/i), 'diferente')
      await user.click(screen.getByRole('button', { name: /salvar nova senha/i }))

      expect(screen.getByText(/não coincidem/i)).toBeInTheDocument()
      expect(mockUpdateUser).not.toHaveBeenCalled()
    })

    it('shows error when session is expired', async () => {
      mockGetSession.mockResolvedValueOnce({ data: { session: null } })
      renderPageWithHash('')
      const user = userEvent.setup()

      await user.type(screen.getAllByPlaceholderText(/mínimo 6 caracteres/i)[0], 'senha123')
      await user.type(screen.getByPlaceholderText(/repita a senha/i), 'senha123')
      await user.click(screen.getByRole('button', { name: /salvar nova senha/i }))

      await waitFor(() => {
        expect(screen.getByText(/sessão expirada/i)).toBeInTheDocument()
      })
    })
  })

  describe('successful submission', () => {
    it('shows success state and calls clearRecoveryMode after a delay', async () => {
      mockGetSession.mockResolvedValueOnce({ data: { session: { user: { id: 'u1' } } } })
      mockUpdateUser.mockResolvedValueOnce({ error: null })
      renderPageWithHash('')
      const user = userEvent.setup()

      await user.type(screen.getAllByPlaceholderText(/mínimo 6 caracteres/i)[0], 'senha123')
      await user.type(screen.getByPlaceholderText(/repita a senha/i), 'senha123')
      await user.click(screen.getByRole('button', { name: /salvar nova senha/i }))

      await waitFor(() => {
        expect(screen.getByText(/senha atualizada/i)).toBeInTheDocument()
      })
      expect(mockRefreshProfile).toHaveBeenCalled()
      // clearRecoveryMode fires after 2500ms — wait for it with real timers
      await waitFor(() => {
        expect(mockClearRecoveryMode).toHaveBeenCalled()
      }, { timeout: 4000 })
    }, 10000)

    it('calls supabase.auth.updateUser with the new password', async () => {
      mockGetSession.mockResolvedValueOnce({ data: { session: { user: { id: 'u1' } } } })
      mockUpdateUser.mockResolvedValueOnce({ error: null })
      renderPageWithHash('')
      const user = userEvent.setup()

      await user.type(screen.getAllByPlaceholderText(/mínimo 6 caracteres/i)[0], 'minhasenha')
      await user.type(screen.getByPlaceholderText(/repita a senha/i), 'minhasenha')
      await user.click(screen.getByRole('button', { name: /salvar nova senha/i }))

      await waitFor(() => {
        expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'minhasenha' })
      })
    })
  })

  describe('error handling', () => {
    it('shows error when updateUser returns an error', async () => {
      mockGetSession.mockResolvedValueOnce({ data: { session: { user: { id: 'u1' } } } })
      mockUpdateUser.mockResolvedValueOnce({ error: { message: 'invalid' } })
      renderPageWithHash('')
      const user = userEvent.setup()

      await user.type(screen.getAllByPlaceholderText(/mínimo 6 caracteres/i)[0], 'senha123')
      await user.type(screen.getByPlaceholderText(/repita a senha/i), 'senha123')
      await user.click(screen.getByRole('button', { name: /salvar nova senha/i }))

      await waitFor(() => {
        expect(screen.queryAllByText(/não foi possível atualizar/i).length).toBeGreaterThan(0)
      })
    })
  })

  describe('password visibility toggle', () => {
    it('toggles password field type on eye-button click', async () => {
      renderPageWithHash('')
      const user = userEvent.setup()
      const passwordInput = screen.getAllByPlaceholderText(/mínimo 6 caracteres/i)[0]

      expect(passwordInput).toHaveAttribute('type', 'password')
      await user.click(screen.getByRole('button', { name: '' })) // eye toggle
      expect(passwordInput).toHaveAttribute('type', 'text')
    })
  })
})
