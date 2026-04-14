import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from './testUtils'
import { useAvailabilitySlots } from '../hooks/useAvailabilitySlots'

const mockFrom = vi.fn()
const rpcMock = vi.fn()

vi.mock('../services/supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuthContext: () => ({ profile: { clinicId: 'clinic-1' } }),
}))

function makeWrapper(queryClient = makeQueryClient()) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useAvailabilitySlots', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps availability slots ordered by weekday and time', async () => {
    const chainable = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
    } as Record<string, unknown>
    Object.assign(chainable, {
      then(resolve: (value: unknown) => void, reject?: (reason: unknown) => void) {
        return Promise.resolve({
          data: [{
            id: 'slot-1',
            clinic_id: 'clinic-1',
            professional_id: 'professional-1',
            weekday: 1,
            start_time: '08:00',
            end_time: '12:00',
            active: true,
            room_id: 'room-1',
            week_parity: null,
          }],
          error: null,
        }).then(resolve, reject)
      },
    })
    mockFrom.mockReturnValue(chainable)

    const { result } = renderHook(() => useAvailabilitySlots('professional-1'), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.[0].startTime).toBe('08:00')
    expect(chainable.eq).toHaveBeenCalledWith('professional_id', 'professional-1')
  })

  it('upserts slots through the RPC with mapped snake_case payload', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      then: (resolve: (value: unknown) => void) => Promise.resolve({ data: [], error: null }).then(resolve),
    })
    rpcMock.mockResolvedValue({ error: null })

    const { result } = renderHook(() => useAvailabilitySlots('professional-1'), { wrapper: makeWrapper() })

    await act(async () => {
      await result.current.upsert.mutateAsync([
        {
          professionalId: 'professional-1',
          weekday: 1,
          startTime: '08:00',
          endTime: '12:00',
          active: true,
          roomId: 'room-1',
          weekParity: null,
        },
      ])
    })

    expect(rpcMock).toHaveBeenCalledWith('upsert_availability_slots', {
      p_professional_id: 'professional-1',
      p_clinic_id: 'clinic-1',
      p_slots: [{
        weekday: 1,
        start_time: '08:00',
        end_time: '12:00',
        active: true,
        room_id: 'room-1',
        week_parity: null,
      }],
    })
  })
})