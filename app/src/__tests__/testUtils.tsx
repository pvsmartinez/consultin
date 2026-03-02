/**
 * Shared test utilities.
 *
 * Provides a `renderWithProviders` helper that wraps any component with:
 *  - A fresh React Query QueryClient (retries disabled for fast failures)
 *  - A MemoryRouter (optional initialEntries)
 *
 * For auth context, use vi.mock('../contexts/AuthContext', ...) directly
 * in each component test file, calling `mockUseAuthContext` below.
 */
import React from 'react'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, type MemoryRouterProps } from 'react-router-dom'
import type { UserProfile, UserRole } from '../types'
import { primaryRole, mergedPermissions } from '../types'

// ─── React Query wrapper ──────────────────────────────────────────────────────

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  })
}

// ─── Auth mock helpers ────────────────────────────────────────────────────────

export const MOCK_ADMIN_PROFILE: UserProfile = {
  id: 'user-admin-1',
  clinicId: 'clinic-1',
  roles: ['admin'],
  name: 'Admin User',
  isSuperAdmin: false,
  avatarUrl: null,
  permissionOverrides: {},
}

export const MOCK_RECEPTIONIST_PROFILE: UserProfile = {
  id: 'user-recept-1',
  clinicId: 'clinic-1',
  roles: ['receptionist'],
  name: 'Recepcionist User',
  isSuperAdmin: false,
  avatarUrl: null,
  permissionOverrides: {},
}

export const MOCK_PROFESSIONAL_PROFILE: UserProfile = {
  id: 'user-prof-1',
  clinicId: 'clinic-1',
  roles: ['professional'],
  name: 'Professional User',
  isSuperAdmin: false,
  avatarUrl: null,
  permissionOverrides: {},
}

export const MOCK_PATIENT_PROFILE: UserProfile = {
  id: 'user-patient-1',
  clinicId: 'clinic-1',
  roles: ['patient'],
  name: 'Patient User',
  isSuperAdmin: false,
  avatarUrl: null,
  permissionOverrides: {},
}

/**
 * Returns a mock AuthContext value.
 * Usage in tests:
 *   vi.mock('../contexts/AuthContext')
 *   beforeEach(() => vi.mocked(useAuthContext).mockReturnValue(buildMockAuth(...)))
 */
export function buildMockAuth(overrides: Partial<{
  profile: UserProfile | null
  role: UserRole | null
  loading: boolean
  isSuperAdmin: boolean
  hasSession: boolean
}> = {}) {
  const profile = overrides.profile ?? null
  const role = overrides.role ?? (profile ? primaryRole(profile.roles) : null)

  function hasPermission(key: string): boolean {
    if (!profile) return false
    return mergedPermissions(profile.roles)[key] ?? false
  }

  return {
    session:         overrides.hasSession !== false && profile ? { user: { id: profile.id } } as never : null,
    profile,
    role,
    isSuperAdmin:    overrides.isSuperAdmin ?? false,
    loading:         overrides.loading ?? false,
    signInWithEmail: vi.fn().mockResolvedValue({ error: null }),
    signInWithGoogle: vi.fn().mockResolvedValue(undefined),
    signInWithApple: vi.fn().mockResolvedValue(undefined),
    signOut:         vi.fn().mockResolvedValue(undefined),
    hasPermission,
    recoveryMode:    false,
    clearRecoveryMode: vi.fn(),
  }
}

// ─── renderWithProviders ──────────────────────────────────────────────────────

interface RenderOptions {
  routerProps?: Omit<MemoryRouterProps, 'children'>
  queryClient?: QueryClient
}

export function renderWithProviders(
  ui: React.ReactElement,
  { routerProps, queryClient }: RenderOptions = {},
) {
  const client = queryClient ?? makeQueryClient()

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter {...routerProps}>
        {ui}
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
