import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from './testUtils'
import { useProfessionals } from '../hooks/useProfessionals'

const mockFrom = vi.fn()

vi.mock('../services/supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
  },
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuthContext: () => ({ profile: { clinicId: 'clinic-1' } }),
}))

vi.mock('../utils/mappers', async () => {
  const mapProfessional = (row: Record<string, unknown>) => ({
    id: row.id,
    clinicId: row.clinic_id,
    name: row.name,
    specialty: row.specialty,
    email: row.email ?? null,
    active: row.active,
  })

  return {
    mapProfessional,
  }
})

function makeWrapper(queryClient = makeQueryClient()) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useProfessionals', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads professionals for the current clinic', async () => {
    const chainable = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
    } as Record<string, unknown>

    Object.assign(chainable, {
      then(resolve: (value: unknown) => void, reject?: (reason: unknown) => void) {
        return Promise.resolve({
          data: [{
            id: 'prof-1',
            clinic_id: 'clinic-1',
            name: 'Dra. Ana',
            specialty: 'Odontologia',
            email: 'ana@example.com',
            active: true,
          }],
          error: null,
        }).then(resolve, reject)
      },
    })

    mockFrom.mockReturnValue(chainable)

    const { result } = renderHook(() => useProfessionals(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.[0].name).toBe('Dra. Ana')
    expect(chainable.eq).toHaveBeenCalledWith('clinic_id', 'clinic-1')
  })

  it('creates a professional and invalidates the professionals list', async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        id: 'prof-1',
        clinic_id: 'clinic-1',
        name: 'Dra. Ana',
        specialty: 'Odontologia',
        email: 'ana@example.com',
        active: true,
      },
      error: null,
    })
    const insertMock = vi.fn(() => ({ select: vi.fn().mockReturnValue({ single: singleMock }) }))

    mockFrom.mockReturnValue({ insert: insertMock })

    const queryClient = makeQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useProfessionals(), { wrapper: makeWrapper(queryClient) })

    await act(async () => {
      const created = await result.current.create.mutateAsync({
        name: 'Dra. Ana',
        specialty: 'Odontologia',
        councilId: 'CRO-123',
        phone: '11999999999',
        email: 'ana@example.com',
        active: true,
        userId: null,
        customFields: { idioma: 'pt-BR' },
      })

      expect(created.name).toBe('Dra. Ana')
    })

    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      clinic_id: 'clinic-1',
      council_id: 'CRO-123',
      custom_fields: { idioma: 'pt-BR' },
    }))
    expect(invalidateSpy).toHaveBeenCalled()
  })

  it('toggles professional activity state and invalidates the professionals list', async () => {
    const eqMock = vi.fn().mockResolvedValue({ error: null })
    const updateMock = vi.fn(() => ({ eq: eqMock }))
    mockFrom.mockReturnValue({ update: updateMock })

    const queryClient = makeQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useProfessionals(), { wrapper: makeWrapper(queryClient) })

    await act(async () => {
      await result.current.toggleActive.mutateAsync({ id: 'prof-1', active: false })
    })

    expect(updateMock).toHaveBeenCalledWith({ active: false })
    expect(eqMock).toHaveBeenCalledWith('id', 'prof-1')
    expect(invalidateSpy).toHaveBeenCalled()
  })
})