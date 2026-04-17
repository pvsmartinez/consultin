import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient, MOCK_ADMIN_PROFILE } from './testUtils'

const { mockUpdate, mockFrom } = vi.hoisted(() => {
  const mockEq = vi.fn(() => Promise.resolve({ error: null }))
  const mockUpdate = vi.fn(() => ({ eq: mockEq }))
  const mockFrom = vi.fn(() => ({ update: mockUpdate }))

  return { mockUpdate, mockFrom }
})

vi.mock('../services/supabase', () => ({
  supabase: { from: mockFrom },
}))
vi.mock('../contexts/AuthContext', () => ({
  useAuthContext: () => ({
    profile: {
      ...MOCK_ADMIN_PROFILE,
      notificationPhone: '11999999999',
      notifNewAppointment: true,
      notifCancellation: false,
      notifNoShow: false,
      notifPaymentOverdue: true,
    },
    refreshProfile: vi.fn(),
  }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import NotificacoesTab from '../pages-v1/settings/NotificacoesTab'

function setup() {
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <NotificacoesTab />
    </QueryClientProvider>
  )
}

describe('NotificacoesTab', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders phone input pre-filled', () => {
    setup()
    expect(screen.getByDisplayValue('11999999999')).toBeDefined()
  })

  it('renders all notification toggles', () => {
    setup()
    expect(screen.getByText(/nova consulta agendada/i)).toBeDefined()
    expect(screen.getByText(/consulta cancelada/i)).toBeDefined()
    expect(screen.getByText(/paciente faltou/i)).toBeDefined()
    expect(screen.getByText(/pagamento em atraso/i)).toBeDefined()
  })

  it('saves phone on button click', async () => {
    setup()
    const input = screen.getByDisplayValue('11999999999')
    fireEvent.change(input, { target: { value: '11988887777' } })
    const saveBtn = screen.getByRole('button', { name: /salvar/i })
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ notification_phone: '11988887777' })
      )
    })
  })

  it('shows WhatsApp info', () => {
    setup()
    expect(screen.getAllByText(/whatsapp/i).length).toBeGreaterThan(0)
  })
})
