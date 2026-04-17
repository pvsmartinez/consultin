import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from './testUtils'
import type { Clinic } from '../types'

const mockUpdate = { mutateAsync: vi.fn() }
vi.mock('../hooks/useClinic', () => ({ useClinic: () => ({ update: mockUpdate }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import AnamnesisTab from '../pages-v1/settings/AnamnesisTab'

function makeClinic(fields: Clinic['anamnesisFields'] = []): Clinic {
  return {
    id: 'c1', name: 'Clínica', anamnesisFields: fields,
    allowSelfRegistration: false, acceptedPaymentMethods: [],
    paymentTiming: 'before', cancellationHours: 24,
    subscriptionStatus: 'INACTIVE', modules: [],
    slotDurationMinutes: 30, workingHours: {},
  } as unknown as Clinic
}

function setup(fields: Clinic['anamnesisFields'] = []) {
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <AnamnesisTab clinic={makeClinic(fields)} />
    </QueryClientProvider>
  )
}

describe('AnamnesisTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdate.mutateAsync.mockResolvedValue(undefined)
  })

  it('renders empty state when no fields', () => {
    setup([])
    // there's the add field form
    expect(screen.getAllByText(/anamnese/i).length).toBeGreaterThan(0)
  })

  it('renders existing fields', () => {
    setup([
      { key: 'f1', label: 'Tem alergia?', type: 'boolean', required: false },
    ])
    expect(screen.getByText('Tem alergia?')).toBeDefined()
  })

  it('shows error when adding field without label', async () => {
    const { toast } = await import('sonner')
    setup([])
    const addBtn = screen.getByRole('button', { name: /adicionar/i })
    fireEvent.click(addBtn)
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('nome'))
    })
  })

  it('adds a new field and saves', async () => {
    setup([])
    const labelInput = screen.getByPlaceholderText(/nome da pergunta/i)
    fireEvent.change(labelInput, { target: { value: 'Pressão alta?' } })
    const addBtn = screen.getByRole('button', { name: /adicionar/i })
    fireEvent.click(addBtn)

    // The new field should appear in the list
    await waitFor(() => {
      expect(screen.getByText('Pressão alta?')).toBeDefined()
    })
  })

  it('removes a field', async () => {
    setup([
      { key: 'f1', label: 'Diabético?', type: 'boolean', required: false },
    ])
    expect(screen.getByText('Diabético?')).toBeDefined()
    const removeBtn = screen.getByRole('button', { name: /remover|excluir/i })
    fireEvent.click(removeBtn)
    await waitFor(() => {
      expect(screen.queryByText('Diabético?')).toBeNull()
    })
  })
})
