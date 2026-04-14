import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from './testUtils'
import { usePatientAppointments } from '../hooks/useAppointments'

const mockFrom = vi.fn()

vi.mock('../services/supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
  },
}))

function makeWrapper() {
  const qc = makeQueryClient()
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('usePatientAppointments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps appointment rows with joined professional data', async () => {
    const chainable = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
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
            status: 'confirmed',
            notes: 'Retorno',
            room_id: null,
            service_type_id: null,
            charge_amount_cents: 15000,
            paid_amount_cents: 0,
            professional_fee_cents: 5000,
            paid_at: null,
            payment_method: null,
            created_at: '2026-04-10T09:00:00.000Z',
            professional: { id: 'professional-1', name: 'Dra. Ana', specialty: 'Odonto' },
          }],
          error: null,
        }).then(resolve, reject)
      },
    })

    mockFrom.mockReturnValue(chainable)

    const { result } = renderHook(() => usePatientAppointments('patient-1'), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.appointments).toHaveLength(1)
    expect(result.current.appointments[0].professional?.name).toBe('Dra. Ana')
    expect(chainable.eq).toHaveBeenCalledWith('patient_id', 'patient-1')
  })
})