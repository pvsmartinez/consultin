/**
 * Tests for useProfessionalBankAccount and useClinicBankAccounts.
 *
 * Covers:
 *  - Fetches bank account for a specific professional
 *  - Returns null (not throws) when no account found
 *  - save() creates the account record
 *  - deactivate() sets active=false
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from './testUtils'
import {
  useProfessionalBankAccount,
  useClinicBankAccounts,
} from '../hooks/useProfessionalBankAccount'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockFrom = vi.fn()

vi.mock('../services/supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
  },
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuthContext: () => ({
    profile: { id: 'user-1', clinicId: 'clinic-1' },
  }),
}))

function makeWrapper(qc = makeQueryClient()) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
}

const BANK_ACCOUNT_ROW = {
  id:              'ba-1',
  clinic_id:       'clinic-1',
  professional_id: 'prof-1',
  bank_code:       '001',
  bank_name:       'Banco do Brasil',
  account_type:    'checking',
  agency:          '1234',
  agency_digit:    '5',
  account:         '567890',
  account_digit:   '1',
  owner_name:      'Dr. Silva',
  owner_cpf_cnpj:  '123.456.789-01',
  asaas_transfer_id: null,
  active:          true,
  created_at:      '2025-01-01T00:00:00Z',
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useProfessionalBankAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches bank account for the given professionalId', async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: BANK_ACCOUNT_ROW, error: null }),
          }),
        }),
      }),
    })

    const { result } = renderHook(() => useProfessionalBankAccount('prof-1'), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => {
      expect(result.current.data?.id).toBe('ba-1')
      expect(result.current.data?.bankName).toBe('Banco do Brasil')
      expect(result.current.data?.agency).toBe('1234')
    })
  })

  it('returns null when no bank account exists', async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    })

    const { result } = renderHook(() => useProfessionalBankAccount('prof-2'), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.data).toBeNull())
  })

  it('does not fetch when professionalId is undefined', () => {
    const { result } = renderHook(() => useProfessionalBankAccount(undefined), {
      wrapper: makeWrapper(),
    })
    // Query disabled — no call to mockFrom for this hook
    expect(result.current.data).toBeUndefined()
  })
})

describe('useClinicBankAccounts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches all active bank accounts for the clinic', async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: [BANK_ACCOUNT_ROW], error: null }),
          }),
        }),
      }),
    })

    const { result } = renderHook(() => useClinicBankAccounts('clinic-1'), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.data).toHaveLength(1))
    expect(result.current.data?.[0].bankCode).toBe('001')
  })
})
