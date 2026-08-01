/**
 * Tests for OnboardingPage (post-governance redesign).
 *
 * OnboardingPage is shown to authenticated users who have no user_profile yet.
 * It replaced the old "create clinic" flow with an invite-based flow:
 *
 *   • checking  — spinner while querying clinic_invites
 *   • invite    — user has a pending invite → confirm access
 *   • patient   — user self-registers as patient
 *   • no-access — no invite found, show options
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import OnboardingPage from '../pages/OnboardingPage'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockSignOut = vi.fn()
const mockFrom = vi.fn()
const mockRefreshSession = vi.fn()

vi.mock('../contexts/AuthContext', () => ({
  useAuthContext: () => ({
    session: {
      user: {
        id: 'user-oauth-1',
        email: 'pedro@test.com',
        user_metadata: { full_name: 'Pedro' },
      },
    },
    profile: null,
    signOut: mockSignOut,
  }),
}))

vi.mock('../services/supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
    auth: { refreshSession: () => mockRefreshSession() },
  },
}))

// ─── useInvites hooks — mock at module level so tests control return values ───

// Default: no invite, no clinics (overridden per test)
vi.mock('../hooks/useInvites', () => ({
  useMyInvite: vi.fn(),
  useClinicsPublic: vi.fn(),
  useAcceptInvite: vi.fn(),
  useCreateInvite: vi.fn(),
  useDeleteInvite: vi.fn(),
  usePendingInvites: vi.fn(),
}))

import {
  useMyInvite,
  useClinicsPublic,
  useAcceptInvite,
} from '../hooks/useInvites'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderOnboarding() {
  const qc = makeQC()
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <OnboardingPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function mockNoInvite() {
  vi.mocked(useMyInvite).mockReturnValue({ data: null, isLoading: false } as ReturnType<typeof useMyInvite>)
  vi.mocked(useClinicsPublic).mockReturnValue({ data: [] as {id:string;name:string}[], isLoading: false } as unknown as ReturnType<typeof useClinicsPublic>)
  vi.mocked(useAcceptInvite).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as unknown as ReturnType<typeof useAcceptInvite>)
}

function mockPendingInvite() {
  const fakeInvite = {
    id: 'inv-1',
    clinicId: 'clinic-1',
    clinicName: 'Clínica Saúde',
    email: 'pedro@test.com',
    roles: ['professional'] as import('../types').UserRole[],
    name: 'Pedro',
    invitedBy: null,
    usedAt: null,
    createdAt: new Date().toISOString(),
  }
  vi.mocked(useMyInvite).mockReturnValue({ data: fakeInvite, isLoading: false } as unknown as ReturnType<typeof useMyInvite>)
  vi.mocked(useClinicsPublic).mockReturnValue({ data: [] as {id:string;name:string}[], isLoading: false } as unknown as ReturnType<typeof useClinicsPublic>)
  vi.mocked(useAcceptInvite).mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false } as unknown as ReturnType<typeof useAcceptInvite>)
  return fakeInvite
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('OnboardingPage — no-access view (no invite)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNoInvite()
  })

  it('shows "Acesso não autorizado" heading', () => {
    renderOnboarding()
    expect(screen.getByRole('heading', { name: /Acesso não autorizado/i })).toBeInTheDocument()
  })

  it('shows the user email', () => {
    renderOnboarding()
    expect(screen.getByText(/pedro@test\.com/i)).toBeInTheDocument()
  })

  it('shows "Sou paciente" button', () => {
    renderOnboarding()
    expect(screen.getByRole('button', { name: /Sou paciente/i })).toBeInTheDocument()
  })

  it('shows "Usar outra conta" button', () => {
    renderOnboarding()
    expect(screen.getByRole('button', { name: /Usar outra conta/i })).toBeInTheDocument()
  })

  it('calls signOut when "Usar outra conta" is clicked', async () => {
    const user = userEvent.setup()
    mockSignOut.mockResolvedValue(undefined)
    renderOnboarding()
    await user.click(screen.getByRole('button', { name: /Usar outra conta/i }))
    expect(mockSignOut).toHaveBeenCalled()
  })
})

describe('OnboardingPage — patient registration view', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useMyInvite).mockReturnValue({ data: null, isLoading: false } as ReturnType<typeof useMyInvite>)
    vi.mocked(useClinicsPublic).mockReturnValue({
      data: [{ id: 'clinic-1', name: 'Clínica A' }],
      isLoading: false,
    } as ReturnType<typeof useClinicsPublic>)
    vi.mocked(useAcceptInvite).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as unknown as ReturnType<typeof useAcceptInvite>)
  })

  it('switches to patient registration when "Sou paciente" is clicked', async () => {
    const user = userEvent.setup()
    renderOnboarding()
    await user.click(screen.getByRole('button', { name: /Sou paciente/i }))
    expect(screen.getByRole('heading', { name: /Criar conta de paciente/i })).toBeInTheDocument()
  })

  it('shows clinic dropdown in patient view', async () => {
    const user = userEvent.setup()
    renderOnboarding()
    await user.click(screen.getByRole('button', { name: /Sou paciente/i }))
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.getByText('Clínica A')).toBeInTheDocument()
  })

  it('shows "Voltar" button in patient view', async () => {
    const user = userEvent.setup()
    renderOnboarding()
    await user.click(screen.getByRole('button', { name: /Sou paciente/i }))
    expect(screen.getByRole('button', { name: /Voltar/i })).toBeInTheDocument()
  })

  it('"Voltar" takes back to no-access view', async () => {
    const user = userEvent.setup()
    renderOnboarding()
    await user.click(screen.getByRole('button', { name: /Sou paciente/i }))
    await user.click(screen.getByRole('button', { name: /Voltar/i }))
    expect(screen.getByRole('heading', { name: /Acesso não autorizado/i })).toBeInTheDocument()
  })

  it('shows clinic options in the patient combobox', async () => {
    const user = userEvent.setup()
    renderOnboarding()
    await user.click(screen.getByRole('button', { name: /Sou paciente/i }))
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Criar conta de paciente/i })).toBeInTheDocument()
    )
    // Clinic A should appear as an option in the select
    expect(screen.getByRole('option', { name: 'Clínica A' })).toBeInTheDocument()
  })

  it('submit button is disabled when no clinic is selected', async () => {
    const user = userEvent.setup()
    renderOnboarding()
    await user.click(screen.getByRole('button', { name: /Sou paciente/i }))
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Criar conta de paciente/i })).toBeInTheDocument()
    )
    // No clinic selected yet — button must be disabled
    expect(screen.getByRole('button', { name: /Criar conta/i })).toBeDisabled()
  })
})

describe('OnboardingPage — invite view', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPendingInvite()
  })

  it('shows "Confirmar acesso" heading when invite exists', () => {
    renderOnboarding()
    expect(screen.getByRole('heading', { name: /Confirmar acesso/i })).toBeInTheDocument()
  })

  it('shows clinic name and role from the invite', () => {
    renderOnboarding()
    expect(screen.getByText(/Clínica Saúde/i)).toBeInTheDocument()
    expect(screen.getByText(/profissional/i)).toBeInTheDocument()
  })

  it('shows pre-filled name from session metadata', () => {
    renderOnboarding()
    // The name input is the first textbox; the label has no htmlFor association yet
    const nameInput = screen.getAllByRole('textbox')[0]
    expect((nameInput as HTMLInputElement).value).toBe('Pedro')
  })

  it('calls acceptInvite.mutateAsync on submit', async () => {
    const mockMutateAsync = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useAcceptInvite).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useAcceptInvite>)

    const user = userEvent.setup()
    renderOnboarding()

    await user.click(screen.getByRole('button', { name: /Ativar minha conta/i }))

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ inviteId: 'inv-1', clinicId: 'clinic-1', roles: ['professional'] }),
      )
    })
  })

  it('shows "Usar outra conta" in invite view', () => {
    renderOnboarding()
    expect(screen.getByRole('button', { name: /Usar outra conta/i })).toBeInTheDocument()
  })
})

describe('OnboardingPage — checking view', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useMyInvite).mockReturnValue({ data: undefined, isLoading: true } as ReturnType<typeof useMyInvite>)
    vi.mocked(useClinicsPublic).mockReturnValue({ data: [] as {id:string;name:string}[], isLoading: true } as unknown as ReturnType<typeof useClinicsPublic>)
    vi.mocked(useAcceptInvite).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as unknown as ReturnType<typeof useAcceptInvite>)
  })

  it('shows loading spinner while checking for invite', () => {
    renderOnboarding()
    expect(screen.getByText(/Verificando acesso/i)).toBeInTheDocument()
  })
})
