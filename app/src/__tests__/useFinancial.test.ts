import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from './testUtils'
import { useFinancial, useMarkPaid } from '../hooks/useFinancial'

const mockFrom = vi.fn()

vi.mock('../services/supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
  },
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuthContext: () => ({ profile: { clinicId: 'clinic-1' } }),
}))

function makeWrapper(queryClient = makeQueryClient()) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useFinancial', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads financial appointments with patient and professional joins', async () => {
    const chainable = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
    } as Record<string, unknown>

    Object.assign(chainable, {
      then(resolve: (value: unknown) => void, reject?: (reason: unknown) => void) {
        return Promise.resolve({
          data: [{
            id: 'appt-1',
            clinic_id: 'clinic-1',
            patient_id: 'patient-1',
            professional_id: 'professional-1',
            starts_at: '2026-04-13T10:00:00.000Z',
            ends_at: '2026-04-13T10:30:00.000Z',
            status: 'scheduled',
            notes: null,
            room_id: null,
            service_type_id: null,
            charge_amount_cents: 15000,
            paid_amount_cents: null,
            professional_fee_cents: null,
            paid_at: null,
            payment_method: null,
            created_at: '2026-04-10T09:00:00.000Z',
            patient: { id: 'patient-1', name: 'João', phone: '11999999999', cpf: '11144477735' },
            professional: { id: 'professional-1', name: 'Dra. Ana', specialty: 'Odonto' },
          }],
          error: null,
        }).then(resolve, reject)
      },
    })

    mockFrom.mockReturnValue(chainable)

    const { result } = renderHook(() => useFinancial(new Date('2026-04-13T12:00:00.000Z')), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toHaveLength(1)
    expect(result.current.data?.[0].patient?.name).toBe('João')
    expect(chainable.eq).toHaveBeenCalledWith('clinic_id', 'clinic-1')
  })

  it('marks an appointment as paid and invalidates dependent queries', async () => {
    const eqMock = vi.fn().mockResolvedValue({ error: null })
    const updateMock = vi.fn(() => ({ eq: eqMock }))
    mockFrom.mockReturnValue({ update: updateMock })

    const queryClient = makeQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useMarkPaid(), {
      wrapper: makeWrapper(queryClient),
    })

    await act(async () => {
      await result.current.mutateAsync({
        id: 'appt-1',
        paidAmountCents: 15000,
        paymentMethod: 'pix',
      })
    })

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      paid_amount_cents: 15000,
      status: 'completed',
      payment_method: 'pix',
    }))
    expect(eqMock).toHaveBeenCalledWith('id', 'appt-1')
    expect(invalidateSpy).toHaveBeenCalled()
  })
})