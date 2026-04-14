import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from './testUtils'
import { usePublicPage } from '../hooks/useClinicPublicPage'

const rpcMock = vi.fn()

vi.mock('../services/supabase', () => ({
  publicSupabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
  supabase: {
    from: vi.fn(),
  },
}))

function makeWrapper() {
  const qc = makeQueryClient()
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('usePublicPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads a public page through the secure RPC projection', async () => {
    rpcMock.mockResolvedValue({
      data: {
        id: 'page-1',
        clinic_id: 'clinic-1',
        slug: 'clinica-demo',
        published: true,
        logo_url: 'https://cdn.test/logo.png',
        cover_url: null,
        primary_color: '#0f766e',
        tagline: 'Atendimento com cuidado',
        show_professionals: true,
        show_location: true,
        show_services: true,
        show_hours: true,
        show_booking: true,
        show_whatsapp: true,
        created_at: '2026-04-13T10:00:00.000Z',
        updated_at: '2026-04-13T10:00:00.000Z',
        clinic: {
          name: 'Clínica Demo',
          address: 'Rua A, 123',
          city: 'São Paulo',
          state: 'SP',
          phone: '1133334444',
          whatsappPhoneDisplay: '(11) 99999-0000',
          workingHours: { mon: { start: '08:00', end: '18:00' } },
          allowSelfRegistration: true,
          allowProfessionalSelection: false,
        },
        professionals: [{
          id: 'professional-1',
          name: 'Dra. Ana',
          specialty: 'Odonto',
          photoUrl: null,
          bio: 'Especialista em ortodontia',
          active: true,
        }],
        services: [{
          id: 'service-1',
          name: 'Avaliação',
          durationMinutes: 30,
          priceCents: 15000,
        }],
      },
      error: null,
    })

    const { result } = renderHook(() => usePublicPage('clinica-demo'), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(rpcMock).toHaveBeenCalledWith('get_public_clinic_page', { p_slug: 'clinica-demo' })
    expect(result.current.data?.clinic.name).toBe('Clínica Demo')
    expect(result.current.data?.professionals[0].name).toBe('Dra. Ana')
    expect(result.current.data?.services[0].durationMinutes).toBe(30)
  })
})