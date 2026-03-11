/**
 * Tests for LoginPage component.
 *
 * LoginPage is a thin wrapper around the shared AuthScreen component.
 * Auth logic (signIn, OAuth, OTP) lives inside AuthScreen — test that
 * component in isolation if needed. Here we just verify the page mounts
 * and renders the AuthScreen login form.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LoginPage from '../pages/LoginPage'

vi.mock('../contexts/AuthContext', () => ({
  useAuthContext: () => ({
    recoveryMode: false,
    clearRecoveryMode: vi.fn(),
  }),
}))

// Supabase client used by AuthScreen
vi.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      signInWithOAuth: vi.fn().mockResolvedValue({ data: { url: null }, error: null }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}))

function renderLogin() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  )
}

describe('LoginPage', () => {
  it('renders the Entrar heading', () => {
    renderLogin()
    expect(screen.getByRole('heading', { name: /Entrar/i })).toBeInTheDocument()
  })

  it('renders email and password inputs', () => {
    renderLogin()
    expect(screen.getByPlaceholderText(/seu@email/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/••••••••/)).toBeInTheDocument()
  })

  it('renders Google and Apple OAuth buttons', () => {
    renderLogin()
    expect(screen.getByText(/Continuar com Google/i)).toBeInTheDocument()
    expect(screen.getByText(/Continuar com Apple/i)).toBeInTheDocument()
  })
})
