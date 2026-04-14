import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from './testUtils'
import { usePatientImportJob } from '../hooks/usePatientImportJobs'

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

describe('usePatientImportJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads a patient import job by id', async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        id: 'job-1',
        clinic_id: 'clinic-1',
        created_at: '2026-04-13T10:00:00.000Z',
        created_by: 'user-1',
        created_custom_fields: 2,
        custom_fields: [],
        error_message: null,
        failed_rows: 0,
        file_name: 'pacientes.xlsx',
        file_size_bytes: 1234,
        finished_at: null,
        imported_rows: 0,
        mapping: {},
        processed_rows: 10,
        sample_errors: [],
        skipped_rows: 1,
        source_headers: ['Nome'],
        started_at: '2026-04-13T10:00:10.000Z',
        status: 'processing',
        storage_path: 'clinic-1/job-1/pacientes.xlsx',
        total_rows: 20,
        updated_at: '2026-04-13T10:01:00.000Z',
      },
      error: null,
    })

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: singleMock,
    })

    const { result } = renderHook(() => usePatientImportJob('job-1'), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.status).toBe('processing')
    expect(result.current.data?.processed_rows).toBe(10)
  })

  it('does not query when job id is null', () => {
    renderHook(() => usePatientImportJob(null), { wrapper: makeWrapper() })
    expect(mockFrom).not.toHaveBeenCalled()
  })
})