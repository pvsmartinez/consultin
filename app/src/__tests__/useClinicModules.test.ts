/**
 * Tests for useClinicModules — read/write of clinic feature toggles.
 *
 * Covers:
 *  - hasRooms, hasStaff, hasWhatsApp, hasFinancial, hasServices flags
 *  - enableModule() adds the module to the array
 *  - disableModule() removes the module from the array
 *  - enableModule() no-ops if module already enabled
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import React from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from './testUtils'
import { useClinicModules } from '../hooks/useClinicModules'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockFrom = vi.fn()

vi.mock('../services/supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
  },
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuthContext: () => ({
    profile: { id: 'user-1', clinicId: 'clinic-1' },
  }),
}))

// useClinicModules depends on useClinic
vi.mock('../hooks/useClinic', () => ({
  useClinic: vi.fn(),
}))

import { useClinic } from '../hooks/useClinic'

function makeWrapper(qc = makeQueryClient()) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useClinicModules', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns all flags as false with empty modulesEnabled', () => {
    vi.mocked(useClinic).mockReturnValue({
      data: { id: 'clinic-1', modulesEnabled: [] },
    } as unknown as ReturnType<typeof useClinic>)

    const { result } = renderHook(() => useClinicModules(), { wrapper: makeWrapper() })

    expect(result.current.hasRooms).toBe(false)
    expect(result.current.hasStaff).toBe(false)
    expect(result.current.hasWhatsApp).toBe(false)
    expect(result.current.hasFinancial).toBe(false)
    expect(result.current.hasServices).toBe(false)
  })

  it('returns true flags for enabled modules', () => {
    vi.mocked(useClinic).mockReturnValue({
      data: { id: 'clinic-1', modulesEnabled: ['rooms', 'financial'] },
    } as ReturnType<typeof useClinic>)

    const { result } = renderHook(() => useClinicModules(), { wrapper: makeWrapper() })

    expect(result.current.hasRooms).toBe(true)
    expect(result.current.hasFinancial).toBe(true)
    expect(result.current.hasStaff).toBe(false)
    expect(result.current.hasWhatsApp).toBe(false)
  })

  it('enableModule calls DB with the new module list', async () => {
    vi.mocked(useClinic).mockReturnValue({
      data: { id: 'clinic-1', modulesEnabled: ['rooms'] },
    } as ReturnType<typeof useClinic>)

    const updateSpy = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    mockFrom.mockReturnValue({ update: updateSpy })

    const { result } = renderHook(() => useClinicModules(), { wrapper: makeWrapper() })

    await act(async () => {
      await result.current.enableModule('financial')
    })

    expect(updateSpy).toHaveBeenCalledWith({ modules_enabled: ['rooms', 'financial'] })
  })

  it('disableModule removes the module from the list', async () => {
    vi.mocked(useClinic).mockReturnValue({
      data: { id: 'clinic-1', modulesEnabled: ['rooms', 'staff'] },
    } as ReturnType<typeof useClinic>)

    const updateSpy = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    mockFrom.mockReturnValue({ update: updateSpy })

    const { result } = renderHook(() => useClinicModules(), { wrapper: makeWrapper() })

    await act(async () => {
      await result.current.disableModule('rooms')
    })

    expect(updateSpy).toHaveBeenCalledWith({ modules_enabled: ['staff'] })
  })

  it('enableModule is a no-op if module is already enabled', async () => {
    vi.mocked(useClinic).mockReturnValue({
      data: { id: 'clinic-1', modulesEnabled: ['rooms'] },
    } as ReturnType<typeof useClinic>)

    const updateSpy = vi.fn()
    mockFrom.mockReturnValue({ update: updateSpy })

    const { result } = renderHook(() => useClinicModules(), { wrapper: makeWrapper() })

    await act(async () => {
      await result.current.enableModule('rooms')
    })

    expect(updateSpy).not.toHaveBeenCalled()
  })
})
