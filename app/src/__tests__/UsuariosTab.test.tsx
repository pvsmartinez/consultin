import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient, MOCK_ADMIN_PROFILE } from './testUtils'
import type { ClinicMember, ClinicInvite } from '../hooks/useClinic'

const MEMBERS: ClinicMember[] = [
  { id: 'm1', name: 'Dr. Admin', roles: ['admin'], permissionOverrides: {} },
  { id: 'm2', name: 'Dr. Prof',  roles: ['professional'], permissionOverrides: {} },
]
const INVITES: ClinicInvite[] = [
  { id: 'inv1', email: 'pending@test.com', name: null, role: 'receptionist', createdAt: new Date().toISOString() },
]

vi.mock('../hooks/useClinic', () => ({
  useClinicMembers:       () => ({ data: MEMBERS, isLoading: false }),
  useUpdateMemberRole:    () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveClinicMember:  () => ({ mutateAsync: vi.fn(), isPending: false }),
  useClinicInvites:       () => ({ data: INVITES }),
  useResendInvite:        () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCancelInvite:        () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('../contexts/AuthContext', () => ({
  useAuthContext: () => ({ profile: MOCK_ADMIN_PROFILE }),
}))
vi.mock('../components/ui/ConfirmDialog', () => ({
  default: () => null,
}))

import UsuariosTab from '../pages-v1/settings/UsuariosTab'

function setup() {
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <UsuariosTab />
    </QueryClientProvider>
  )
}

describe('UsuariosTab', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders member list', () => {
    setup()
    expect(screen.getByText('Dr. Admin')).toBeDefined()
    expect(screen.getByText('Dr. Prof')).toBeDefined()
  })

  it('shows pending invite', () => {
    setup()
    expect(screen.getByText('pending@test.com')).toBeDefined()
  })

  it('shows role badges', () => {
    setup()
    expect(screen.getAllByText(/admin/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/profissional|professional/i).length).toBeGreaterThan(0)
  })

  it('shows pending status on invite', () => {
    setup()
    expect(screen.getAllByText(/pendente|aguardando/i).length).toBeGreaterThan(0)
  })
})
