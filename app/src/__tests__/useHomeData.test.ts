import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from './testUtils'
import { useHomeData } from '../hooks/useHomeData'

const mockFrom = vi.fn()

vi.mock('../services/supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
  },
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuthContext: () => ({
    role: 'admin',
    profile: { id: 'user-1', clinicId: 'clinic-1' },
    session: { user: { id: 'user-1', email: 'ana@example.com' } },
  }),
}))

function makeResolveChain(result: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(result).then(onFulfilled),
  }
}

function mockSuccessQueries() {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'clinics') {
      return makeResolveChain({
        data: {
          id: 'clinic-1',
          name: 'Clinic',
          slot_duration_minutes: 30,
          working_hours: { mon: { start: '08:00', end: '18:00' } },
        },
        error: null,
      })
    }
    if (table === 'appointments') {
      return makeResolveChain({ data: [], error: null })
    }
    // professionals / user_clinic_memberships
    return makeResolveChain({ data: [], error: null })
  })
}

function mockAppointmentsError() {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'clinics') {
      return makeResolveChain({
        data: {
          id: 'clinic-1',
          name: 'Clinic',
          slot_duration_minutes: 30,
          working_hours: { mon: { start: '08:00', end: '18:00' } },
        },
        error: null,
      })
    }
    if (table === 'appointments') {
      return makeResolveChain({ data: null, error: { message: 'boom' } })
    }
    return makeResolveChain({ data: [], error: null })
  })
}

function makeWrapper(queryClient = makeQueryClient()) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useHomeData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports isError=true when the appointments query fails', async () => {
    mockAppointmentsError()

    const { result } = renderHook(() => useHomeData(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error?.message ?? '').toBe('boom')
  })

  it('keeps isError=false and resolves loading on a successful week fetch', async () => {
    mockSuccessQueries()

    const { result } = renderHook(() => useHomeData(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(false))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.bookedToday).toBe(0)
    expect(typeof result.current.refetch).toBe('function')
  })
})
