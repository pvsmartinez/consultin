/**
 * Tests for useRoomAvailabilitySlots — CRUD for room availability schedules.
 *
 * Covers:
 *  - Fetches slots ordered by room, weekday, time
 *  - Maps raw DB rows to typed RoomAvailabilitySlot objects
 *  - upsert() calls the DB RPC correctly
 *  - useClinicAvailabilitySlots aggregates all rooms for the clinic
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from './testUtils'
import { useRoomAvailabilitySlots, useClinicAvailabilitySlots } from '../hooks/useRoomAvailability'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockFrom = vi.fn()
const mockRpc  = vi.fn()

vi.mock('../services/supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
    rpc:  (...args: unknown[]) => mockRpc(...args),
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

const SLOT_ROW = {
  id:          'slot-1',
  clinic_id:   'clinic-1',
  room_id:     'room-1',
  weekday:     1,
  start_time:  '08:00',
  end_time:    '12:00',
  active:      true,
  week_parity: null,
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useRoomAvailabilitySlots', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches and maps room availability slots', async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        order: () => ({
          order: () => ({
            order: () => Promise.resolve({ data: [SLOT_ROW], error: null }),
          }),
        }),
      }),
    })

    const { result } = renderHook(() => useRoomAvailabilitySlots(), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.data).toHaveLength(1))

    const slot = result.current.data![0]
    expect(slot.id).toBe('slot-1')
    expect(slot.roomId).toBe('room-1')
    expect(slot.weekday).toBe(1)
    expect(slot.startTime).toBe('08:00')
    expect(slot.endTime).toBe('12:00')
    expect(slot.active).toBe(true)
    expect(slot.weekParity).toBeNull()
  })

  it('calls upsert_room_availability_slots RPC on upsert', async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        order: () => ({
          order: () => ({
            order: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    })
    mockRpc.mockResolvedValueOnce({ error: null })

    const { result } = renderHook(() => useRoomAvailabilitySlots(), {
      wrapper: makeWrapper(),
    })

    await act(async () => { await new Promise(r => setTimeout(r, 0)) })

    await act(async () => {
      await result.current.upsert.mutateAsync({
        roomId: 'room-1',
        slots: [{ roomId: 'room-1', weekday: 1, startTime: '08:00', endTime: '12:00', active: true, weekParity: null }],
      })
    })

    expect(mockRpc).toHaveBeenCalledWith(
      'upsert_room_availability_slots',
      expect.objectContaining({
        p_room_id:   'room-1',
        p_clinic_id: 'clinic-1',
      }),
    )
  })
})

describe('useClinicAvailabilitySlots', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches all clinic-wide room availability slots', async () => {
    // useClinicAvailabilitySlots queries from 'availability_slots' with .eq('active', true)
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => Promise.resolve({ data: [SLOT_ROW], error: null }),
      }),
    })

    const { result } = renderHook(() => useClinicAvailabilitySlots(), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.data).toHaveLength(1))
  })
})
