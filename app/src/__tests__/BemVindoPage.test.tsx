/**
 * Tests for BemVindoPage — post-signup confirmation page shown after
 * a clinic/practitioner successfully submits the registration form.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import BemVindoPage from '../pages-v1/BemVindoPage'

vi.mock('../components/seo/Seo', () => ({
  Seo: () => null,
}))

function renderPage() {
  return render(
    <MemoryRouter>
      <BemVindoPage />
    </MemoryRouter>,
  )
}

describe('BemVindoPage', () => {
  it('renders the success heading', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /clínica cadastrada/i })).toBeInTheDocument()
  })

  it('tells the user to watch for an invite email', () => {
    renderPage()
    expect(screen.getByText(/fique de olho no e-mail/i)).toBeInTheDocument()
  })

  it('mentions the free trial period', () => {
    renderPage()
    expect(screen.getByText(/7 dias grátis/i)).toBeInTheDocument()
  })

  it('has a link back to the homepage', () => {
    renderPage()
    const link = screen.getByRole('link', { name: /voltar para o início/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/')
  })

  it('shows a support email', () => {
    renderPage()
    expect(screen.getByText(/suporte@consultin/i)).toBeInTheDocument()
  })
})
