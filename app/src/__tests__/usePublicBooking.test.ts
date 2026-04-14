import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from './testUtils'
import { usePublicBookingSlots, useSubmitPublicBooking } from '../hooks/usePublicBooking'

const invokeMock = vi.fn()

vi.mock('../services/supabase', () => ({
  publicSupabase: {
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
  },
}))

function makeWrapper() {
  const qc = makeQueryClient()
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('usePublicBooking', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads public booking slots from the edge function', async () => {
    invokeMock.mockResolvedValue({
      data: {
        ok: true,
        slots: [{
          professionalId: 'professional-1',
          professionalName: 'Dra. Ana',
          specialty: 'Odonto',
          startsAt: '2026-04-13T10:00:00.000Z',
          endsAt: '2026-04-13T10:30:00.000Z',
          displayDate: '13/04/2026',
          displayTime: '10:00',
        }],
      },
      error: null,
    })

    const { result } = renderHook(
      () => usePublicBookingSlots('clinica-demo', '2026-04-13', 'professional-1', 'service-1'),
      { wrapper: makeWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.[0].professionalName).toBe('Dra. Ana')
    expect(invokeMock).toHaveBeenCalledWith('public-booking', expect.objectContaining({
      body: expect.objectContaining({ action: 'slots', slug: 'clinica-demo' }),
    }))
  })

  it('submits a public booking through the edge function', async () => {
    invokeMock.mockResolvedValue({
      data: {
        ok: true,
        appointmentId: 'appt-1',
        patientId: 'patient-1',
        patientName: 'João',
        startsAt: '2026-04-13T10:00:00.000Z',
        professionalName: 'Dra. Ana',
      },
      error: null,
    })

    const { result } = renderHook(() => useSubmitPublicBooking(), { wrapper: makeWrapper() })

    await act(async () => {
      const response = await result.current.mutateAsync({
        slug: 'clinica-demo',
        patientName: 'João',
        patientPhone: '11999999999',
        professionalId: 'professional-1',
        startsAt: '2026-04-13T10:00:00.000Z',
        endsAt: '2026-04-13T10:30:00.000Z',
      })
      expect(response.appointmentId).toBe('appt-1')
    })

    expect(invokeMock).toHaveBeenCalledWith('public-booking', expect.objectContaining({
      body: expect.objectContaining({ action: 'book', slug: 'clinica-demo' }),
    }))
  })
})