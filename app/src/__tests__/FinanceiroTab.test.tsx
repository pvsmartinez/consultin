import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient, MOCK_ADMIN_PROFILE } from './testUtils'
import type { Clinic } from '../types'

vi.mock('../contexts/AuthContext', () => ({
  useAuthContext: () => ({ profile: MOCK_ADMIN_PROFILE }),
}))
vi.mock('../hooks/useBilling', () => ({
  useActivateClinicBilling:  () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCancelClinicBilling:    () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpgradeClinicBilling:   () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('../hooks/useClinicQuota', () => ({
  useClinicQuota: () => ({ tier: 'free', currentProfCount: 1, maxProfCount: 1 }),
  TIER_LABELS:  { free: 'Grátis', basic: 'Básico', professional: 'Profissional', unlimited: 'Ilimitado' },
  TIER_PRICES:  { free: 0, basic: 4900, professional: 9900, unlimited: 19900 },
  TIER_LIMITS:  { free: { professionals: 1 }, basic: { professionals: 3 }, professional: { professionals: 10 }, unlimited: { professionals: 999 } },
}))
vi.mock('../lib/gtag', () => ({ gtagEvent: vi.fn() }))
vi.mock('../utils/validators', () => ({
  validateCpfCnpj: () => true,
  maskCpfCnpj: (v: string) => v,
  maskCEP: (v: string) => v,
  fetchAddressByCEP: vi.fn(),
  formatPhone: (v: string) => v,
}))

import FinanceiroTab from '../pages-v1/settings/FinanceiroTab'

function makeClinic(overrides: Partial<Clinic> = {}): Clinic {
  return {
    id: 'c1', name: 'Clínica', subscriptionStatus: 'INACTIVE',
    acceptedPaymentMethods: ['credit_card'], paymentTiming: 'before', cancellationHours: 24,
    modules: [], anamnesisFields: [], slotDurationMinutes: 30, workingHours: {},
    ...overrides,
  } as unknown as Clinic
}

function setup(overrides: Partial<Clinic> = {}) {
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <FinanceiroTab clinic={makeClinic(overrides)} />
    </QueryClientProvider>
  )
}

describe('FinanceiroTab', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders subscription status for INACTIVE clinic', () => {
    setup({ subscriptionStatus: 'INACTIVE', paymentsEnabled: true })
    expect(screen.getAllByText(/inativa/i).length).toBeGreaterThan(0)
  })

  it('renders subscription status for ACTIVE clinic', () => {
    setup({ subscriptionStatus: 'ACTIVE', paymentsEnabled: true })
    expect(screen.getAllByText(/ativa/i).length).toBeGreaterThan(0)
  })

  it('shows tier selection', () => {
    setup()
    expect(screen.getAllByText(/básico/i).length).toBeGreaterThan(0)
  })

  it('renders billing form for inactive plan', () => {
    setup({ subscriptionStatus: 'INACTIVE' })
    // Should show billing form fields
    expect(screen.getByText(/responsável/i)).toBeDefined()
  })
})
