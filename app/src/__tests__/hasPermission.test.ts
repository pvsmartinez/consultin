/**
 * Tests for the hasPermission() logic in AuthContext.
 *
 * We test by mocking supabase (so no network calls are made) and using
 * renderHook to get a live AuthContext value with a known profile.
 * The profile is injected by intercepting the fetchProfile supabase call.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuthContext } from '../contexts/AuthContext'

// ─── Mock supabase ────────────────────────────────────────────────────────────

const mockState = vi.hoisted(() => ({
  mockUnsubscribe: vi.fn(),
  mockRpc: vi.fn(),
  mockSignOut: vi.fn(),
  currentSession: null as { user: { id: string; app_metadata?: { provider?: string } } } | null,
}))

vi.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        Promise.resolve().then(() => cb('SIGNED_IN', mockState.currentSession))
        return { data: { subscription: { unsubscribe: mockState.mockUnsubscribe } } }
      },
      signOut: () => mockState.mockSignOut(),
      getUser: vi.fn().mockImplementation(() => Promise.resolve({ data: { user: mockState.currentSession?.user ?? null } })),
    },
    rpc: (...args: unknown[]) => mockState.mockRpc(...args),
  },
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeStartupPayload(role: string) {
  return {
    profile: {
      id: 'user-test-1',
      clinic_id: 'clinic-1',
      roles: [role],
      name: 'Test User',
      is_super_admin: false,
      permission_overrides: {},
      avatar_url: null,
      notification_phone: null,
      notif_new_appointment: false,
      notif_cancellation: false,
      notif_no_show: false,
      notif_payment_overdue: false,
    },
    clinic: null,
    professionals: [],
  }
}

function mockSupabaseWithProfile(role: string) {
  mockState.currentSession = { user: { id: 'user-test-1', app_metadata: { provider: 'email' } } }
  mockState.mockRpc.mockResolvedValue({ data: makeStartupPayload(role), error: null })
}

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client },
    React.createElement(AuthProvider, null, children),
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('hasPermission — admin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockSupabaseWithProfile('admin')
  })

  it('returns true for canViewPatients', async () => {
    const { result } = renderHook(() => useAuthContext(), { wrapper })
    await waitFor(() => expect(result.current.profile?.roles).toEqual(['admin']))
    expect(result.current.hasPermission('canViewPatients')).toBe(true)
  })

  it('returns true for canManagePatients', async () => {
    const { result } = renderHook(() => useAuthContext(), { wrapper })
    await waitFor(() => expect(result.current.profile?.roles).toEqual(['admin']))
    expect(result.current.hasPermission('canManagePatients')).toBe(true)
  })

  it('returns true for canViewFinancial', async () => {
    const { result } = renderHook(() => useAuthContext(), { wrapper })
    await waitFor(() => expect(result.current.profile?.roles).toEqual(['admin']))
    expect(result.current.hasPermission('canViewFinancial')).toBe(true)
  })

  it('returns true for canManageSettings', async () => {
    const { result } = renderHook(() => useAuthContext(), { wrapper })
    await waitFor(() => expect(result.current.profile?.roles).toEqual(['admin']))
    expect(result.current.hasPermission('canManageSettings')).toBe(true)
  })

  it('returns false for unknown permission key', async () => {
    const { result } = renderHook(() => useAuthContext(), { wrapper })
    await waitFor(() => expect(result.current.profile?.roles).toEqual(['admin']))
    expect(result.current.hasPermission('nonExistentPermission')).toBe(false)
  })
})

describe('hasPermission — receptionist', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockSupabaseWithProfile('receptionist')
  })

  it('returns true for canViewPatients', async () => {
    const { result } = renderHook(() => useAuthContext(), { wrapper })
    await waitFor(() => expect(result.current.profile?.roles).toEqual(['receptionist']))
    expect(result.current.hasPermission('canViewPatients')).toBe(true)
  })

  it('returns true for canManagePatients', async () => {
    const { result } = renderHook(() => useAuthContext(), { wrapper })
    await waitFor(() => expect(result.current.profile?.roles).toEqual(['receptionist']))
    expect(result.current.hasPermission('canManagePatients')).toBe(true)
  })

  it('returns false for canManageProfessionals', async () => {
    const { result } = renderHook(() => useAuthContext(), { wrapper })
    await waitFor(() => expect(result.current.profile?.roles).toEqual(['receptionist']))
    expect(result.current.hasPermission('canManageProfessionals')).toBe(false)
  })

  it('returns true for canViewFinancial', async () => {
    const { result } = renderHook(() => useAuthContext(), { wrapper })
    await waitFor(() => expect(result.current.profile?.roles).toEqual(['receptionist']))
    expect(result.current.hasPermission('canViewFinancial')).toBe(true)
  })

  it('returns false for canManageSettings', async () => {
    const { result } = renderHook(() => useAuthContext(), { wrapper })
    await waitFor(() => expect(result.current.profile?.roles).toEqual(['receptionist']))
    expect(result.current.hasPermission('canManageSettings')).toBe(false)
  })
})

describe('hasPermission — professional', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockSupabaseWithProfile('professional')
  })

  it('returns true for canViewPatients', async () => {
    const { result } = renderHook(() => useAuthContext(), { wrapper })
    await waitFor(() => expect(result.current.profile?.roles).toEqual(['professional']))
    expect(result.current.hasPermission('canViewPatients')).toBe(true)
  })

  it('returns false for canManagePatients', async () => {
    const { result } = renderHook(() => useAuthContext(), { wrapper })
    await waitFor(() => expect(result.current.profile?.roles).toEqual(['professional']))
    expect(result.current.hasPermission('canManagePatients')).toBe(false)
  })

  it('returns true for canManageAgenda', async () => {
    const { result } = renderHook(() => useAuthContext(), { wrapper })
    await waitFor(() => expect(result.current.profile?.roles).toEqual(['professional']))
    expect(result.current.hasPermission('canManageAgenda')).toBe(true)
  })

  it('returns false for canViewFinancial', async () => {
    const { result } = renderHook(() => useAuthContext(), { wrapper })
    await waitFor(() => expect(result.current.profile?.roles).toEqual(['professional']))
    expect(result.current.hasPermission('canViewFinancial')).toBe(false)
  })
})

describe('hasPermission — patient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockSupabaseWithProfile('patient')
  })

  it('returns false for all known permissions', async () => {
    const { result } = renderHook(() => useAuthContext(), { wrapper })
    await waitFor(() => expect(result.current.profile?.roles).toEqual(['patient']))
    const perms = ['canViewPatients', 'canManagePatients', 'canManageAgenda', 'canManageProfessionals', 'canViewFinancial', 'canManageSettings']
    for (const p of perms) {
      expect(result.current.hasPermission(p)).toBe(false)
    }
  })
})

describe('hasPermission — no session', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockState.currentSession = null
    mockState.mockRpc.mockReset()
  })

  it('returns false when not logged in', async () => {
    const { result } = renderHook(() => useAuthContext(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.hasPermission('canViewPatients')).toBe(false)
    expect(result.current.hasPermission('canManageSettings')).toBe(false)
  })
})
