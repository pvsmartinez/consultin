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

export const PATIENTS_PAGE_SIZE = 50

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

export function usePatients(search = '', page = 0) {
  const { profile } = useAuthContext()
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['patients', search, page],
    staleTime: 2 * 60_000,
    queryFn: async () => {
      const from = page * PATIENTS_PAGE_SIZE
      const to   = from + PATIENTS_PAGE_SIZE - 1
      let q = supabase
        .from('patients')
        .select(PATIENT_LIST_COLS, { count: 'exact' })
        .order('name')
        .range(from, to)
      if (search.trim()) {
        q = q.or(`name.ilike.%${search}%,cpf.ilike.%${search}%,phone.ilike.%${search}%`)
      }
      const { data, error, count } = await q
      if (error) throw new Error(error.message)
      return {
        patients: ((data ?? []) as unknown[]).map(r => mapPatient(r as Record<string, unknown>)),
        total: count ?? 0,
      }
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
    patients:      query.data?.patients ?? [],
    total:         query.data?.total ?? 0,
    pageCount:     Math.ceil((query.data?.total ?? 0) / PATIENTS_PAGE_SIZE),
    loading:       query.isPending && query.isFetching,
    error:         query.error?.message ?? null,
    refetch:       query.refetch,
    createPatient: (input: PatientInput) => createMut.mutateAsync(input),
    updatePatient: (id: string, input: Partial<PatientInput>) => updateMut.mutateAsync({ id, input }),
  }
}

/**
 * Standalone create-patient mutation — useful for quick inline patient creation.
 */
export function useCreatePatient() {
  const { profile } = useAuthContext()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: Pick<PatientInput, 'name' | 'phone'> & Partial<PatientInput>): Promise<Patient> => {
      const { data, error } = await supabase
        .from('patients')
        .insert({
          clinic_id: profile!.clinicId!,
          name:      input.name,
          phone:     input.phone ?? null,
          user_id:   null,
          cpf:       input.cpf ?? null,
          email:     input.email ?? null,
          custom_fields: {},
        })
        .select()
        .single()
      if (error) throw new Error(error.message)
      return mapPatient(data as Record<string, unknown>)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['patients'] }),
  })
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
    loading: query.isPending && query.isFetching,
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

      // Single query: fetch by user_id OR email in one roundtrip
      const orFilter = email
        ? `user_id.eq.${userId},email.eq.${email}`
        : `user_id.eq.${userId}`
      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .or(orFilter)
        .limit(2)
      if (error) throw new Error(error.message)
      if (!data?.length) return null

      // Prefer the row directly linked by user_id
      const byUserId = data.find(r => (r as Record<string, unknown>).user_id === userId)
      const row = (byUserId ?? data[0]) as Record<string, unknown>

      // If matched only by email, backfill user_id so future lookups hit the index (fire-and-forget)
      if (!byUserId) {
        void supabase
          .from('patients')
          .update({ user_id: userId })
          .eq('id', row.id as string)
      }

      return mapPatient(row)
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
    loading:       query.isPending && query.isFetching,
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
    // anamnesis_data is not in PATIENT_LIST_COLS — no need to bust the paginated list
    onSuccess: (_r, { patientId }) => {
      qc.invalidateQueries({ queryKey: ['patient', patientId] })
    },
  })
}
