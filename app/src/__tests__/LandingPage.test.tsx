import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../components/seo/Seo', () => ({
  Seo: () => null,
}))

vi.mock('../lib/publicAnalytics', () => ({
  trackPublicEvent: vi.fn(),
}))

vi.mock('../lib/gtag', () => ({
  gtagEvent: vi.fn(),
}))

import LandingPage from '../pages-v1/LandingPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  )
}

describe('LandingPage', () => {
  it('renders the stronger WhatsApp assistant showcase', () => {
    renderPage()

    expect(screen.getByText(/o whatsapp não fica só no lembrete/i)).toBeInTheDocument()
    expect(screen.getByText(/funcionalidades fortes, mostradas com contexto de uso real/i)).toBeInTheDocument()
    expect(screen.getAllByText(/começar pelo whatsapp/i).length).toBeGreaterThan(0)
  })

  it('shows the audience split for clinics and solo professionals', () => {
    renderPage()

    expect(screen.getByText(/para clínicas e consultórios com equipe/i)).toBeInTheDocument()
    expect(screen.getByText(/para profissional liberal que atende sozinho/i)).toBeInTheDocument()
  })
})