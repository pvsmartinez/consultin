import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from './testUtils'
import type { Clinic } from '../types'

const mockClinicUpdate = { mutateAsync: vi.fn() }
vi.mock('../hooks/useClinic', () => ({
  useClinic: () => ({ update: mockClinicUpdate }),
}))
vi.mock('../hooks/useWhatsappFaqs', () => ({
  useWhatsappFaqs:        () => ({ data: [], isLoading: false }),
  useCreateWhatsappFaq:   () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateWhatsappFaq:   () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteWhatsappFaq:   () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('../services/whatsapp', () => ({
  storeWhatsAppToken:    vi.fn(),
  completeEmbeddedSignup: vi.fn(),
}))
vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query')
  return { ...actual as object, useQueryClient: () => ({ invalidateQueries: vi.fn() }) }
})
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import WhatsAppTab from '../pages-v1/settings/WhatsAppTab'

function makeClinic(overrides: Partial<Clinic> = {}): Clinic {
  return {
    id: 'c1', name: 'Clínica',
    whatsappPhoneNumberId: null, whatsappPhoneDisplay: null,
    whatsappWabaId: null, waAiModel: null, waAiCustomPrompt: null,
    waReminderD1Text: null, waReminderH2Text: null,
    acceptedPaymentMethods: [], paymentTiming: 'before', cancellationHours: 24,
    subscriptionStatus: 'INACTIVE', modules: [], anamnesisFields: [],
    slotDurationMinutes: 30, workingHours: {},
    ...overrides,
  } as unknown as Clinic
}

function setup(overrides: Partial<Clinic> = {}) {
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <WhatsAppTab clinic={makeClinic(overrides)} />
    </QueryClientProvider>
  )
}

describe('WhatsAppTab', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders WhatsApp heading', () => {
    setup()
    expect(screen.getAllByText(/whatsapp/i).length).toBeGreaterThan(0)
  })

  it('renders connect step when not connected', () => {
    setup({ whatsappPhoneNumberId: null })
    expect(screen.getByText(/conectar|configurar|guia/i)).toBeDefined()
  })

  it('renders phone display when connected', () => {
    setup({
      whatsappPhoneNumberId: '123456',
      whatsappPhoneDisplay: '+55 11 99999-9999',
    })
    expect(screen.getByText(/\+55 11/)).toBeDefined()
  })

  it('renders AI model section', () => {
    setup({ whatsappPhoneNumberId: '123456', whatsappPhoneDisplay: '+55 11 99999-9999' })
    expect(screen.getByText(/modelo|AI/i)).toBeDefined()
  })
})
