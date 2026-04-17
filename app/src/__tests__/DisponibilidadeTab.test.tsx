import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from './testUtils'

const mockUseProfessionals = vi.fn()
vi.mock('../hooks/useProfessionals', () => ({
  useProfessionals: (...args: unknown[]) => mockUseProfessionals(...args),
}))

vi.mock('../components/availability/AvailabilityEditor', () => ({
  default: ({ professionalId }: { professionalId: string }) => (
    <div data-testid="availability-editor" data-prof={professionalId} />
  ),
}))

import DisponibilidadeTab from '../pages-v1/settings/DisponibilidadeTab'

const PROFS = [
  { id: 'p1', name: 'Dr. Costa', specialty: 'Clínica Geral', active: true },
  { id: 'p2', name: 'Dra. Lima',  specialty: 'Pediatria',    active: true },
]

function setup() {
  mockUseProfessionals.mockReturnValue({ data: PROFS, isLoading: false })
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <DisponibilidadeTab />
    </QueryClientProvider>
  )
}

describe('DisponibilidadeTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseProfessionals.mockReturnValue({ data: PROFS, isLoading: false })
  })

  it('renders professional selector', () => {
    setup()
    expect(screen.getByText(/Dr. Costa/)).toBeDefined()
  })

  it('shows first professional selected by default', () => {
    setup()
    const editor = screen.getByTestId('availability-editor')
    expect(editor.getAttribute('data-prof')).toBe('p1')
  })

  it('switches editor when professional changes', () => {
    setup()
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'p2' } })
    const editor = screen.getByTestId('availability-editor')
    expect(editor.getAttribute('data-prof')).toBe('p2')
  })
})

describe('DisponibilidadeTab — empty state', () => {
  it('renders empty message when no professionals', () => {
    mockUseProfessionals.mockReturnValue({ data: [], isLoading: false })
    render(
      <QueryClientProvider client={makeQueryClient()}>
        <DisponibilidadeTab />
      </QueryClientProvider>
    )
    expect(screen.getByText(/cadastre profissionais/i)).toBeDefined()
  })
})
