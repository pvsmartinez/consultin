import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from './testUtils'
import type { Clinic } from '../types'

const mockUpdate = { mutateAsync: vi.fn() }
vi.mock('../hooks/useClinic', () => ({ useClinic: () => ({ update: mockUpdate }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import AgendaTab from '../pages-v1/settings/AgendaTab'

function makeClinic(overrides: Partial<Clinic> = {}): Clinic {
  return {
    id: 'c1', name: 'Clínica', slotDurationMinutes: 30,
    allowProfessionalSelection: true, workingHours: {},
    allowSelfRegistration: false, acceptedPaymentMethods: [],
    paymentTiming: 'before', cancellationHours: 24,
    subscriptionStatus: 'INACTIVE', modules: [], anamnesisFields: [],
    ...overrides,
  } as unknown as Clinic
}

function setup(overrides: Partial<Clinic> = {}) {
  const clinic = makeClinic(overrides)
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <AgendaTab clinic={clinic} />
    </QueryClientProvider>
  )
  return clinic
}

describe('AgendaTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdate.mutateAsync.mockResolvedValue(undefined)
  })

  it('renders slot duration options', () => {
    setup()
    expect(screen.getByText(/15/)).toBeDefined()
    expect(screen.getByText(/30/)).toBeDefined()
    expect(screen.getByText(/60/)).toBeDefined()
  })

  it('renders week day toggles', () => {
    setup()
    expect(screen.getByText('Segunda')).toBeDefined()
    expect(screen.getByText('Sexta')).toBeDefined()
  })

  it('saves with update.mutateAsync on form submit', async () => {
    setup({ slotDurationMinutes: 30, workingHours: {} })
    const saveBtn = screen.getByRole('button', { name: /salvar/i })
    fireEvent.click(saveBtn)
    await waitFor(() => {
      expect(mockUpdate.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ slotDurationMinutes: 30 })
      )
    })
  })

  it('shows working hours inputs when a day is toggled on', () => {
    setup({ workingHours: { mon: { start: '08:00', end: '18:00' } } })
    // Monday should already show hour inputs
    const inputs = screen.getAllByDisplayValue('08:00')
    expect(inputs.length).toBeGreaterThan(0)
  })

  it('disables save button while saving', async () => {
    let resolve!: () => void
    mockUpdate.mutateAsync.mockReturnValue(new Promise(r => { resolve = r }))
    setup()
    const saveBtn = screen.getByRole('button', { name: /salvar/i })
    fireEvent.click(saveBtn)
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /salvar|salvando/i })
      expect(btn).toHaveProperty('disabled', true)
    })
    resolve()
  })
})
