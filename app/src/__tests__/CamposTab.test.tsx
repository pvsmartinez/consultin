import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from './testUtils'
import type { Clinic } from '../types'

vi.mock('../components/fields/EntityFieldsPanel', () => ({
  default: ({ entityLabel }: { entityLabel: string }) =>
    <div data-testid="entity-fields-panel" data-entity={entityLabel === 'paciente' ? 'pacientes' : 'profissionais'} />,
}))

import CamposTab from '../pages-v1/settings/CamposTab'

function makeClinic(): Clinic {
  return {
    id: 'c1', name: 'Clínica',
    allowSelfRegistration: false, acceptedPaymentMethods: [],
    paymentTiming: 'before', cancellationHours: 24,
    subscriptionStatus: 'INACTIVE', modules: [], anamnesisFields: [],
    slotDurationMinutes: 30, workingHours: {},
  } as unknown as Clinic
}

function setup(fieldEntity?: 'pacientes' | 'profissionais') {
  render(
    <MemoryRouter>
      <QueryClientProvider client={makeQueryClient()}>
        <CamposTab clinic={makeClinic()} fieldEntity={fieldEntity} />
      </QueryClientProvider>
    </MemoryRouter>
  )
}

describe('CamposTab', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders Pacientes tab by default', () => {
    setup()
    expect(screen.getByText('Pacientes')).toBeDefined()
  })

  it('renders EntityFieldsPanel', () => {
    setup()
    expect(screen.getByTestId('entity-fields-panel')).toBeDefined()
  })

  it('switches to Profissionais tab on click', () => {
    setup()
    const profTab = screen.getByText('Profissionais')
    fireEvent.click(profTab)
    const panel = screen.getByTestId('entity-fields-panel')
    expect(panel.getAttribute('data-entity')).toBe('profissionais')
  })

  it('respects fieldEntity prop', () => {
    setup('profissionais')
    const panel = screen.getByTestId('entity-fields-panel')
    expect(panel.getAttribute('data-entity')).toBe('profissionais')
  })
})
