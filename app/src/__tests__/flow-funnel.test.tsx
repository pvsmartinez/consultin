import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Clinic } from '../types'

const mockTrackPublicEvent = vi.fn()
const mockTrackGenerateLead = vi.fn()
const mockTrackSignup = vi.fn()
const mockTrackWhatsappCtaClick = vi.fn()
const mockGtagEvent = vi.fn()
const mockInvoke = vi.fn()
const mockSignIn = vi.fn()
const mockActivateBilling = vi.fn()

vi.mock('../components/seo/Seo', () => ({
  Seo: () => null,
}))

vi.mock('../lib/publicAnalytics', () => ({
  trackPublicEvent: (...args: unknown[]) => mockTrackPublicEvent(...args),
}))

vi.mock('../lib/googleAds', () => ({
  trackGenerateLead: (...args: unknown[]) => mockTrackGenerateLead(...args),
  trackSignup: (...args: unknown[]) => mockTrackSignup(...args),
  trackOnboardingComplete: vi.fn(),
  trackWhatsappCtaClick: (...args: unknown[]) => mockTrackWhatsappCtaClick(...args),
}))

vi.mock('../lib/gtag', () => ({
  gtagEvent: (...args: unknown[]) => mockGtagEvent(...args),
}))

vi.mock('../services/supabase', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
    auth: { signInWithPassword: (...args: unknown[]) => mockSignIn(...args) },
  },
}))

