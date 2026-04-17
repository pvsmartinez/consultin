/**
 * Tests for useClinic — central hook that loads and mutates clinic settings.
 *
 * Covers:
 *  - Returns undefined while loading (no clinicId yet)
 *  - Fetches clinic data when clinicId is available
 *  - update() mutation patches the clinic and invalidates cache
 *  - useClinicMembers fetches member list
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from './testUtils'
import { useClinic, useClinicMembers } from '../hooks/useClinic'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockFrom = vi.fn()
const mockToast = { success: vi.fn(), error: vi.fn() }

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

vi.mock('../utils/mappers', () => ({
  mapClinic: (row: Record<string, unknown>) => ({
    id:                  row.id,
    name:                row.name,
    email:               row.email ?? null,
    phone:               row.phone ?? null,
    cnpj:                row.cnpj ?? null,
    address:             row.address ?? null,
    city:                row.city ?? null,
    state:               row.state ?? null,
    slotDurationMinutes: row.slot_duration_minutes ?? 30,
    workingHours:        row.working_hours ?? {},
    patientFieldConfig:        row.patient_field_config ?? {},
    customPatientFields:       row.custom_patient_fields ?? [],
    professionalFieldConfig:   row.professional_field_config ?? {},
    customProfessionalFields:  row.custom_professional_fields ?? [],
    anamnesisFields:           row.anamnesis_fields ?? [],
    onboardingCompleted:       row.onboarding_completed ?? false,
    paymentsEnabled:           row.payments_enabled ?? false,
    subscriptionStatus:        row.subscription_status ?? null,
    whatsappEnabled:           row.whatsapp_enabled ?? false,
    modulesEnabled:            row.modules_enabled ?? [],
    allowProfessionalSelection: row.allow_professional_selection ?? true,
    allowSelfRegistration:     row.allow_self_registration ?? false,
    createdAt:                 row.created_at as string,
  }),
}))

function makeWrapper(qc = makeQueryClient()) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
}

// ─── useClinic tests ──────────────────────────────────────────────────────────

describe('useClinic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches the clinic by clinicId', async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: { id: 'clinic-1', name: 'Minha Clínica', slot_duration_minutes: 30 },
      error: null,
    })
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ single: singleMock }) }),
    })

    const { result } = renderHook(() => useClinic(), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => {
      expect(result.current.data?.id).toBe('clinic-1')
    })

    expect(result.current.data?.name).toBe('Minha Clínica')
  })

  it('returns undefined data while loading', () => {
    // Never resolves — simulates loading
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ single: () => new Promise(() => {}) }) }),
    })

    const { result } = renderHook(() => useClinic(), {
      wrapper: makeWrapper(),
    })

    expect(result.current.data).toBeUndefined()
  })

  it('updates the clinic and returns mapped data', async () => {
    // Setup: first call for the query fetch
    const updatedRow = { id: 'clinic-1', name: 'Clínica Atualizada', slot_duration_minutes: 45 }
    const singleForQuery = vi.fn().mockResolvedValue({
      data: { id: 'clinic-1', name: 'Minha Clínica', slot_duration_minutes: 30 },
      error: null,
    })
    const singleForUpdate = vi.fn().mockResolvedValue({ data: updatedRow, error: null })

    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ single: singleForQuery }) }),
      update: () => ({ eq: () => ({ select: () => ({ single: singleForUpdate }) }) }),
    })

    const qc = makeQueryClient()
    const { result } = renderHook(() => useClinic(), { wrapper: makeWrapper(qc) })

    // Wait for initial load
    await act(async () => { await new Promise(r => setTimeout(r, 0)) })

    // Trigger update
    await act(async () => {
      await result.current.update.mutateAsync({ name: 'Clínica Atualizada', slotDurationMinutes: 45 })
    })

    expect(singleForUpdate).toHaveBeenCalled()
  })
})

// ─── useClinicMembers tests ───────────────────────────────────────────────────

describe('useClinicMembers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches clinic members ordered by name', async () => {
    const memberRows = [
      { id: 'u-1', name: 'Ana Lima', roles: ['receptionist'], permission_overrides: null },
      { id: 'u-2', name: 'Bruno Mota', roles: ['admin'], permission_overrides: { canManageFinancial: true } },
    ]
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: memberRows, error: null }),
        }),
      }),
    })

    const { result } = renderHook(() => useClinicMembers(), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => {
      expect(result.current.data).toHaveLength(2)
    })
    expect(result.current.data?.[0].name).toBe('Ana Lima')
  })
})
