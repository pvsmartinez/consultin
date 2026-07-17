/**
 * Tests for usePatients hook (React Query).
 * Mocks the supabase client and AuthContext to avoid real network calls.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { usePatientSearch, usePatients } from '../hooks/usePatients'

// ─── Mock supabase ────────────────────────────────────────────────────────────

const mockRpc = vi.fn()

vi.mock('../services/supabase', () => ({
  supabase: {
    rpc: (name: string, args: unknown) => mockRpc(name, args),
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
    // Never resolves to keep it loading.
    mockRpc.mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => usePatients(), { wrapper: makeWrapper() })
    expect(result.current.loading).toBe(true)
    expect(result.current.patients).toEqual([])
  })

  it('maps DB rows to camelCase Patient objects', async () => {
    mockRpc.mockResolvedValue({ data: [{ ...MOCK_DB_ROW, total_count: 1 }], error: null })

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
    mockRpc.mockResolvedValue({ data: null, error: { message: 'DB error' } })

    const { result } = renderHook(() => usePatients(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBe('DB error')
    expect(result.current.patients).toEqual([])
  })

  it('returns empty array when data is null', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null })

    const { result } = renderHook(() => usePatients(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.patients).toEqual([])
  })

  it('passes the search term and pagination to the database search function', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })

    const { result } = renderHook(() => usePatients('João'), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(mockRpc).toHaveBeenCalledWith('search_patients', {
      p_query: 'João',
      p_limit: 50,
      p_offset: 0,
    })
  })
})

describe('usePatientSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('waits for at least two characters before querying', () => {
    const { result } = renderHook(() => usePatientSearch('J'), { wrapper: makeWrapper() })

    expect(result.current.patients).toEqual([])
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('uses the server search with a small result limit', async () => {
    mockRpc.mockResolvedValue({ data: [MOCK_DB_ROW], error: null })

    const { result } = renderHook(() => usePatientSearch('1199'), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.searching).toBe(false))

    expect(result.current.patients).toHaveLength(1)
    expect(mockRpc).toHaveBeenCalledWith('search_patients', {
      p_query: '1199',
      p_limit: 8,
      p_offset: 0,
    })
  })
})
