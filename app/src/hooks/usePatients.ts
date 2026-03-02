import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../services/supabase'
import { useAuthContext } from '../contexts/AuthContext'
import { mapPatient } from '../utils/mappers'
import type { Patient, PatientInput } from '../types'
import type { Json } from '../types'

// Columns for patient lists — excludes anamnesis_data (potentially large JSONB)
// Full select('*') is used only on detail pages (usePatient / useMyPatient)
const PATIENT_LIST_COLS =
  'id,clinic_id,user_id,name,cpf,rg,birth_date,sex,phone,email,' +
  'address_street,address_number,address_complement,address_neighborhood,' +
  'address_city,address_state,address_zip,notes,custom_fields,created_at'

// Map camelCase PatientInput -> snake_case for DB
function mapInput(input: PatientInput) {
  return {
    name:                 input.name,
    user_id:              input.userId,
    cpf:                  input.cpf,
    rg:                   input.rg,
    birth_date:           input.birthDate,
    sex:                  input.sex,
    phone:                input.phone,
    email:                input.email,
    address_street:       input.addressStreet,
    address_number:       input.addressNumber,
    address_complement:   input.addressComplement,
    address_neighborhood: input.addressNeighborhood,
    address_city:         input.addressCity,
    address_state:        input.addressState,
    address_zip:          input.addressZip,
    notes:                input.notes,
    custom_fields:        input.customFields,
  }
}

export function usePatients(search = '') {
  const { profile } = useAuthContext()
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['patients', search],
    queryFn: async () => {
      let q = supabase
        .from('patients')
        .select(PATIENT_LIST_COLS)
        .order('name')
      if (search.trim()) {
        q = q.or(`name.ilike.%${search}%,cpf.ilike.%${search}%,phone.ilike.%${search}%`)
      }
      const { data, error } = await q
      if (error) throw new Error(error.message)
      return ((data ?? []) as unknown[]).map(r => mapPatient(r as Record<string, unknown>))
    },
    enabled: !!profile?.clinicId,
  })

  const createMut = useMutation({
    mutationFn: async (input: PatientInput): Promise<Patient> => {
      const { data, error } = await supabase
        .from('patients')
        .insert({
          clinic_id: profile!.clinicId!,
          ...mapInput(input),
          custom_fields: (input.customFields ?? {}) as Json,
        })
        .select()
        .single()
      if (error) throw new Error(error.message)
      return mapPatient(data as Record<string, unknown>)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['patients'] }),
  })

  const updateMut = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<PatientInput> }): Promise<Patient> => {
      const patch = Object.fromEntries(
        Object.entries(mapInput(input as PatientInput)).filter(([, v]) => v !== undefined),
      )
      const { data, error } = await supabase
        .from('patients')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return mapPatient(data as Record<string, unknown>)
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['patients'] })
      qc.invalidateQueries({ queryKey: ['patient', id] })
    },
  })

  return {
    patients:      query.data ?? [],
    loading:       query.isLoading,
    error:         query.error?.message ?? null,
    refetch:       query.refetch,
    createPatient: (input: PatientInput) => createMut.mutateAsync(input),
    updatePatient: (id: string, input: Partial<PatientInput>) => updateMut.mutateAsync({ id, input }),
  }
}

/**
 * Look up whether a portal account exists for a given CPF.
 * Calls the `find_user_by_cpf` SECURITY DEFINER RPC.
 * Returns { userId, displayName } or null if not found.
 */
export function useFindUserByCpf() {
  return useMutation({
    mutationFn: async (cpf: string): Promise<{ userId: string; displayName: string } | null> => {
      const digits = cpf.replace(/\D/g, '')
      if (digits.length !== 11) return null
      const { data, error } = await supabase.rpc('find_user_by_cpf', { search_cpf: cpf })
      if (error) throw new Error(error.message)
      const row = (data as { user_id: string; display_name: string }[] | null)?.[0]
      if (!row) return null
      return { userId: row.user_id, displayName: row.display_name }
    },
  })
}

export function usePatient(id: string) {
  const query = useQuery({
    queryKey: ['patient', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw new Error(error.message)
      return mapPatient(data as Record<string, unknown>)
    },
    enabled: !!id,
  })

  return {
    patient: query.data ?? null,
    loading: query.isLoading,
    error:   query.error?.message ?? null,
    refetch: query.refetch,
  }
}

/**
 * Find the Patient row that belongs to the currently logged-in portal user.
 * Tries user_id first, then falls back to email match (for staff-created records).
 * Also exposes an `updatePatient` mutation that keeps the React Query cache in sync.
 */
export function useMyPatient() {
  const { session } = useAuthContext()
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['my-patient', session?.user.id],
    enabled: !!session?.user.id,
    queryFn: async (): Promise<Patient | null> => {
      const userId = session!.user.id
      const email  = session!.user.email

      // Primary: direct user_id link
      const { data: byUserId } = await supabase
        .from('patients')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()
      if (byUserId) return mapPatient(byUserId as Record<string, unknown>)

      // Fallback: email (staff-created records have user_id = NULL)
      if (!email) return null
      const { data: byEmail } = await supabase
        .from('patients')
        .select('*')
        .eq('email', email)
        .maybeSingle()
      if (!byEmail) return null

      // Link user_id so future lookups are instant (fire-and-forget)
      void supabase
        .from('patients')
        .update({ user_id: userId })
        .eq('id', byEmail.id as string)

      return mapPatient(byEmail as Record<string, unknown>)
    },
  })

  const updateMut = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<PatientInput> }) => {
      const patch = Object.fromEntries(
        Object.entries(mapInput(input as PatientInput)).filter(([, v]) => v !== undefined),
      )
      const { data, error } = await supabase
        .from('patients')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return mapPatient(data as Record<string, unknown>)
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['my-patient', session?.user.id] })
      qc.invalidateQueries({ queryKey: ['patients'] })
      qc.invalidateQueries({ queryKey: ['patient', id] })
    },
  })

  return {
    patient:       query.data ?? null,
    loading:       query.isLoading,
    updatePatient: (input: Partial<PatientInput>) =>
      query.data
        ? updateMut.mutateAsync({ id: query.data.id, input })
        : Promise.reject(new Error('No patient linked to this account')),
    updating: updateMut.isPending,
  }
}

// ─── Anamnesis ────────────────────────────────────────────────────────────────
/** Save/replace all anamnesis answers for a patient. */
export function useUpdateAnamnesis() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ patientId, data }: { patientId: string; data: Record<string, unknown> }) => {
      const { error } = await supabase
        .from('patients')
        .update({ anamnesis_data: data as Json })
        .eq('id', patientId)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_r, { patientId }) => {
      qc.invalidateQueries({ queryKey: ['patient', patientId] })
      qc.invalidateQueries({ queryKey: ['patients'] })
    },
  })
}
