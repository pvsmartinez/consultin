import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient, MOCK_ADMIN_PROFILE } from './testUtils'
import type { Clinic } from '../types'

vi.mock('../contexts/AuthContext', () => ({
  useAuthContext: () => ({ profile: MOCK_ADMIN_PROFILE }),
}))
vi.mock('../hooks/useClinicPublicPage', () => ({
  useClinicPublicPage: () => ({
    data: null, isLoading: false, upsert: { mutateAsync: vi.fn() },
  }),
}))
vi.mock('../hooks/useProfessionals', () => {
  const data: never[] = []
  return {
    useProfessionals: () => ({ data, isLoading: false }),
  }
})
vi.mock('../services/supabase', () => ({
  supabase: {
    storage: { from: () => ({ upload: vi.fn().mockResolvedValue({ error: null }), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
  },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import PaginaPublicaTab from '../pages-v1/settings/PaginaPublicaTab'

function makeClinic(): Clinic {
  return {
    id: 'c1', name: 'Clínica',
    acceptedPaymentMethods: [], paymentTiming: 'before', cancellationHours: 24,
    subscriptionStatus: 'INACTIVE', modules: [], anamnesisFields: [],
    slotDurationMinutes: 30, workingHours: {},
  } as unknown as Clinic
}

function setup() {
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <PaginaPublicaTab clinic={makeClinic()} />
    </QueryClientProvider>
  )
}

describe('PaginaPublicaTab', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders page title or description text', () => {
    setup()
    expect(screen.getByText(/página pública da clínica/i)).toBeDefined()
  })

  it('renders slug input field', () => {
    setup()
    const slugInput = screen.getByPlaceholderText(/minha-clinica/i)
    expect(slugInput).toBeDefined()
  })

  it('renders feature toggles', () => {
    setup()
    // Should have at least one toggle for page features
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0)
  })

  it('renders public page link', () => {
    setup()
    expect(screen.getAllByText(/página pública/i).length).toBeGreaterThan(0)
  })
})
