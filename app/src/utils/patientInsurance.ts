export type PatientInsuranceCoverageType = 'private' | 'insurance'

export const PATIENT_INSURANCE_KEYS = {
  coverageType: '__insurance_type',
  provider: '__insurance_provider',
  plan: '__insurance_plan',
} as const

export const PATIENT_INSURANCE_TYPE_LABELS: Record<PatientInsuranceCoverageType, string> = {
  private: 'Particular',
  insurance: 'Convênio',
}

export const PATIENT_INSURANCE_TYPE_OPTIONS = [
  { value: 'private', label: PATIENT_INSURANCE_TYPE_LABELS.private },
  { value: 'insurance', label: PATIENT_INSURANCE_TYPE_LABELS.insurance },
] as const

export interface PatientInsuranceInfo {
  coverageType: PatientInsuranceCoverageType | null
  provider: string | null
  plan: string | null
}

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function getPatientInsuranceInfo(customFields: Record<string, unknown> | null | undefined): PatientInsuranceInfo {
  const rawCoverageType = customFields?.[PATIENT_INSURANCE_KEYS.coverageType]
  const coverageType = rawCoverageType === 'private' || rawCoverageType === 'insurance'
    ? rawCoverageType
    : null

  return {
    coverageType,
    provider: normalizeString(customFields?.[PATIENT_INSURANCE_KEYS.provider]),
    plan: normalizeString(customFields?.[PATIENT_INSURANCE_KEYS.plan]),
  }
}

export function hasPatientInsuranceInfo(customFields: Record<string, unknown> | null | undefined): boolean {
  const info = getPatientInsuranceInfo(customFields)
  return Boolean(info.coverageType || info.provider || info.plan)
}