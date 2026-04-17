import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from './testUtils'

vi.mock('../hooks/useServiceTypes', () => ({
  useServiceTypes:        () => ({ data: [
    { id: 's1', name: 'Consulta', durationMinutes: 30, priceCents: 15000, color: '#6366f1', active: true },
    { id: 's2', name: 'Retorno',  durationMinutes: 15, priceCents:  5000, color: '#22c55e', active: true },
  ], isLoading: false }),
  useCreateServiceType:   () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateServiceType:   () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteServiceType:   () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('../hooks/useClinic', () => ({ useClinic: () => ({ data: { id: 'c1' } }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../components/ui/ConfirmDialog', () => ({
  default: () => null,
}))

import ServicosTab from '../pages-v1/settings/ServicosTab'

function setup() {
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <ServicosTab />
    </QueryClientProvider>
  )
}

describe('ServicosTab', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders service list', () => {
    setup()
    expect(screen.getByText('Consulta')).toBeDefined()
    expect(screen.getByText('Retorno')).toBeDefined()
  })

  it('renders add button', () => {
    setup()
    expect(screen.getByRole('button', { name: /novo serviço|adicionar/i })).toBeDefined()
  })

  it('shows price formatted', () => {
    setup()
    // R$ 150,00
    expect(screen.getByText(/R\$ 150/)).toBeDefined()
  })

  it('shows duration', () => {
    setup()
    expect(screen.getByText(/30\s*min/i)).toBeDefined()
  })
})