vi.mock('../hooks/useBilling', () => ({
  useActivateClinicBilling: () => ({ mutateAsync: (...args: unknown[]) => mockActivateBilling(...args), isPending: false }),
  useCancelClinicBilling: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpgradeClinicBilling: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('../hooks/useClinicQuota', () => ({
  useClinicQuota: () => ({
    tier: 'trial',
    used: 0,
    limit: null,
    trialActive: false,
    trialDaysLeft: 0,
    exceeded: false,
    subscriptionRequired: true,
    isLoading: false,
  }),
  TIER_LABELS: {
    trial: 'Período de teste',
    basic: 'Básico',
    professional: 'Profissional',
    unlimited: 'Ilimitado',
  },
  TIER_PRICES: {
    basic: 100,
    professional: 200,
    unlimited: 300,
  },
  TIER_LIMITS: {
    trial: null,
    basic: 40,
    professional: 100,
    unlimited: null,
  },
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuthContext: () => ({
    profile: { id: 'user-owner', name: 'Pedro Martinez', roles: ['admin'] },
  }),
}))

vi.mock('../utils/validators', () => ({
  validateCpfCnpj: () => true,
  maskCpfCnpj: (value: string) => value,
  maskCEP: (value: string) => value,
  fetchAddressByCEP: vi.fn().mockResolvedValue(null),
  formatPhone: (value: string) => value,
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

import LandingPage from '../pages-v1/LandingPage'
import CadastroClinicaPage from '../pages-v1/CadastroClinicaPage'
import FinanceiroTab from '../pages-v1/settings/FinanceiroTab'

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function makeInactiveClinic(overrides: Partial<Clinic> = {}): Clinic {
  return {
    id: 'clinic-1',
    name: 'Clínica Feliz',
    cnpj: null,
    phone: null,
    email: null,
    address: null,
    city: null,
    state: null,
    slotDurationMinutes: 30,
    workingHours: {},
    customPatientFields: [],
    patientFieldConfig: {},
    customProfessionalFields: [],
    professionalFieldConfig: {},
    anamnesisFields: [],
    allowSelfRegistration: true,
    acceptedPaymentMethods: ['credit_card'],
    paymentTiming: 'before_appointment',
    cancellationHours: 24,
    documentTemplates: {
      examRequest: 'Pedido',
      prescription: 'Receita',
      medicalCertificate: 'Atestado',
      consentTerm: 'Termo',
      custom: 'Custom',
    },
    documentSigning: {
      signerName: '',
      signerRole: '',
      signerCouncil: '',
      stampText: '',
      footerText: '',
    },
    onboardingCompleted: false,
    createdAt: '2026-04-01T00:00:00Z',
    modulesEnabled: ['staff', 'financial'],
    paymentsEnabled: false,
    billingOverrideEnabled: false,
    asaasCustomerId: null,
    asaasSubscriptionId: null,
    subscriptionStatus: 'INACTIVE',
    subscriptionTier: 'trial',
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
    waAiModel: 'google/gemma-4-31b-it',
    waAiCustomPrompt: null,
    waAiAllowSchedule: false,
    waAiAllowConfirm: false,
    waAiAllowCancel: false,
    allowProfessionalSelection: true,
    ...overrides,
  }
}

describe('Flow: Funil comercial', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.sessionStorage.clear()
    window.history.replaceState({}, '', '/?utm_source=google&utm_campaign=brand-search')
  })

  it('vai da landing ao cadastro e conclui o signup', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null })
    mockSignIn.mockResolvedValue({ data: { session: { user: { id: 'user-new' } } }, error: null })

    render(
      <QueryClientProvider client={makeQC()}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/cadastro-clinica" element={<CadastroClinicaPage />} />
            <Route path="/agenda" element={<div>Agenda carregada</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    const user = userEvent.setup()
    await user.click(screen.getByRole('link', { name: /começar 7 dias grátis/i }))

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Ex: Clínica Saúde & Vida')).toBeInTheDocument()
    })

    expect(mockTrackPublicEvent).toHaveBeenCalledWith('signup_cta_click', { placement: 'hero-primary' })
    expect(mockTrackGenerateLead).toHaveBeenCalledWith({ placement: 'cadastro_page', persona: undefined })

    await user.type(screen.getByPlaceholderText('Ex: Clínica Saúde & Vida'), 'Clínica Feliz')
    await user.type(screen.getByPlaceholderText('contato@suaclinica.com'), 'owner@clinicafeliz.com')
    await user.type(screen.getByPlaceholderText(/mínimo 8 caracteres/i), 'Senha@1234')
    await user.type(screen.getByPlaceholderText(/repita sua senha/i), 'Senha@1234')
    await user.click(screen.getByRole('button', { name: /entrar no consultin agora/i }))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'submit-clinic-signup',
        expect.objectContaining({
          body: expect.objectContaining({
            clinicName: 'Clínica Feliz',
            email: 'owner@clinicafeliz.com',
          }),
        }),
      )
      expect(mockSignIn).toHaveBeenCalledWith({
        email: 'owner@clinicafeliz.com',
        password: 'Senha@1234',
      })
      expect(mockTrackSignup).toHaveBeenCalledWith({ method: 'clinic_form' })
    })
  })

  it('ativa um plano pago e dispara begin_checkout e purchase', async () => {
    mockActivateBilling.mockResolvedValue({ ok: true })

    render(
      <QueryClientProvider client={makeQC()}>
        <FinanceiroTab clinic={makeInactiveClinic()} />
      </QueryClientProvider>,
    )

    const user = userEvent.setup()
    await user.clear(screen.getByLabelText(/nome completo/i))
    await user.type(screen.getByLabelText(/nome completo/i), 'Pedro Martinez')
    await user.type(screen.getByLabelText(/cpf ou cnpj/i), '12345678901')
    await user.type(screen.getByLabelText(/^telefone$/i), '11999999999')
    await user.type(screen.getByLabelText(/^e-mail$/i), 'pedro@test.com')
    await user.type(screen.getByLabelText(/nome no cartão/i), 'PEDRO MARTINEZ')
    await user.type(screen.getByLabelText(/número do cartão/i), '4242424242424242')
    await user.type(screen.getByPlaceholderText('MM'), '12')
    await user.type(screen.getByPlaceholderText('AAAA'), '2028')
    await user.type(screen.getByPlaceholderText('123'), '123')
    await user.click(screen.getByRole('button', { name: /ativar plano básico/i }))

    await waitFor(() => {
      expect(mockActivateBilling).toHaveBeenCalledWith(
        expect.objectContaining({
          clinicId: 'clinic-1',
          tier: 'basic',
          billingType: 'CREDIT_CARD',
          responsible: expect.objectContaining({
            name: 'Pedro Martinez',
            cpfCnpj: '12345678901',
            email: 'pedro@test.com',
          }),
        }),
      )
    })

    expect(mockGtagEvent).toHaveBeenNthCalledWith(
      1,
      'begin_checkout',
      expect.objectContaining({ currency: 'BRL', value: 100 }),
    )
    expect(mockGtagEvent).toHaveBeenNthCalledWith(
      2,
      'purchase',
      expect.objectContaining({ currency: 'BRL', value: 100 }),
    )
  })
})