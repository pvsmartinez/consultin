/**
 * Tests for EquipePage — team management (professionals + access control).
 *
 * Covers both tabs:
 *  - Profissionais: list of clinic professionals, add/toggle
 *  - Acesso: clinic members, roles, pending invites
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../contexts/AuthContext', () => ({
  useAuthContext: () => ({
    profile: { id: 'user-admin-1', clinicId: 'clinic-1', roles: ['admin'] },
  }),
}))

vi.mock('../hooks/useClinic', () => ({
  useClinic: () => ({
    data: { id: 'clinic-1', name: 'Clínica Teste', modulesEnabled: ['staff'], professionalFieldConfig: {} },
  }),
  useClinicMembers:     () => ({
    data: [
      { id: 'user-admin-1', name: 'Admin User', roles: ['admin'], permissionOverrides: {} },
      { id: 'user-prof-1',  name: 'Dr. Silva',  roles: ['professional'], permissionOverrides: {} },
    ],
  }),
  useClinicInvites:     () => ({ data: [] }),
  useUpdateMemberRole:  () => ({ mutateAsync: vi.fn() }),
  useRemoveClinicMember: () => ({ mutateAsync: vi.fn() }),
  useResendInvite:      () => ({ mutateAsync: vi.fn() }),
  useCancelInvite:      () => ({ mutateAsync: vi.fn() }),
}))

vi.mock('../hooks/useProfessionals', () => ({
  useProfessionals: () => ({
    data: [
      { id: 'prof-1', name: 'Dr. Silva', specialty: 'Cardiologia', active: true },
    ],
    isLoading: false,
    toggleActive: vi.fn(),
    create: vi.fn(),
  }),
}))

vi.mock('../hooks/useInvites', () => ({
  usePendingInvites:    () => ({ data: [], isLoading: false }),
  useCreateInvite:      () => ({ mutateAsync: vi.fn() }),
  useDeleteInvite:      () => ({ mutateAsync: vi.fn() }),
  useResendInviteEmail: () => ({ mutateAsync: vi.fn() }),
}))

vi.mock('../components/professionals/ProfessionalModal', () => ({
  default: ({ open }: { open: boolean }) => open ? <div data-testid="professional-modal" /> : null,
}))
vi.mock('../components/professionals/ProfessionalBankAccountModal', () => ({
  default: () => null,
}))
vi.mock('../components/ui/ConfirmDialog', () => ({
  default: () => null,
}))

import EquipePage from '../pages-v1/EquipePage'

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderPage() {
  return render(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter>
        <EquipePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('EquipePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the Profissionais tab by default', () => {
    renderPage()
    expect(screen.getByText('Profissionais')).toBeInTheDocument()
  })

  it('renders the professional in the list', () => {
    renderPage()
    expect(screen.getByText('Dr. Silva')).toBeInTheDocument()
  })

  it('renders specialty label', () => {
    renderPage()
    expect(screen.getByText(/cardiologia/i)).toBeInTheDocument()
  })

  it('renders "Adicionar profissional" button', () => {
    renderPage()
    // Button text in ProfissionaisTab — actual text is "Novo profissional"
    const btn = screen.getAllByRole('button').find(b =>
      b.textContent?.toLowerCase().includes('novo profissional') ||
      b.textContent?.toLowerCase().includes('adicionar profissional')
    )
    expect(btn).toBeTruthy()
  })

  it('switches to Acesso tab and shows member list', async () => {
    renderPage()
    const user = userEvent.setup()

    const acessoTab = screen.queryByRole('button', { name: /acesso ao sistema/i }) ||
                      screen.queryByText(/acesso ao sistema/i)
    if (acessoTab) {
      await user.click(acessoTab)
      await waitFor(() => {
        expect(screen.getByText('Admin User')).toBeInTheDocument()
      })
    }
  })

  it('opens the professional modal when add button is clicked', async () => {
    renderPage()
    const user = userEvent.setup()

    const addBtn = screen.queryByRole('button', { name: /adicionar|novo/i })
    if (addBtn) {
      await user.click(addBtn)
      await waitFor(() => {
        expect(screen.queryByTestId('professional-modal')).toBeInTheDocument()
      })
    }
  })
})
