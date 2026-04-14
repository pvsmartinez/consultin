import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from './testUtils'
import { useCreateRoom, useRooms } from '../hooks/useRooms'

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

describe('useRooms', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads clinic rooms ordered by name', async () => {
    const chainable = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
    } as Record<string, unknown>
    Object.assign(chainable, {
      then(resolve: (value: unknown) => void, reject?: (reason: unknown) => void) {
        return Promise.resolve({
          data: [{
            id: 'room-1',
            clinic_id: 'clinic-1',
            name: 'Sala 1',
            color: '#0ea5b0',
            active: true,
            created_at: '2026-04-13T10:00:00.000Z',
          }],
          error: null,
        }).then(resolve, reject)
      },
    })

    mockFrom.mockReturnValue(chainable)

    const { result } = renderHook(() => useRooms(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.[0].name).toBe('Sala 1')
    expect(chainable.eq).toHaveBeenCalledWith('clinic_id', 'clinic-1')
  })

  it('creates a room and invalidates the room list', async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        id: 'room-1',
        clinic_id: 'clinic-1',
        name: 'Consultório A',
        color: '#111827',
        active: true,
        created_at: '2026-04-13T10:00:00.000Z',
      },
      error: null,
    })
    const insertMock = vi.fn(() => ({ select: vi.fn().mockReturnValue({ single: singleMock }) }))

    mockFrom.mockReturnValue({ insert: insertMock })

    const queryClient = makeQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useCreateRoom(), { wrapper: makeWrapper(queryClient) })

    await act(async () => {
      const room = await result.current.mutateAsync({ name: 'Consultório A', color: '#111827' })
      expect(room.name).toBe('Consultório A')
    })

    expect(insertMock).toHaveBeenCalledWith({ clinic_id: 'clinic-1', name: 'Consultório A', color: '#111827' })
    expect(invalidateSpy).toHaveBeenCalled()
  })
})