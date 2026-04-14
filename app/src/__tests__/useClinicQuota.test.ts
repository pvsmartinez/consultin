import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from './testUtils'
import { useClinicQuota } from '../hooks/useClinicQuota'
import type { Clinic } from '../types'

const mockFrom = vi.fn()

vi.mock('../services/supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
  },
}))

function makeWrapper(queryClient = makeQueryClient()) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

const baseClinic: Clinic = {
  id: 'clinic-1',
  name: 'Clínica Demo',
  cnpj: null,
  phone: null,
  email: null,
  address: null,
  city: 'São Paulo',
  state: 'SP',
  slotDurationMinutes: 30,
  workingHours: {},
  customPatientFields: [],
  patientFieldConfig: {},
  customProfessionalFields: [],
  professionalFieldConfig: {},
  anamnesisFields: [],
  allowSelfRegistration: true,
  acceptedPaymentMethods: ['pix'],
  paymentTiming: 'after_appointment',
  cancellationHours: 24,
  onboardingCompleted: true,
  createdAt: '2026-04-01T10:00:00.000Z',
  modulesEnabled: ['financial'],
  paymentsEnabled: true,
  billingOverrideEnabled: false,
  asaasCustomerId: null,
  asaasSubscriptionId: null,
  subscriptionStatus: 'ACTIVE',
  subscriptionTier: 'basic',
  trialEndsAt: null,
  whatsappEnabled: false,
  whatsappPhoneNumberId: null,
  whatsappPhoneDisplay: null,
  whatsappWabaId: null,
  whatsappVerifyToken: null,
  waRemindersd1: false,
  waRemindersd0: false,
  waReminderD1Text: null,
  waReminderD0Text: null,
  waProfessionalAgenda: false,
  waAttendantInbox: false,
  waAiModel: 'google/gemini-2.0-flash-exp:free',
  waAiCustomPrompt: null,
  waAiAllowSchedule: false,
  waAiAllowConfirm: false,
  waAiAllowCancel: false,
  allowProfessionalSelection: true,
}

describe('useClinicQuota', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps trial clinics unblocked even with high usage', async () => {
    const chainable = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
    } as Record<string, unknown>

    Object.assign(chainable, {
      then(resolve: (value: unknown) => void, reject?: (reason: unknown) => void) {
        return Promise.resolve({ count: 99, error: null }).then(resolve, reject)
      },
    })

    mockFrom.mockReturnValue(chainable)

    const clinic: Clinic = {
      ...baseClinic,
      subscriptionTier: 'trial',
      subscriptionStatus: null,
      trialEndsAt: '2099-04-20T12:00:00.000Z',
    }

    const { result } = renderHook(() => useClinicQuota(clinic), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.used).toBe(99))

    expect(result.current.trialActive).toBe(true)
    expect(result.current.subscriptionRequired).toBe(false)
    expect(result.current.exceeded).toBe(false)
    expect(result.current.limit).toBeNull()
  })

  it('flags quota exceeded when a paid tier reaches its monthly limit', async () => {
    const chainable = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
    } as Record<string, unknown>

    Object.assign(chainable, {
      then(resolve: (value: unknown) => void, reject?: (reason: unknown) => void) {
        return Promise.resolve({ count: 40, error: null }).then(resolve, reject)
      },
    })

    mockFrom.mockReturnValue(chainable)

    const clinic: Clinic = {
      ...baseClinic,
      subscriptionTier: 'basic',
      subscriptionStatus: 'ACTIVE',
      trialEndsAt: '2000-04-01T12:00:00.000Z',
    }

    const { result } = renderHook(() => useClinicQuota(clinic), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.used).toBe(40))

    expect(result.current.limit).toBe(40)
    expect(result.current.exceeded).toBe(true)
    expect(result.current.subscriptionRequired).toBe(false)
  })

  it('requires subscription when the trial has ended and there is no active billing', async () => {
    const chainable = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
    } as Record<string, unknown>

    Object.assign(chainable, {
      then(resolve: (value: unknown) => void, reject?: (reason: unknown) => void) {
        return Promise.resolve({ count: 5, error: null }).then(resolve, reject)
      },
    })

    mockFrom.mockReturnValue(chainable)

    const clinic: Clinic = {
      ...baseClinic,
      subscriptionTier: 'trial',
      subscriptionStatus: 'INACTIVE',
      billingOverrideEnabled: false,
      trialEndsAt: '2000-04-01T12:00:00.000Z',
    }

    const { result } = renderHook(() => useClinicQuota(clinic), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.used).toBe(5))

    expect(result.current.trialActive).toBe(false)
    expect(result.current.subscriptionRequired).toBe(true)
    expect(result.current.exceeded).toBe(false)
  })
})