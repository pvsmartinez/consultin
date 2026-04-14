import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from './testUtils'
import { useClinicNotifications } from '../hooks/useClinicNotifications'

const mockFrom = vi.fn()

vi.mock('../services/supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
  },
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuthContext: () => ({
    profile: { clinicId: 'clinic-1' },
    role: 'admin',
  }),
}))

vi.mock('sonner', () => ({
  toast: { info: vi.fn() },
}))

function makeWrapper(queryClient = makeQueryClient()) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useClinicNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns unread notifications count for clinic staff', async () => {
    const limitMock = vi.fn().mockResolvedValue({
      data: [{
        id: 'notif-1',
        clinic_id: 'clinic-1',
        type: 'public_booking_created',
        data: { patientName: 'João' },
        read_at: null,
        created_at: '2026-04-13T10:00:00.000Z',
      }],
      error: null,
    })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: limitMock,
    })

    const { result } = renderHook(() => useClinicNotifications(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.unreadCount).toBe(1))

    expect(result.current.notifications[0].type).toBe('public_booking_created')
  })

  it('marks all notifications as read', async () => {
    const limitMock = vi.fn().mockResolvedValue({ data: [], error: null })
    const isMock = vi.fn().mockResolvedValue({ error: null })
    const eqMock = vi.fn(() => ({ is: isMock }))
    const updateMock = vi.fn(() => ({ eq: eqMock }))

    mockFrom.mockImplementation((table: string) => {
      if (table === 'clinic_notifications') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: limitMock,
          update: updateMock,
        }
      }
      return {}
    })

    const queryClient = makeQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useClinicNotifications(), { wrapper: makeWrapper(queryClient) })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      result.current.markAllRead()
    })

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ read_at: expect.any(String) }))
    expect(eqMock).toHaveBeenCalledWith('clinic_id', 'clinic-1')
    expect(isMock).toHaveBeenCalledWith('read_at', null)
    expect(invalidateSpy).toHaveBeenCalled()
  })
})