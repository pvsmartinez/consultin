/**
 * Tests for usePatients hook (React Query).
 * Mocks the supabase client and AuthContext to avoid real network calls.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { usePatients } from '../hooks/usePatients'

// ─── Mock supabase ────────────────────────────────────────────────────────────

const mockFrom = vi.fn()

vi.mock('../services/supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
  },
}))

// ─── Mock AuthContext ─────────────────────────────────────────────────────────

vi.mock('../contexts/AuthContext', () => ({
  useAuthContext: () => ({ profile: { clinicId: 'clinic-1', role: 'admin' } }),
}))

// ─── DB row fixture ───────────────────────────────────────────────────────────

const MOCK_DB_ROW = {
  id: 'patient-uuid-1',
  clinic_id: 'clinic-1',
  name: 'João da Silva',
  cpf: '11144477735',
  rg: null,
  birth_date: '1990-03-15',
  sex: 'M',
  phone: '11999998888',
  email: 'joao@example.com',
  address_street: 'Rua Teste',
  address_number: '123',
  address_complement: null,
  address_neighborhood: 'Centro',
  address_city: 'São Paulo',
  address_state: 'SP',
  address_zip: '01310100',
  notes: null,
  custom_fields: {},
  created_at: '2024-01-01T10:00:00.000Z',
}

// ─── Wrapper ─────────────────────────────────────────────────────────────────

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('usePatients', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('starts in loading state', () => {
    // Never resolves to keep it loading
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      then: vi.fn(), // never calls back
    })

    const { result } = renderHook(() => usePatients(), { wrapper: makeWrapper() })
    expect(result.current.loading).toBe(true)
    expect(result.current.patients).toEqual([])
  })

  it('maps DB rows to camelCase Patient objects', async () => {
    const chainable = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
    } as Record<string, unknown>
    Object.assign(chainable, {
      then(resolve: (v: unknown) => void, reject?: (e: unknown) => void) {
        return Promise.resolve({ data: [MOCK_DB_ROW], error: null, count: 1 }).then(resolve, reject)
      },
    })
    mockFrom.mockReturnValue(chainable)

    const { result } = renderHook(() => usePatients(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.patients).toHaveLength(1)
    const p = result.current.patients[0]
    expect(p.id).toBe('patient-uuid-1')
    expect(p.clinicId).toBe('clinic-1')
    expect(p.name).toBe('João da Silva')
    expect(p.cpf).toBe('11144477735')
    expect(p.birthDate).toBe('1990-03-15')
    expect(p.sex).toBe('M')
    expect(p.phone).toBe('11999998888')
    expect(p.addressCity).toBe('São Paulo')
    expect(p.addressState).toBe('SP')
    expect(p.createdAt).toBe('2024-01-01T10:00:00.000Z')
  })

  it('sets error on supabase error', async () => {
    const chainable = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
    } as Record<string, unknown>
    Object.assign(chainable, {
      then(resolve: (v: unknown) => void, reject?: (e: unknown) => void) {
        return Promise.resolve({ data: null, error: { message: 'DB error' } }).then(resolve, reject)
      },
    })
    mockFrom.mockReturnValue(chainable)

    const { result } = renderHook(() => usePatients(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBe('DB error')
    expect(result.current.patients).toEqual([])
  })

  it('returns empty array when data is null', async () => {
    const chainable = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
    } as Record<string, unknown>
    Object.assign(chainable, {
      then(resolve: (v: unknown) => void, reject?: (e: unknown) => void) {
        return Promise.resolve({ data: null, error: null, count: 0 }).then(resolve, reject)
      },
    })
    mockFrom.mockReturnValue(chainable)

    const { result } = renderHook(() => usePatients(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.patients).toEqual([])
  })

  it('adds OR filter clause when search is provided', async () => {
    const orMock = vi.fn().mockReturnThis()
    const chainable = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      or: orMock,
    } as Record<string, unknown>
    Object.assign(chainable, {
      then(resolve: (v: unknown) => void, reject?: (e: unknown) => void) {
        return Promise.resolve({ data: [], error: null, count: 0 }).then(resolve, reject)
      },
    })
    mockFrom.mockReturnValue(chainable)

    const { result } = renderHook(() => usePatients('João'), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(orMock).toHaveBeenCalledWith(expect.stringContaining('João'))
  })
})
