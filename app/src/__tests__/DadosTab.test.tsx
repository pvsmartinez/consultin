import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from './testUtils'
import type { Clinic } from '../types'

const mockUpdate = { mutateAsync: vi.fn() }
vi.mock('../hooks/useClinic', () => ({ useClinic: () => ({ update: mockUpdate }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import DadosTab from '../pages-v1/settings/DadosTab'

function makeClinic(overrides: Partial<Clinic> = {}): Clinic {
  return {
    id: 'c1', name: 'Clínica Teste', cnpj: '12.345.678/0001-99',
    phone: '11999999999', email: 'clinic@test.com',
    address: 'Rua A, 1', city: 'São Paulo', state: 'SP',
    allowSelfRegistration: false, acceptedPaymentMethods: [],
    paymentTiming: 'before', cancellationHours: 24,
    subscriptionStatus: 'INACTIVE', modules: [], anamnesisFields: [],
    slotDurationMinutes: 30, workingHours: {},
    ...overrides,
  } as unknown as Clinic
}

function setup(overrides: Partial<Clinic> = {}) {
  const clinic = makeClinic(overrides)
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <DadosTab clinic={clinic} />
    </QueryClientProvider>
  )
  return clinic
}

describe('DadosTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdate.mutateAsync.mockResolvedValue(undefined)
  })

  it('pre-fills clinic name', () => {
    setup({ name: 'Clínica ABC' })
    const input = screen.getByDisplayValue('Clínica ABC')
    expect(input).toBeDefined()
  })

  it('validates name min length', async () => {
    setup()
    const nameInput = screen.getByDisplayValue('Clínica Teste')
    fireEvent.change(nameInput, { target: { value: 'X' } })
    const saveBtn = screen.getByRole('button', { name: /salvar/i })
    fireEvent.click(saveBtn)
    await waitFor(() => {
      expect(screen.getByText(/nome obrigatório/i)).toBeDefined()
    })
  })

  it('validates email format', async () => {
    setup()
    const emailInput = screen.getByDisplayValue('clinic@test.com')
    fireEvent.change(emailInput, { target: { value: 'not-an-email' } })
    // fireEvent.submit bypasses jsdom’s type="email" constraint validation
    fireEvent.submit(document.querySelector('form')!)
    await waitFor(() => {
      expect(screen.getAllByText(/e-mail inválido/i).length).toBeGreaterThan(0)
    })
  })

  it('calls update.mutateAsync on valid submit', async () => {
    setup()
    const saveBtn = screen.getByRole('button', { name: /salvar/i })
    fireEvent.click(saveBtn)
    await waitFor(() => {
      expect(mockUpdate.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Clínica Teste' })
      )
    })
  })

  it('renders self-registration toggle', () => {
    setup()
    expect(screen.getByText(/autocadastro/i)).toBeDefined()
  })
})
