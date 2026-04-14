import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from './testUtils'
import {
  usePatientFiles,
  useUploadPatientFile,
  useDeletePatientFile,
  getFileSignedUrl,
  formatBytes,
} from '../hooks/usePatientFiles'

const mockFrom = vi.fn()
const storageFrom = vi.fn()
const uploadMock = vi.fn()
const removeMock = vi.fn()
const createSignedUrlMock = vi.fn()

vi.mock('../services/supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
    storage: {
      from: (bucket: string) => storageFrom(bucket),
    },
  },
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuthContext: () => ({ profile: { id: 'user-1', clinicId: 'clinic-1' } }),
}))

function makeWrapper(queryClient = makeQueryClient()) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('usePatientFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'uuid-1') })
    storageFrom.mockReturnValue({
      upload: uploadMock,
      remove: removeMock,
      createSignedUrl: createSignedUrlMock,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads files uploaded for a patient', async () => {
    const chainable = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
    } as Record<string, unknown>

    Object.assign(chainable, {
      then(resolve: (value: unknown) => void, reject?: (reason: unknown) => void) {
        return Promise.resolve({
          data: [{
            id: 'file-1',
            patient_id: 'patient-1',
            clinic_id: 'clinic-1',
            name: 'laudo.pdf',
            storage_path: 'clinic-1/patient-1/uuid-1/laudo.pdf',
            size_bytes: 2048,
            mime_type: 'application/pdf',
            uploaded_by: 'user-1',
            created_at: '2026-04-13T10:00:00.000Z',
          }],
          error: null,
        }).then(resolve, reject)
      },
    })

    mockFrom.mockReturnValue(chainable)

    const { result } = renderHook(() => usePatientFiles('patient-1'), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.[0].name).toBe('laudo.pdf')
    expect(chainable.eq).toHaveBeenCalledWith('patient_id', 'patient-1')
  })

  it('uploads a patient file and rolls back storage if the DB insert fails', async () => {
    uploadMock.mockResolvedValue({ error: null })
    const insertMock = vi.fn().mockResolvedValue({ error: { message: 'db failed' } })
    mockFrom.mockReturnValue({ insert: insertMock })

    const { result } = renderHook(() => useUploadPatientFile('patient-1'), {
      wrapper: makeWrapper(),
    })

    await expect(result.current.mutateAsync({
      clinicId: 'clinic-1',
      file: new File(['pdf'], 'laudo.pdf', { type: 'application/pdf' }),
    })).rejects.toMatchObject({ message: 'db failed' })

    expect(uploadMock).toHaveBeenCalledWith(
      'clinic-1/patient-1/uuid-1/laudo.pdf',
      expect.any(File),
      { upsert: false },
    )
    expect(removeMock).toHaveBeenCalledWith(['clinic-1/patient-1/uuid-1/laudo.pdf'])
  })

  it('deletes the file row and tolerates missing storage files', async () => {
    removeMock.mockRejectedValue(new Error('already deleted'))
    const eqMock = vi.fn().mockResolvedValue({ error: null })
    const deleteMock = vi.fn(() => ({ eq: eqMock }))
    mockFrom.mockReturnValue({ delete: deleteMock })

    const queryClient = makeQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useDeletePatientFile('patient-1'), {
      wrapper: makeWrapper(queryClient),
    })

    await act(async () => {
      await result.current.mutateAsync({
        fileId: 'file-1',
        storagePath: 'clinic-1/patient-1/uuid-1/laudo.pdf',
      })
    })

    expect(eqMock).toHaveBeenCalledWith('id', 'file-1')
    expect(removeMock).toHaveBeenCalledWith(['clinic-1/patient-1/uuid-1/laudo.pdf'])
    expect(invalidateSpy).toHaveBeenCalled()
  })

  it('generates a signed URL and formats byte sizes for display', async () => {
    createSignedUrlMock.mockResolvedValue({
      data: { signedUrl: 'https://supabase.test/file' },
      error: null,
    })

    await expect(getFileSignedUrl('clinic-1/patient-1/uuid-1/laudo.pdf'))
      .resolves.toBe('https://supabase.test/file')

    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB')
    expect(formatBytes(null)).toBe('')
  })
})