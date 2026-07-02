import { describe, expect, it } from 'vitest'
import { getClinicDocumentTemplate, interpolateClinicalDocumentTemplate, mergeClinicDocumentSigning } from '../utils/clinicalDocumentTemplates'

describe('clinicalDocumentTemplates', () => {
  it('returns the correct clinic template for the chosen type', () => {
    const template = getClinicDocumentTemplate({ prescription: 'Receita de {{patient_name}}' }, 'prescription')
    expect(template).toBe('Receita de {{patient_name}}')
  })

  it('interpolates clinic, patient and signing placeholders', () => {
    const result = interpolateClinicalDocumentTemplate('{{patient_name}} · {{issue_date}} · {{professional_council}}', {
      item: {
        itemType: 'medical_certificate',
        title: 'Atestado',
        description: 'Repouso de 2 dias',
        notes: null,
        createdByName: 'Dra. Carla',
      },
      patient: {
        name: 'Maria Souza',
        cpf: '123.456.789-01',
        birthDate: '1985-03-15',
        addressStreet: null,
        addressNumber: null,
        addressNeighborhood: null,
        addressCity: null,
        addressState: null,
        addressZip: null,
      },
      clinic: {
        name: 'Clínica Demo',
        phone: '(11) 99999-0000',
        city: 'São Paulo',
        state: 'SP',
        documentSigning: mergeClinicDocumentSigning({ signerCouncil: 'CRO-SP 12345' }),
      },
      issueDate: '08/05/2026',
    })

    expect(result).toContain('Maria Souza')
    expect(result).toContain('08/05/2026')
    expect(result).toContain('CRO-SP 12345')
  })
})