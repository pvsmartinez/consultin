/**
 * Flow: Profissional — configuração de disponibilidade + visualização de agenda + financeiro
 *
 * Simula o dia a dia de um profissional de saúde autenticado:
 *  1. Acessa "Minha Disponibilidade" e configura horários
 *  2. Acessa "Minha Agenda" (view myOnly) e vê seus próximos agendamentos
 *  3. Acessa o Financeiro e vê resumo do mês
 *  4. Sem perfil de profissional vinculado → mostra estado de aviso
 *
 * Todos os hooks de dados são mockados para isolamento da UI.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import FinanceiroPageComponent from '../pages/FinanceiroPage'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from './testUtils'

// ─── Auth: profissional ───────────────────────────────────────────────────────

const mockUseAuthContext = vi.fn()
vi.mock('../contexts/AuthContext', () => ({
  useAuthContext: () => mockUseAuthContext(),
}))

// ─── Hooks profissional records ───────────────────────────────────────────────

const MOCK_PROF_RECORDS = [
  { id: 'prof-1', name: 'Dr. Felipe Braga', clinicId: 'clinic-1', specialty: 'Fisioterapia', active: true },
]

const mockUseMyProfessionalRecords = vi.fn()
vi.mock('../hooks/useAppointmentsMutations', () => ({
  useMyProfessionalRecords: () => mockUseMyProfessionalRecords(),
  useAppointmentsQuery: () => ({ data: [], isLoading: false }),
  useUpdateAppointmentStatus: () => ({ mutate: vi.fn(), isPending: false }),
}))

// ─── Disponibilidade ──────────────────────────────────────────────────────────

vi.mock('../components/availability/AvailabilityEditor', () => ({
  default: ({ professionalId }: { professionalId: string }) => (
    <div data-testid="availability-editor" data-prof-id={professionalId}>
      <p>Editor de disponibilidade</p>
    </div>
  ),
}))

// ─── Financeiro ───────────────────────────────────────────────────────────────

const MOCK_FINANCIAL_ROWS = [
  {
    id: 'appt-1',
    patient: { id: 'p1', name: 'Carla Torres' },
    professional: { id: 'prof-1', name: 'Dr. Felipe Braga' },
    startsAt: '2026-04-10T09:00:00Z',
    status: 'completed',
    chargeAmountCents: 20000,
    paidAmountCents: 20000,
    paymentMethod: 'pix' as const,
  },
  {
    id: 'appt-2',
    patient: { id: 'p2', name: 'Pedro Lima' },
    professional: { id: 'prof-1', name: 'Dr. Felipe Braga' },
    startsAt: '2026-04-12T14:00:00Z',
    status: 'completed',
    chargeAmountCents: 15000,
    paidAmountCents: null,
    paymentMethod: null,
  },
]

const mockUseFinancial = vi.fn()
vi.mock('../hooks/useFinancial', () => ({
  useFinancial: (...args: unknown[]) => mockUseFinancial(...args),
  PAYMENT_METHOD_LABELS: { pix: 'PIX', credit: 'Cartão de Crédito', cash: 'Dinheiro', debit: 'Cartão de Débito', transfer: 'Transferência', other: 'Outro' },
}))

vi.mock('../hooks/useClinic', () => ({
  useClinic: () => ({
    data: {
      id: 'clinic-1', name: 'Clínica Fisio+',
      modulesEnabled: ['staff', 'financial'],
      patientFieldConfig: {},
    },
  }),
}))

vi.mock('../components/appointments/AppointmentPaymentModal', () => ({ default: () => null }))
vi.mock('../components/appointments/PaymentRegistrationModal', () => ({ default: () => null }))
vi.mock('@pvsmartinez/shared/ui', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeQC() {
  return makeQueryClient()
}

function wrapWithProviders(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter>
        {ui}
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Flow: Profissional — minha disponibilidade', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuthContext.mockReturnValue({
      profile: { id: 'user-prof-1', clinicId: 'clinic-1', roles: ['professional'] },
      role: 'professional',
      hasPermission: () => false,
    })
  })

  it('renderiza editor de disponibilidade quando vinculado a um profissional', async () => {
    mockUseMyProfessionalRecords.mockReturnValue({
      data: MOCK_PROF_RECORDS,
      isLoading: false,
    })

    const { default: MinhaDisponibilidadePage } = await import('../pages-v1/MinhaDisponibilidadePage')
    wrapWithProviders(<MinhaDisponibilidadePage />)

    await waitFor(() => {
      expect(screen.getByTestId('availability-editor')).toBeInTheDocument()
    })
    expect(screen.getByTestId('availability-editor')).toHaveAttribute('data-prof-id', 'prof-1')
  })

  it('mostra aviso quando profissional não está vinculado ao sistema', async () => {
    mockUseMyProfessionalRecords.mockReturnValue({ data: [], isLoading: false })

    const { default: MinhaDisponibilidadePage } = await import('../pages-v1/MinhaDisponibilidadePage')
    wrapWithProviders(<MinhaDisponibilidadePage />)

    await waitFor(() => {
      expect(screen.getByText(/perfil de profissional ainda não está vinculado/i)).toBeInTheDocument()
    })
  })

  it('exibe seletor de clínica quando profissional atua em múltiplas clínicas', async () => {
    const multiClinicRecords = [
      ...MOCK_PROF_RECORDS,
      { id: 'prof-2', name: 'Dr. Felipe Braga', clinicId: 'clinic-2', specialty: 'Fisioterapia', active: true },
    ]
    mockUseMyProfessionalRecords.mockReturnValue({ data: multiClinicRecords, isLoading: false })

    const { default: MinhaDisponibilidadePage } = await import('../pages-v1/MinhaDisponibilidadePage')
    wrapWithProviders(<MinhaDisponibilidadePage />)

    await waitFor(() => {
      // With 2+ clinics, a selector with multiple options appears
      const buttons = screen.getAllByRole('button')
      expect(buttons.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('exibe skeleton de loading enquanto busca os registros', async () => {
    mockUseMyProfessionalRecords.mockReturnValue({ data: [], isLoading: true })

    const { default: MinhaDisponibilidadePage } = await import('../pages-v1/MinhaDisponibilidadePage')
    const { container } = wrapWithProviders(<MinhaDisponibilidadePage />)

    expect(container.textContent).toMatch(/carregando/i)
  })
})

describe('Flow: Profissional — financeiro do mês', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseFinancial.mockReturnValue({ data: MOCK_FINANCIAL_ROWS, isLoading: false, isError: false })
    mockUseAuthContext.mockReturnValue({
      profile: { id: 'user-prof-1', clinicId: 'clinic-1', roles: ['professional'] },
      role: 'professional',
      hasPermission: (k: string) => k === 'canViewFinancial',
    })
  })

  it('renderiza o financeiro com total cobrado e recebido', async () => {
    wrapWithProviders(<FinanceiroPageComponent />)

    // Verifica que a tabela de dados foi renderizada com registros
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /financeiro/i })).toBeInTheDocument()
      expect(screen.getAllByText('Carla Torres').length).toBeGreaterThan(0)
    })
  })

  it('mostra totalizadores: cobrado e recebido', async () => {
    wrapWithProviders(<FinanceiroPageComponent />)

    await waitFor(() => {
      // Total cobrado: R$ 350 (200 + 150) — pode aparecer em múltiplos elementos
      expect(screen.getAllByText(/350/).length).toBeGreaterThan(0)
      // Total recebido: R$ 200 (apenas o primeiro)
      expect(screen.getAllByText(/200/).length).toBeGreaterThan(0)
    })
  })

  it('mostra estado de erro quando a query falha', async () => {
    mockUseFinancial.mockReturnValue({ data: [], isLoading: false, isError: true })

    wrapWithProviders(<FinanceiroPageComponent />)

    await waitFor(() => {
      expect(screen.getByText(/erro ao carregar dados/i)).toBeInTheDocument()
    })
  })
})
