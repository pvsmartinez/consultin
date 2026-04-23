import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'

const mockUseAuthContext = vi.fn()
const mockUseClinic = vi.fn()

vi.mock('../contexts/AuthContext', () => ({
  useAuthContext: () => mockUseAuthContext(),
}))

vi.mock('../hooks/useClinic', () => ({
  useClinic: () => mockUseClinic(),
}))

vi.mock('../components/ui/PageLoader', () => ({
  FullScreenLoader: () => <div data-testid="full-screen-loader" />,
  PageLoader: () => <div data-testid="page-loader" />,
}))

vi.mock('../pages-v1/NovaSenhaPage', () => ({
  default: () => <div data-testid="nova-senha-page" />,
}))

vi.mock('../pages-v1/OnboardingPage', () => ({
  default: () => <div data-testid="onboarding-page" />,
}))

vi.mock('../components/layout/AppLayout', () => ({
  default: ({ children }: { children: ReactNode }) => <div data-testid="app-layout">{children}</div>,
}))

vi.mock('../components/layout/PatientPortalLayout', () => ({
  default: ({ children }: { children: ReactNode }) => <div data-testid="patient-layout">{children}</div>,
}))

vi.mock('../components/ErrorBoundary', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('../routes/PublicRoutes', () => ({
  default: () => <div data-testid="public-routes" />,
}))

vi.mock('../routes/PatientRoutes', () => ({
  default: () => <div data-testid="patient-routes" />,
}))

vi.mock('../routes/StaffRoutes', () => ({
  default: () => <div data-testid="staff-routes" />,
}))

vi.mock('../lib/emailVerification', () => ({
  EMAIL_VERIFICATION_PATH: '/email-verificado',
}))

import App from '../App'

function buildAuth(overrides: Record<string, unknown> = {}) {
  return {
    ...baseAuth(),
    ...overrides,
  }
}

function baseAuth() {
  return {
    session: null,
    profile: null,
    role: null,
    isSuperAdmin: false,
    loading: false,
    recoveryMode: false,
    clearRecoveryMode: vi.fn(),
    signOut: vi.fn(),
    hasPermission: vi.fn(),
    refreshProfile: vi.fn(),
    switchClinicContext: vi.fn(),
  }
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location-probe">{location.pathname}</div>
}

function renderApp(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <App />
      <LocationProbe />
    </MemoryRouter>,
  )
}

describe('App auth route normalization', () => {
  beforeEach(() => {
    mockUseClinic.mockReturnValue({ data: null })
    mockUseAuthContext.mockReturnValue(buildAuth())
  })

  it('redirects unauthenticated users away from protected staff routes', async () => {
    renderApp('/agenda')

    await waitFor(() => {
      expect(screen.getByTestId('location-probe')).toHaveTextContent('/login')
    })
  })

  it('keeps public routes accessible without a session', async () => {
    renderApp('/cadastro-clinica')

    expect(await screen.findByTestId('public-routes')).toBeInTheDocument()
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/cadastro-clinica')
  })

  it('keeps signed-in admins inside the regular staff app even before initial setup is marked complete', async () => {
    mockUseAuthContext.mockReturnValue(buildAuth({
      session: { user: { id: 'user-1' } },
      profile: { clinicId: 'clinic-1' },
      role: 'admin',
    }))
    mockUseClinic.mockReturnValue({ data: { onboardingCompleted: false } })

    renderApp('/agenda')

    expect(await screen.findByTestId('app-layout')).toBeInTheDocument()
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/agenda')
  })
})