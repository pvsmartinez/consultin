import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from './testUtils'
import { usePatientRecords } from '../hooks/usePatientRecords'
import type { PatientRecord } from '../types'

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

const attachmentRecord: PatientRecord = {
  id: 'record-1',
  clinicId: 'clinic-1',
  patientId: 'patient-1',
  appointmentId: null,
  createdBy: 'user-1',
  createdByName: 'Dra. Ana',
  type: 'attachment',
  content: null,
  fileName: 'laudo.pdf',
  filePath: 'clinic-1/patient-1/1713000000000_laudo.pdf',
  fileMime: 'application/pdf',
  fileSize: 1024,
  createdAt: '2026-04-13T10:00:00.000Z',
}

describe('usePatientRecords', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(Date, 'now').mockReturnValue(1713000000000)
    storageFrom.mockReturnValue({
      upload: uploadMock,
      remove: removeMock,
      createSignedUrl: createSignedUrlMock,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads patient records with creator information', async () => {
    const chainable = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
    } as Record<string, unknown>

    Object.assign(chainable, {
      then(resolve: (value: unknown) => void, reject?: (reason: unknown) => void) {
        return Promise.resolve({
          data: [{
            id: 'record-1',
            clinic_id: 'clinic-1',
            patient_id: 'patient-1',
            appointment_id: null,
            created_by: 'user-1',
            type: 'note',
            content: 'Paciente relatou dor.',
            file_name: null,
            file_path: null,
            file_mime: null,
            file_size: null,
            created_at: '2026-04-13T10:00:00.000Z',
            creator: { name: 'Dra. Ana' },
          }],
          error: null,
        }).then(resolve, reject)
      },
    })

    mockFrom.mockReturnValue(chainable)

    const { result } = renderHook(() => usePatientRecords('patient-1'), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.[0].createdByName).toBe('Dra. Ana')
    expect(chainable.eq).toHaveBeenCalledWith('patient_id', 'patient-1')
  })

  it('adds a note and invalidates the patient record list', async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        id: 'record-2',
        clinic_id: 'clinic-1',
        patient_id: 'patient-1',
        appointment_id: 'appt-1',
        created_by: 'user-1',
        type: 'note',
        content: 'Paciente melhorou.',
        file_name: null,
        file_path: null,
        file_mime: null,
        file_size: null,
        created_at: '2026-04-13T11:00:00.000Z',
        creator: { name: 'Dra. Ana' },
      },
      error: null,
    })
    const insertMock = vi.fn(() => ({ select: vi.fn().mockReturnValue({ single: singleMock }) }))
    mockFrom.mockReturnValue({ insert: insertMock })

    const queryClient = makeQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => usePatientRecords('patient-1'), {
      wrapper: makeWrapper(queryClient),
    })

    await act(async () => {
      const note = await result.current.addNote.mutateAsync({
        content: 'Paciente melhorou.',
        appointmentId: 'appt-1',
      })

      expect(note.content).toBe('Paciente melhorou.')
    })

    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      clinic_id: 'clinic-1',
      patient_id: 'patient-1',
      created_by: 'user-1',
      type: 'note',
    }))
    expect(invalidateSpy).toHaveBeenCalled()
  })

  it('uploads an attachment and stores the patient record metadata', async () => {
    uploadMock.mockResolvedValue({ error: null })
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        id: 'record-1',
        clinic_id: 'clinic-1',
        patient_id: 'patient-1',
        appointment_id: null,
        created_by: 'user-1',
        type: 'attachment',
        content: null,
        file_name: 'laudo.pdf',
        file_path: 'clinic-1/patient-1/1713000000000_laudo.pdf',
        file_mime: 'application/pdf',
        file_size: 4,
        created_at: '2026-04-13T11:00:00.000Z',
        creator: { name: 'Dra. Ana' },
      },
      error: null,
    })
    const insertMock = vi.fn(() => ({ select: vi.fn().mockReturnValue({ single: singleMock }) }))
    mockFrom.mockReturnValue({ insert: insertMock })

    const { result } = renderHook(() => usePatientRecords('patient-1'), {
      wrapper: makeWrapper(),
    })

    await act(async () => {
      const uploaded = await result.current.uploadFile.mutateAsync({
        file: new File(['pdf'], 'laudo.pdf', { type: 'application/pdf' }),
      })

      expect(uploaded.fileName).toBe('laudo.pdf')
    })

    expect(storageFrom).toHaveBeenCalledWith('patient-files')
    expect(uploadMock).toHaveBeenCalledWith(
      'clinic-1/patient-1/1713000000000_laudo.pdf',
      expect.any(File),
      { contentType: 'application/pdf', upsert: false },
    )
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      file_name: 'laudo.pdf',
      file_path: 'clinic-1/patient-1/1713000000000_laudo.pdf',
      file_mime: 'application/pdf',
    }))
  })

  it('deletes attachments from storage before removing the record row', async () => {
    removeMock.mockResolvedValue({ error: null })
    const eqMock = vi.fn().mockResolvedValue({ error: null })
    const deleteMock = vi.fn(() => ({ eq: eqMock }))
    mockFrom.mockReturnValue({ delete: deleteMock })

    const queryClient = makeQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => usePatientRecords('patient-1'), {
      wrapper: makeWrapper(queryClient),
    })

    await act(async () => {
      await result.current.deleteRecord.mutateAsync(attachmentRecord)
    })

    expect(removeMock).toHaveBeenCalledWith([attachmentRecord.filePath])
    expect(eqMock).toHaveBeenCalledWith('id', 'record-1')
    expect(invalidateSpy).toHaveBeenCalled()
  })

  it('creates a signed URL for an attachment', async () => {
    createSignedUrlMock.mockResolvedValue({
      data: { signedUrl: 'https://supabase.test/signed' },
      error: null,
    })
    mockFrom.mockReturnValue({})

    const { result } = renderHook(() => usePatientRecords('patient-1'), {
      wrapper: makeWrapper(),
    })

    await expect(result.current.getAttachmentUrl('clinic-1/patient-1/file.pdf'))
      .resolves.toBe('https://supabase.test/signed')

    expect(createSignedUrlMock).toHaveBeenCalledWith('clinic-1/patient-1/file.pdf', 3600)
  })
})