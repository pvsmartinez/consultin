import { describe, expect, it } from 'vitest'
import { buildPatientClinicalDocumentBody } from '../utils/patientClinicalDocumentPdf'

describe('patientClinicalDocumentPdf', () => {
  it('interpolates printable body placeholders before showing or exporting the document', () => {
    const result = buildPatientClinicalDocumentBody(
      {
        id: 'item-1',
        clinicId: 'clinic-1',
        patientId: 'patient-1',
        createdBy: 'user-1',
        createdByName: 'Dra. Carla',
        category: 'document',
        itemType: 'medical_certificate',
        status: 'issued',
        title: 'Atestado de trabalho',
        description: 'Repouso por 2 dias.',
        notes: null,
        requestedForDate: null,
        issuedOn: '2026-05-08',
        completedOn: null,
        metadata: {
          printableBody: 'Paciente: {{patient_name}}\nCPF: {{patient_cpf}}\nDocumento: {{document_title}}',
          reviewNotes: '',
        },
        createdAt: '2026-05-08T12:00:00.000Z',
        updatedAt: '2026-05-08T12:00:00.000Z',
      },
      {
        name: 'Maria Souza',
        cpf: '123.456.789-01',
        birthDate: '1985-03-15',
      },
      {
        name: 'Clínica Demo',
        phone: '(11) 99999-0000',
        city: 'São Paulo',
        state: 'SP',
        documentTemplates: {
          examRequest: '',
          prescription: '',
          medicalCertificate: '',
          consentTerm: '',
          custom: '',
        },
        documentSigning: {
          signerName: '',
          signerRole: '',
          signerCouncil: '',
          stampText: '',
          footerText: '',
        },
      },
      '08/05/2026',
    )

    expect(result).toContain('Maria Souza')
    expect(result).toContain('123.456.789-01')
    expect(result).toContain('Atestado de trabalho')
    expect(result).not.toContain('{{patient_name}}')
  })
})