/**
 * Tests for the RequireAuth guard component.
 *
 * RequireAuth wraps a route and redirects:
 *  - to /login when there's no session
 *  - to /acesso-negado when the role/permission check fails
 *  - renders children when auth passes
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import RequireAuth from '../components/auth/RequireAuth'

// ─── Mock AuthContext ─────────────────────────────────────────────────────────

const mockUseAuthContext = vi.fn()

vi.mock('../contexts/AuthContext', () => ({
  useAuthContext: () => mockUseAuthContext(),
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAuth(overrides: Partial<ReturnType<typeof buildAuth>> = {}) {
  return buildAuth(overrides)
}

type GuardProps = Omit<Parameters<typeof RequireAuth>[0], 'children'>

function buildAuth({
  session = null as unknown,
  role = null as string | null,
  loading = false,
  hasPermission = (_k: string): boolean => false,
} = {}) {
  return { session, role, loading, hasPermission, profile: null, isSuperAdmin: false,
    signOut: vi.fn(),
    recoveryMode: false, clearRecoveryMode: vi.fn() }
}

function renderGuard(guardProps: GuardProps) {
  return render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={
          <RequireAuth {...guardProps}>
            <div data-testid="protected-content">Protected!</div>
          </RequireAuth>
        } />
        <Route path="/login" element={<div data-testid="login-page">Login</div>} />
        <Route path="/acesso-negado" element={<div data-testid="denied-page">Denied</div>} />
        <Route path="/custom-redirect" element={<div data-testid="custom-page">Custom</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RequireAuth — loading state', () => {
  beforeEach(() => mockUseAuthContext.mockReturnValue(makeAuth({ loading: true })))

  it('renders nothing while loading', () => {
    const { container } = renderGuard({})
    expect(container).toBeEmptyDOMElement()
  })
})

describe('RequireAuth — no session', () => {
  beforeEach(() => mockUseAuthContext.mockReturnValue(makeAuth({ session: null })))

  it('redirects to /login when not authenticated', () => {
    renderGuard({})
    expect(screen.getByTestId('login-page')).toBeInTheDocument()
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
  })
})

describe('RequireAuth — authenticated, no restrictions', () => {
  beforeEach(() => mockUseAuthContext.mockReturnValue(makeAuth({
    session: { user: { id: 'user-1' } } as unknown,
    role: 'admin',
    hasPermission: () => true,
  })))

  it('renders children for authenticated user with no role/permission restriction', () => {
    renderGuard({})
    expect(screen.getByTestId('protected-content')).toBeInTheDocument()
  })
})

describe('RequireAuth — role restriction', () => {
  it('renders children when user role is in allowed list', () => {
    mockUseAuthContext.mockReturnValue(makeAuth({
      session: { user: { id: '1' } } as unknown,
      role: 'admin',
      hasPermission: () => true,
    }))
    renderGuard({ roles: ['admin', 'receptionist'] })
    expect(screen.getByTestId('protected-content')).toBeInTheDocument()
  })

  it('redirects to /acesso-negado when role is not in allowed list', () => {
    mockUseAuthContext.mockReturnValue(makeAuth({
      session: { user: { id: '1' } } as unknown,
      role: 'patient',
      hasPermission: () => false,
    }))
    renderGuard({ roles: ['admin', 'receptionist'] })
    expect(screen.getByTestId('denied-page')).toBeInTheDocument()
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
  })

  it('uses custom redirectTo when provided', () => {
    mockUseAuthContext.mockReturnValue(makeAuth({
      session: { user: { id: '1' } } as unknown,
      role: 'patient',
    }))
    renderGuard({ roles: ['admin'], redirectTo: '/custom-redirect' })
    expect(screen.getByTestId('custom-page')).toBeInTheDocument()
  })
})

describe('RequireAuth — permission restriction', () => {
  it('renders children when permission check passes', () => {
    mockUseAuthContext.mockReturnValue(makeAuth({
      session: { user: { id: '1' } } as unknown,
      hasPermission: (k: string) => k === 'canViewPatients',
    }))
    renderGuard({ permission: 'canViewPatients' })
    expect(screen.getByTestId('protected-content')).toBeInTheDocument()
  })

  it('redirects when permission check fails', () => {
    mockUseAuthContext.mockReturnValue(makeAuth({
      session: { user: { id: '1' } } as unknown,
      hasPermission: () => false,
    }))
    renderGuard({ permission: 'canManageSettings' })
    expect(screen.getByTestId('denied-page')).toBeInTheDocument()
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
  })
})
