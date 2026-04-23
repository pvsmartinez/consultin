import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import ConfiguracoesPage from '../pages/ConfiguracoesPage'
import { renderWithProviders } from './testUtils'
import type { Clinic } from '../types'

const useClinicMock = vi.fn()
const useClinicModulesMock = vi.fn()

vi.mock('../hooks/useClinic', () => ({
  useClinic: () => useClinicMock(),
}))

vi.mock('../hooks/useClinicModules', () => ({
  useClinicModules: () => useClinicModulesMock(),
}))

vi.mock('../pages-v1/settings/DadosTab', () => ({ default: () => <div>DadosTab</div> }))
vi.mock('../pages-v1/settings/AgendaTab', () => ({ default: () => <div>AgendaTab</div> }))
vi.mock('../pages-v1/settings/DisponibilidadeTab', () => ({ default: () => <div>DisponibilidadeTab</div> }))
vi.mock('../pages-v1/settings/SalasTab', () => ({ default: () => <div>SalasTab</div> }))
vi.mock('../pages-v1/settings/ServicosTab', () => ({ default: () => <div>ServicosTab</div> }))
vi.mock('../pages-v1/settings/PagamentoTab', () => ({ default: () => <div>PagamentoTab</div> }))
vi.mock('../pages-v1/settings/WhatsAppTab', () => ({ default: () => <div>WhatsAppTab</div> }))
vi.mock('../pages-v1/settings/NotificacoesTab', () => ({ default: () => <div>NotificacoesTab</div> }))
vi.mock('../pages-v1/settings/UsuariosTab', () => ({ default: () => <div>UsuariosTab</div> }))
vi.mock('../pages-v1/settings/AnamnesisTab', () => ({ default: () => <div>AnamnesisTab</div> }))
vi.mock('../pages-v1/settings/PaginaPublicaTab', () => ({ default: () => <div>PaginaPublicaTab</div> }))
vi.mock('../pages-v1/settings/CamposTab', () => ({
  default: ({ fieldEntity }: { fieldEntity?: string }) => <div>CamposTab:{fieldEntity ?? 'none'}</div>,
}))

const clinicFixture: Clinic = {
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
  modulesEnabled: [],
  paymentsEnabled: false,
  billingOverrideEnabled: false,
  asaasCustomerId: null,
  asaasSubscriptionId: null,
  subscriptionStatus: null,
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
  waAiModel: 'google/gemini-2.0-flash-exp:free',
  waAiCustomPrompt: null,
  waAiAllowSchedule: false,
  waAiAllowConfirm: false,
  waAiAllowCancel: false,
  allowProfessionalSelection: true,
}

describe('ConfiguracoesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useClinicModulesMock.mockReturnValue({
      modules: [],
      hasRooms: false,
      hasStaff: false,
      hasWhatsApp: false,
      hasFinancial: false,
      hasServices: false,
      enableModule: vi.fn(),
      disableModule: vi.fn(),
    })
  })

  it('shows a safe fallback instead of crashing when clinic data is unavailable', () => {
    useClinicMock.mockReturnValue({ data: undefined, isLoading: false })

    renderWithProviders(<ConfiguracoesPage />, {
      routerProps: { initialEntries: ['/configuracoes'] },
    })

    expect(screen.getByText('Não foi possível carregar a clínica.')).toBeInTheDocument()
  })

  it('deep-links the fields tab to the requested entity subtab', async () => {
    useClinicMock.mockReturnValue({ data: clinicFixture, isLoading: false })

    renderWithProviders(<ConfiguracoesPage />, {
      routerProps: { initialEntries: ['/configuracoes?tab=campos&entity=profissionais'] },
    })

    expect(await screen.findByText('CamposTab:profissionais')).toBeInTheDocument()
  })

  it('shows the lightweight setup guide when setup is still pending', () => {
    useClinicMock.mockReturnValue({
      data: { ...clinicFixture, onboardingCompleted: false },
      isLoading: false,
      update: { mutateAsync: vi.fn() },
    })

    renderWithProviders(<ConfiguracoesPage />, {
      routerProps: { initialEntries: ['/configuracoes?setup=1'] },
    })

    expect(screen.getByText('Você já pode usar a agenda. Configure só o básico.')).toBeInTheDocument()
    expect(screen.getByText('Revise nome, contato e endereço para deixar notificações e relatórios corretos.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /equipe e acessos/i })).toBeInTheDocument()
  })
})