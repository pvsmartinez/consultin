import { supabase } from '../services/supabase'

const EXPORT_PAGE_SIZE = 1_000

export interface PatientExportRow {
  name: string | null
  cpf: string | null
  rg: string | null
  birth_date: string | null
  sex: string | null
  phone: string | null
  email: string | null
  address_street: string | null
  address_number: string | null
  address_complement: string | null
  address_city: string | null
  address_state: string | null
  address_zip: string | null
  notes: string | null
  created_at: string | null
}

/**
 * Retrieves the entire patient base for a CSV export.
 * PostgREST caps an unpaginated response at 1,000 rows, so exports must page.
 */
export async function loadAllPatientsForExport(clinicId: string): Promise<PatientExportRow[]> {
  const patients: PatientExportRow[] = []

  for (let offset = 0; ; offset += EXPORT_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('patients')
      .select('name, cpf, rg, birth_date, sex, phone, email, address_street, address_number, address_complement, address_city, address_state, address_zip, notes, created_at')
      .eq('clinic_id', clinicId)
      .order('name')
      .range(offset, offset + EXPORT_PAGE_SIZE - 1)

    if (error) throw error

    const batch = (data ?? []) as PatientExportRow[]
    patients.push(...batch)
    if (batch.length < EXPORT_PAGE_SIZE) return patients
  }
}
