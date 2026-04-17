import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from './testUtils'
import type { Clinic } from '../types'

const mockUpdate = { mutateAsync: vi.fn() }
vi.mock('../hooks/useClinic', () => ({ useClinic: () => ({ update: mockUpdate }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import PagamentoTab from '../pages-v1/settings/PagamentoTab'

function makeClinic(overrides: Partial<Clinic> = {}): Clinic {
  return {
    id: 'c1', name: 'Clínica',
    acceptedPaymentMethods: ['credit_card', 'pix'],
    paymentTiming: 'before',
    cancellationHours: 24,
    subscriptionStatus: 'INACTIVE', modules: [], anamnesisFields: [],
    slotDurationMinutes: 30, workingHours: {},
    ...overrides,
  } as unknown as Clinic
}

function setup(overrides: Partial<Clinic> = {}) {
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <PagamentoTab clinic={makeClinic(overrides)} />
    </QueryClientProvider>
  )
}

describe('PagamentoTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdate.mutateAsync.mockResolvedValue(undefined)
  })

  it('renders payment method options', () => {
    setup()
    // Should show checkboxes for payment methods
    expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0)
  })

  it('saves with update.mutateAsync', async () => {
    setup()
    const saveBtn = screen.getByRole('button', { name: /salvar/i })
    fireEvent.click(saveBtn)
    await waitFor(() => {
      expect(mockUpdate.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          acceptedPaymentMethods: expect.any(Array),
          paymentTiming: 'before',
        })
      )
    })
  })

  it('shows error when no payment method selected', async () => {
    const { toast } = await import('sonner')
    setup({ acceptedPaymentMethods: [] })
    const saveBtn = screen.getByRole('button', { name: /salvar/i })
    fireEvent.click(saveBtn)
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('forma'))
    })
  })

  it('renders payment timing options', () => {
    setup()
    expect(screen.getAllByText(/antes da consulta|no atendimento|após/i).length).toBeGreaterThan(0)
  })
})
