import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from './testUtils'
import { useCreateInvite, useMyInvite, useResendInviteEmail } from '../hooks/useInvites'

const mockFrom = vi.fn()
const invokeMock = vi.fn()
const toastSuccess = vi.fn()
const toastInfo = vi.fn()
const toastError = vi.fn()

vi.mock('../services/supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuthContext: () => ({ profile: { clinicId: 'clinic-1' } }),
}))

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    info: (...args: unknown[]) => toastInfo(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}))

function makeWrapper(queryClient = makeQueryClient()) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useInvites', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads the current user invite with clinic name', async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({
      data: {
        id: 'invite-1',
        clinic_id: 'clinic-1',
        email: 'joao@teste.com',
        roles: ['professional'],
        name: 'João',
        invited_by: 'user-1',
        used_at: null,
        created_at: '2026-04-13T10:00:00.000Z',
        clinics: { name: 'Clínica Centro' },
      },
      error: null,
    })

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      maybeSingle: maybeSingleMock,
    })

    const { result } = renderHook(() => useMyInvite('joao@teste.com'), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.clinicName).toBe('Clínica Centro')
  })

  it('creates an invite and returns gracefully when email sending fails', async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        id: 'invite-1',
        clinic_id: 'clinic-1',
        email: 'joao@teste.com',
        roles: ['professional'],
        name: 'João',
        invited_by: 'user-1',
        used_at: null,
        created_at: '2026-04-13T10:00:00.000Z',
        clinics: { name: 'Clínica Centro' },
      },
      error: null,
    })
    const insertMock = vi.fn(() => ({ select: vi.fn().mockReturnValue({ single: singleMock }) }))
    mockFrom.mockReturnValue({ insert: insertMock })
    invokeMock.mockRejectedValue(new Error('send failed'))

    const { result } = renderHook(() => useCreateInvite(), { wrapper: makeWrapper() })

    await act(async () => {
      const response = await result.current.mutateAsync({ email: 'joao@teste.com', name: 'João' })
      expect(response.invite.email).toBe('joao@teste.com')
      expect(response.emailSent).toBe(false)
      expect(response.emailReason).toBe('send_error')
    })
  })

  it('shows info toast when resend detects an already registered user', async () => {
    invokeMock.mockResolvedValue({ data: { sent: false, reason: 'already_registered' }, error: null })

    const { result } = renderHook(() => useResendInviteEmail(), { wrapper: makeWrapper() })

    await act(async () => {
      await result.current.mutateAsync('invite-1')
    })

    expect(toastInfo).toHaveBeenCalled()
  })
})