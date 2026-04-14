import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from './testUtils'
import {
  useServiceTypes,
  useCreateServiceType,
  useUpdateServiceType,
  useDeleteServiceType,
} from '../hooks/useServiceTypes'

const mockFrom = vi.fn()

vi.mock('../services/supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
  },
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuthContext: () => ({ profile: { clinicId: 'clinic-1' } }),
}))

vi.mock('../utils/mappers', () => ({
  mapServiceType: (row: Record<string, unknown>) => ({
    id: row.id,
    clinicId: row.clinic_id,
    name: row.name,
    durationMinutes: row.duration_minutes,
    priceCents: row.price_cents ?? null,
    color: row.color,
    active: row.active,
  }),
}))

function makeWrapper(queryClient = makeQueryClient()) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useServiceTypes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads service types for the current clinic', async () => {
    const chainable = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
    } as Record<string, unknown>

    Object.assign(chainable, {
      then(resolve: (value: unknown) => void, reject?: (reason: unknown) => void) {
        return Promise.resolve({
          data: [{
            id: 'service-1',
            clinic_id: 'clinic-1',
            name: 'Avaliação',
            duration_minutes: 45,
            price_cents: 12000,
            color: '#0ea5b0',
            active: true,
          }],
          error: null,
        }).then(resolve, reject)
      },
    })

    mockFrom.mockReturnValue(chainable)

    const { result } = renderHook(() => useServiceTypes(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.[0].durationMinutes).toBe(45)
    expect(chainable.eq).toHaveBeenCalledWith('clinic_id', 'clinic-1')
  })

  it('creates a service type and invalidates the service list', async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        id: 'service-1',
        clinic_id: 'clinic-1',
        name: 'Avaliação',
        duration_minutes: 45,
        price_cents: 12000,
        color: '#0ea5b0',
        active: true,
      },
      error: null,
    })
    const insertMock = vi.fn(() => ({ select: vi.fn().mockReturnValue({ single: singleMock }) }))

    mockFrom.mockReturnValue({ insert: insertMock })

    const queryClient = makeQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useCreateServiceType(), { wrapper: makeWrapper(queryClient) })

    await act(async () => {
      const created = await result.current.mutateAsync({
        name: 'Avaliação',
        durationMinutes: 45,
        priceCents: 12000,
        color: '#0ea5b0',
        active: true,
      })

      expect(created.name).toBe('Avaliação')
    })

    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      clinic_id: 'clinic-1',
      duration_minutes: 45,
      price_cents: 12000,
    }))
    expect(invalidateSpy).toHaveBeenCalled()
  })

  it('updates only provided service type fields', async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        id: 'service-1',
        clinic_id: 'clinic-1',
        name: 'Retorno',
        duration_minutes: 30,
        price_cents: 9000,
        color: '#111827',
        active: false,
      },
      error: null,
    })
    const eqMock = vi.fn(() => ({ select: vi.fn().mockReturnValue({ single: singleMock }) }))
    const updateMock = vi.fn(() => ({ eq: eqMock }))

    mockFrom.mockReturnValue({ update: updateMock })

    const queryClient = makeQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useUpdateServiceType(), { wrapper: makeWrapper(queryClient) })

    await act(async () => {
      const updated = await result.current.mutateAsync({
        id: 'service-1',
        name: 'Retorno',
        active: false,
      })

      expect(updated.active).toBe(false)
    })

    expect(updateMock).toHaveBeenCalledWith({ name: 'Retorno', active: false })
    expect(eqMock).toHaveBeenCalledWith('id', 'service-1')
    expect(invalidateSpy).toHaveBeenCalled()
  })

  it('deletes a service type and invalidates the service list', async () => {
    const eqMock = vi.fn().mockResolvedValue({ error: null })
    const deleteMock = vi.fn(() => ({ eq: eqMock }))
    mockFrom.mockReturnValue({ delete: deleteMock })

    const queryClient = makeQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useDeleteServiceType(), { wrapper: makeWrapper(queryClient) })

    await act(async () => {
      await result.current.mutateAsync('service-1')
    })

    expect(deleteMock).toHaveBeenCalled()
    expect(eqMock).toHaveBeenCalledWith('id', 'service-1')
    expect(invalidateSpy).toHaveBeenCalled()
  })
})