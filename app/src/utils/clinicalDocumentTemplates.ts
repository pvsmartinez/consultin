import type {
  Clinic,
  ClinicDocumentSigning,
  ClinicDocumentTemplates,
  ClinicalItemType,
  Patient,
  PatientClinicalItem,
} from '../types'
import {
  DEFAULT_CLINIC_DOCUMENT_SIGNING,
  DEFAULT_CLINIC_DOCUMENT_TEMPLATES,
} from '../types'
import { formatDate } from './date'

type TemplateKey = keyof ClinicDocumentTemplates

interface TemplateInterpolationContext {
  item: Pick<PatientClinicalItem, 'itemType' | 'title' | 'description' | 'notes' | 'createdByName'>
  patient: Pick<Patient, 'name' | 'cpf' | 'birthDate'>
  clinic: Pick<Clinic, 'name' | 'phone' | 'city' | 'state' | 'documentSigning'> | null
  issueDate: string
}

function itemTypeToTemplateKey(itemType: ClinicalItemType): TemplateKey {
  switch (itemType) {
    case 'exam_request':
      return 'examRequest'
    case 'prescription':
      return 'prescription'
    case 'medical_certificate':
      return 'medicalCertificate'
    case 'consent_term':
      return 'consentTerm'
    default:
      return 'custom'
  }
}

export function mergeClinicDocumentTemplates(
  templates: Partial<ClinicDocumentTemplates> | null | undefined,
): ClinicDocumentTemplates {
  return {
    ...DEFAULT_CLINIC_DOCUMENT_TEMPLATES,
    ...(templates ?? {}),
  }
}

export function mergeClinicDocumentSigning(
  signing: Partial<ClinicDocumentSigning> | null | undefined,
): ClinicDocumentSigning {
  return {
    ...DEFAULT_CLINIC_DOCUMENT_SIGNING,
    ...(signing ?? {}),
  }
}

export function getClinicDocumentTemplate(
  templates: Partial<ClinicDocumentTemplates> | null | undefined,
  itemType: ClinicalItemType,
): string {
  const merged = mergeClinicDocumentTemplates(templates)
  return merged[itemTypeToTemplateKey(itemType)]
}

export function interpolateClinicalDocumentTemplate(
  template: string,
  { item, patient, clinic, issueDate }: TemplateInterpolationContext,
): string {
  const signing = mergeClinicDocumentSigning(clinic?.documentSigning)
  const clinicCityState = clinic?.city && clinic?.state
    ? `${clinic.city} - ${clinic.state}`
    : clinic?.city ?? clinic?.state ?? ''
  const replacements: Record<string, string> = {
    '{{clinic_name}}': clinic?.name ?? '',
    '{{clinic_city_state}}': clinicCityState,
    '{{clinic_phone}}': clinic?.phone ?? '',
    '{{patient_name}}': patient.name,
    '{{patient_cpf}}': patient.cpf ?? '',
    '{{patient_birth_date}}': patient.birthDate ? formatDate(`${patient.birthDate}T00:00:00`) : '',
    '{{issue_date}}': issueDate,
    '{{document_title}}': item.title,
    '{{item_description}}': item.description?.trim() || item.notes?.trim() || '',
    '{{professional_name}}': signing.signerName || item.createdByName || '',
    '{{professional_role}}': signing.signerRole,
    '{{professional_council}}': signing.signerCouncil,
    '{{professional_stamp}}': signing.stampText,
  }

  return Object.entries(replacements).reduce(
    (current, [placeholder, value]) => current.replaceAll(placeholder, value),
    template,
  )
}