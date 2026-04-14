import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import React from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from './testUtils'
import { useAppointmentMutations, useUpdateAppointmentStatus } from '../hooks/useAppointmentsMutations'

const mockFrom = vi.fn()

vi.mock('../services/supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
  },
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuthContext: () => ({
    profile: { id: 'user-1', clinicId: 'clinic-1' },
    session: { user: { id: 'user-1', email: 'ana@example.com' } },
  }),
}))

vi.mock('../utils/mappers', () => ({
  mapAppointment: (row: Record<string, unknown>) => ({
    id: row.id,
    clinicId: row.clinic_id,
    patientId: row.patient_id,
    professionalId: row.professional_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    notes: row.notes ?? null,
  }),
}))

function makeWrapper(queryClient = makeQueryClient()) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useAppointmentMutations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates an appointment scoped to the active clinic and invalidates appointments', async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        id: 'appt-1',
        clinic_id: 'clinic-1',
        patient_id: 'patient-1',
        professional_id: 'professional-1',
        starts_at: '2026-04-13T10:00:00.000Z',
        ends_at: '2026-04-13T10:30:00.000Z',
        status: 'scheduled',
        notes: 'Primeira consulta',
      },
      error: null,
    })
    const insertMock = vi.fn(() => ({
      select: vi.fn().mockReturnValue({ single: singleMock }),
    }))

    mockFrom.mockReturnValue({ insert: insertMock })

    const queryClient = makeQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useAppointmentMutations(), {
      wrapper: makeWrapper(queryClient),
    })

    await act(async () => {
      const created = await result.current.create.mutateAsync({
        patientId: 'patient-1',
        professionalId: 'professional-1',
        startsAt: '2026-04-13T10:00:00.000Z',
        endsAt: '2026-04-13T10:30:00.000Z',
        status: 'scheduled',
        notes: 'Primeira consulta',
        roomId: 'room-1',
        serviceTypeId: 'service-1',
        chargeAmountCents: 15000,
        professionalFeeCents: 5000,
      })

      expect(created.id).toBe('appt-1')
    })

    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      clinic_id: 'clinic-1',
      patient_id: 'patient-1',
      professional_id: 'professional-1',
      room_id: 'room-1',
      service_type_id: 'service-1',
      charge_amount_cents: 15000,
      professional_fee_cents: 5000,
    }))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['appointments'] })
  })

  it('updates an appointment payload and invalidates appointments', async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        id: 'appt-1',
        clinic_id: 'clinic-1',
        patient_id: 'patient-2',
        professional_id: 'professional-2',
        starts_at: '2026-04-13T11:00:00.000Z',
        ends_at: '2026-04-13T11:30:00.000Z',
        status: 'confirmed',
        notes: null,
      },
      error: null,
    })
    const eqMock = vi.fn(() => ({
      select: vi.fn().mockReturnValue({ single: singleMock }),
    }))
    const updateMock = vi.fn(() => ({ eq: eqMock }))

    mockFrom.mockReturnValue({ update: updateMock })

    const queryClient = makeQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useAppointmentMutations(), {
      wrapper: makeWrapper(queryClient),
    })

    await act(async () => {
      await result.current.update.mutateAsync({
        id: 'appt-1',
        patientId: 'patient-2',
        professionalId: 'professional-2',
        startsAt: '2026-04-13T11:00:00.000Z',
        endsAt: '2026-04-13T11:30:00.000Z',
        status: 'confirmed',
        serviceTypeId: 'service-2',
      })
    })

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      patient_id: 'patient-2',
      professional_id: 'professional-2',
      status: 'confirmed',
      service_type_id: 'service-2',
    }))
    expect(eqMock).toHaveBeenCalledWith('id', 'appt-1')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['appointments'] })
  })

  it('cancels an appointment by setting cancelled status', async () => {
    const eqMock = vi.fn().mockResolvedValue({ error: null })
    const updateMock = vi.fn(() => ({ eq: eqMock }))
    mockFrom.mockReturnValue({ update: updateMock })

    const { result } = renderHook(() => useAppointmentMutations(), {
      wrapper: makeWrapper(),
    })

    await act(async () => {
      await result.current.cancel.mutateAsync('appt-1')
    })

    expect(updateMock).toHaveBeenCalledWith({ status: 'cancelled' })
    expect(eqMock).toHaveBeenCalledWith('id', 'appt-1')
  })
})

describe('useUpdateAppointmentStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates only the appointment status and invalidates dependent summaries', async () => {
    const eqMock = vi.fn().mockResolvedValue({ error: null })
    const updateMock = vi.fn(() => ({ eq: eqMock }))
    mockFrom.mockReturnValue({ update: updateMock })

    const queryClient = makeQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useUpdateAppointmentStatus(), {
      wrapper: makeWrapper(queryClient),
    })

    await act(async () => {
      await result.current.mutateAsync({ id: 'appt-1', status: 'completed' })
    })

    expect(updateMock).toHaveBeenCalledWith({ status: 'completed' })
    expect(eqMock).toHaveBeenCalledWith('id', 'appt-1')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['appointments'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['today-appointments'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['dashboard-clinic-kpis'] })
  })
})