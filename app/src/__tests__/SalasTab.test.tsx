import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from './testUtils'

const mockCreate = { mutateAsync: vi.fn() }
const mockUpdate = { mutateAsync: vi.fn() }
const mockDelete = { mutateAsync: vi.fn() }

vi.mock('../hooks/useRooms', () => ({
  useRooms:       () => ({ data: [
    { id: 'r1', name: 'Sala 1', color: '#6366f1', active: true },
    { id: 'r2', name: 'Sala 2', color: '#22c55e', active: false },
  ], isLoading: false }),
  useCreateRoom:  () => mockCreate,
  useUpdateRoom:  () => mockUpdate,
  useDeleteRoom:  () => mockDelete,
}))
vi.mock('../components/availability/RoomAvailabilityEditor', () => ({
  default: () => <div data-testid="room-avail-editor" />,
}))
vi.mock('../components/ui/ConfirmDialog', () => ({
  default: () => null,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import SalasTab from '../pages-v1/settings/SalasTab'

function setup() {
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <SalasTab />
    </QueryClientProvider>
  )
}

describe('SalasTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreate.mutateAsync.mockResolvedValue({ id: 'r3' })
    mockUpdate.mutateAsync.mockResolvedValue(undefined)
    mockDelete.mutateAsync.mockResolvedValue(undefined)
  })

  it('renders room list', () => {
    setup()
    expect(screen.getByText('Sala 1')).toBeDefined()
    expect(screen.getByText('Sala 2')).toBeDefined()
  })

  it('renders add room button', () => {
    setup()
    const addBtn = screen.getAllByRole('button').find(b => b.textContent?.includes('Nova sala'))
    expect(addBtn).toBeDefined()
  })

  it('shows add form on button click', () => {
    setup()
    const addBtn = screen.getAllByRole('button').find(b => b.textContent?.includes('Nova sala'))!
    fireEvent.click(addBtn)
    expect(screen.getByPlaceholderText(/consultório|estética/i)).toBeDefined()
  })

  it('creates room on form submit', async () => {
    setup()
    const addBtn = screen.getAllByRole('button').find(b => b.textContent?.includes('Nova sala'))!
    fireEvent.click(addBtn)
    const nameInput = screen.getByPlaceholderText(/consultório|estética/i)
    fireEvent.change(nameInput, { target: { value: 'Sala 3' } })
    const saveBtn = screen.getByRole('button', { name: /salvar|confirmar/i })
    fireEvent.click(saveBtn)
    await waitFor(() => {
      expect(mockCreate.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Sala 3' })
      )
    })
  })
})
