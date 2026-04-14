import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../services/supabase'
import { QK } from '../lib/queryKeys'
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
    queryKey: QK.patients.list(profile?.clinicId, search, page),
    staleTime: 2 * 60_000,
    queryFn: async () => {
      const from = page * PATIENTS_PAGE_SIZE
      const to   = from + PATIENTS_PAGE_SIZE - 1
      let q = supabase
        .from('patients')
        .select(PATIENT_LIST_COLS, { count: 'exact' })
        .eq('clinic_id', profile!.clinicId!)
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
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.patients.all() }),
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
      qc.invalidateQueries({ queryKey: QK.patients.all() })
      qc.invalidateQueries({ queryKey: QK.patients.detail(id) })
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
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.patients.all() }),
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
    queryKey: QK.patients.detail(id),
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
  const { session, profile } = useAuthContext()
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: QK.patients.my(session?.user.id, profile?.clinicId),
    enabled: !!session?.user.id && !!profile?.clinicId,
    queryFn: async (): Promise<Patient | null> => {
      const userId = session!.user.id
      const email  = session!.user.email

      // Current clinic only: same account, local patient context.
      const orFilter = email
        ? `user_id.eq.${userId},email.eq.${email}`
        : `user_id.eq.${userId}`
      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .or(orFilter)
        .eq('clinic_id', profile?.clinicId ?? '')
        .limit(1)
      if (error) throw new Error(error.message)
      if (!data?.length) return null

      const row = data[0] as Record<string, unknown>

      // If matched only by email, backfill user_id so future lookups hit the index.
      if ((row.user_id as string | null) !== userId) {
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
      qc.invalidateQueries({ queryKey: QK.patients.my(session?.user.id, profile?.clinicId) })
      qc.invalidateQueries({ queryKey: QK.patients.all() })
      qc.invalidateQueries({ queryKey: QK.patients.detail(id) })
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

export interface MyPatientClinic {
  clinicId: string
  clinicName: string
  city: string | null
  state: string | null
  patientId: string
  patientName: string
  nextAppointmentAt: string | null
  isCurrent: boolean
}

export function useMyPatientClinics() {
  const { session, profile } = useAuthContext()

  return useQuery<MyPatientClinic[]>({
    queryKey: QK.patients.clinics(session?.user.id, profile?.clinicId),
    enabled: !!session?.user.id,
    staleTime: 60_000,
    queryFn: async () => {
      const userId = session!.user.id
      const email = session!.user.email
      const orFilter = email
        ? `user_id.eq.${userId},email.eq.${email}`
        : `user_id.eq.${userId}`

      const { data: patientRows, error: patientError } = await supabase
        .from('patients')
        .select(PATIENT_LIST_COLS)
        .or(orFilter)
        .order('created_at', { ascending: false })

      if (patientError) throw new Error(patientError.message)

      const normalized = new Map<string, Patient>()
      for (const raw of (patientRows ?? []) as unknown[]) {
        const patient = mapPatient(raw as Record<string, unknown>)
        const current = normalized.get(patient.clinicId)
        const isDirect = patient.userId === userId

        if (!current || (isDirect && current.userId !== userId)) {
          normalized.set(patient.clinicId, patient)
        }

        if (patient.userId !== userId) {
          void supabase.from('patients').update({ user_id: userId }).eq('id', patient.id)
        }
      }

      const patients = Array.from(normalized.values())
      if (patients.length === 0) return []

      const clinicIds = patients.map((patient) => patient.clinicId)
      const patientIds = patients.map((patient) => patient.id)

      const [{ data: clinicsData, error: clinicsError }, { data: apptData, error: apptError }] = await Promise.all([
        supabase
          .from('clinics')
          .select('id, name, city, state')
          .in('id', clinicIds),
        supabase
          .from('appointments')
          .select('patient_id, starts_at, status')
          .in('patient_id', patientIds)
          .in('status', ['scheduled', 'confirmed'])
          .gte('starts_at', new Date().toISOString())
          .order('starts_at', { ascending: true }),
      ])

      if (clinicsError) throw new Error(clinicsError.message)
      if (apptError) throw new Error(apptError.message)

      const clinicMap = new Map(
        ((clinicsData ?? []) as Array<Record<string, unknown>>).map((clinic) => [clinic.id as string, clinic]),
      )
      const nextApptByPatientId = new Map<string, string>()
      for (const appt of (apptData ?? []) as Array<Record<string, unknown>>) {
        const patientId = appt.patient_id as string
        if (!nextApptByPatientId.has(patientId)) {
          nextApptByPatientId.set(patientId, appt.starts_at as string)
        }
      }

      return patients
        .map((patient) => {
          const clinic = clinicMap.get(patient.clinicId)
          return {
            clinicId: patient.clinicId,
            clinicName: (clinic?.name as string) ?? 'Clínica',
            city: (clinic?.city as string) ?? null,
            state: (clinic?.state as string) ?? null,
            patientId: patient.id,
            patientName: patient.name,
            nextAppointmentAt: nextApptByPatientId.get(patient.id) ?? null,
            isCurrent: patient.clinicId === profile?.clinicId,
          }
        })
        .sort((left, right) => {
          if (left.isCurrent && !right.isCurrent) return -1
          if (!left.isCurrent && right.isCurrent) return 1
          return left.clinicName.localeCompare(right.clinicName)
        })
    },
  })
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
      qc.invalidateQueries({ queryKey: QK.patients.detail(patientId) })
    },
  })
}
