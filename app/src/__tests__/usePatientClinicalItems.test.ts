import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from './testUtils'
import { usePatientClinicalItems } from '../hooks/usePatientClinicalItems'

const mockFrom = vi.fn()

vi.mock('../services/supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
  },
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuthContext: () => ({ profile: { id: 'user-1', clinicId: 'clinic-1' } }),
}))

function makeWrapper(queryClient = makeQueryClient()) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

function makeQueryChain(data: unknown[]) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    then(resolve: (value: unknown) => void, reject?: (reason: unknown) => void) {
      return Promise.resolve({ data, error: null }).then(resolve, reject)
    },
  } as Record<string, unknown>

  return chain
}

describe('usePatientClinicalItems', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads structured clinical items and prostheses for a patient', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'patient_clinical_items') {
        return makeQueryChain([
          {
            id: 'item-1',
            clinic_id: 'clinic-1',
            patient_id: 'patient-1',
            created_by: 'user-1',
            category: 'request',
            item_type: 'exam_request',
            status: 'in_review',
            title: 'Raio X panorâmico',
            description: 'Solicitar exame antes do retorno.',
            notes: null,
            requested_for_date: '2026-05-09',
            issued_on: null,
            completed_on: null,
            metadata: { printableBody: 'Solicito exame panorâmico.', reviewNotes: 'Conferir assinatura.' },
            created_at: '2026-05-08T12:00:00.000Z',
            updated_at: '2026-05-08T12:00:00.000Z',
            creator: { name: 'Dra. Ana' },
          },
        ])
      }

      if (table === 'patient_prostheses') {
        return makeQueryChain([
          {
            id: 'prosthesis-1',
            clinic_id: 'clinic-1',
            patient_id: 'patient-1',
            created_by: 'user-1',
            name: 'Prótese parcial superior',
            tooth_region: '11 a 13',
            laboratory_name: 'Lab Sorriso',
            status: 'in_production',
            started_on: '2026-05-01',
            due_on: '2026-05-15',
            installed_on: null,
            notes: 'Aguardando prova.',
            metadata: {},
            created_at: '2026-05-08T12:00:00.000Z',
            updated_at: '2026-05-08T12:00:00.000Z',
            creator: { name: 'Dra. Ana' },
          },
        ])
      }

      throw new Error(`Unexpected table: ${table}`)
    })

    const { result } = renderHook(() => usePatientClinicalItems('patient-1'), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => {
      expect(result.current.itemsQuery.isSuccess).toBe(true)
      expect(result.current.prosthesesQuery.isSuccess).toBe(true)
    })

    expect(result.current.itemsQuery.data?.[0].title).toBe('Raio X panorâmico')
    expect(result.current.itemsQuery.data?.[0].createdByName).toBe('Dra. Ana')
    expect(result.current.prosthesesQuery.data?.[0].laboratoryName).toBe('Lab Sorriso')
    expect(result.current.itemsQuery.data?.[0].status).toBe('in_review')
    expect(result.current.itemsQuery.data?.[0].metadata.reviewNotes).toBe('Conferir assinatura.')
    expect(result.current.prosthesesQuery.data?.[0].status).toBe('in_production')
  })

  it('creates a new clinical item and invalidates the clinical list', async () => {
    const insertSingleMock = vi.fn().mockResolvedValue({
      data: {
        id: 'item-2',
        clinic_id: 'clinic-1',
        patient_id: 'patient-1',
        created_by: 'user-1',
        category: 'document',
        item_type: 'medical_certificate',
        status: 'issued',
        title: 'Atestado de trabalho',
        description: '48 horas de repouso.',
        notes: null,
        requested_for_date: null,
        issued_on: '2026-05-08',
        completed_on: null,
        metadata: {},
        created_at: '2026-05-08T12:30:00.000Z',
        updated_at: '2026-05-08T12:30:00.000Z',
        creator: { name: 'Dra. Ana' },
      },
      error: null,
    })
    const insertMock = vi.fn(() => ({
      select: vi.fn().mockReturnValue({ single: insertSingleMock }),
    }))

    mockFrom.mockImplementation((table: string) => {
      if (table === 'patient_clinical_items') {
        const chain = makeQueryChain([]) as Record<string, unknown>
        chain.insert = insertMock
        return chain
      }

      if (table === 'patient_prostheses') {
        return makeQueryChain([])
      }

      throw new Error(`Unexpected table: ${table}`)
    })

    const queryClient = makeQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => usePatientClinicalItems('patient-1'), {
      wrapper: makeWrapper(queryClient),
    })

    await act(async () => {
      const created = await result.current.createItem.mutateAsync({
        category: 'document',
        itemType: 'medical_certificate',
        status: 'issued',
        title: 'Atestado de trabalho',
        description: '48 horas de repouso.',
        notes: null,
        requestedForDate: null,
        issuedOn: '2026-05-08',
        completedOn: null,
        metadata: {},
      })

      expect(created.title).toBe('Atestado de trabalho')
      expect(created.createdByName).toBe('Dra. Ana')
    })

    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      clinic_id: 'clinic-1',
      patient_id: 'patient-1',
      created_by: 'user-1',
      category: 'document',
      item_type: 'medical_certificate',
    }))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['patient-clinical-items', 'patient-1'] })
  })
})