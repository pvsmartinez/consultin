import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthContext } from '../contexts/AuthContext'
import { QK } from '../lib/queryKeys'
import { supabase } from '../services/supabase'
import type {
  Json,
  PatientClinicalItem,
  PatientClinicalItemMetadata,
  PatientClinicalItemInput,
  PatientProsthesis,
  PatientProsthesisInput,
} from '../types'

function mapClinicalItem(row: Record<string, unknown>): PatientClinicalItem {
  const creator = row.creator as Record<string, unknown> | null
  return {
    id: row.id as string,
    clinicId: row.clinic_id as string,
    patientId: row.patient_id as string,
    createdBy: row.created_by as string,
    createdByName: creator ? (creator.name as string) : null,
    category: row.category as PatientClinicalItem['category'],
    itemType: row.item_type as PatientClinicalItem['itemType'],
    status: row.status as PatientClinicalItem['status'],
    title: row.title as string,
    description: (row.description as string) ?? null,
    notes: (row.notes as string) ?? null,
    requestedForDate: (row.requested_for_date as string) ?? null,
    issuedOn: (row.issued_on as string) ?? null,
    completedOn: (row.completed_on as string) ?? null,
    metadata: ((row.metadata as PatientClinicalItemMetadata | null) ?? {}) as PatientClinicalItemMetadata,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

function mapProsthesis(row: Record<string, unknown>): PatientProsthesis {
  const creator = row.creator as Record<string, unknown> | null
  return {
    id: row.id as string,
    clinicId: row.clinic_id as string,
    patientId: row.patient_id as string,
    createdBy: row.created_by as string,
    createdByName: creator ? (creator.name as string) : null,
    name: row.name as string,
    toothRegion: (row.tooth_region as string) ?? null,
    laboratoryName: (row.laboratory_name as string) ?? null,
    status: row.status as PatientProsthesis['status'],
    startedOn: (row.started_on as string) ?? null,
    dueOn: (row.due_on as string) ?? null,
    installedOn: (row.installed_on as string) ?? null,
    notes: (row.notes as string) ?? null,
    metadata: ((row.metadata as Record<string, unknown> | null) ?? {}) as Record<string, unknown>,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

function sanitizeClinicalItemPayload(input: PatientClinicalItemInput) {
  return {
    category: input.category,
    item_type: input.itemType,
    status: input.status,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    notes: input.notes?.trim() || null,
    requested_for_date: input.requestedForDate || null,
    issued_on: input.issuedOn || null,
    completed_on: input.completedOn || null,
    metadata: (input.metadata ?? {}) as Json,
  }
}

function sanitizeProsthesisPayload(input: PatientProsthesisInput) {
  return {
    name: input.name.trim(),
    tooth_region: input.toothRegion?.trim() || null,
    laboratory_name: input.laboratoryName?.trim() || null,
    status: input.status,
    started_on: input.startedOn || null,
    due_on: input.dueOn || null,
    installed_on: input.installedOn || null,
    notes: input.notes?.trim() || null,
    metadata: (input.metadata ?? {}) as Json,
  }
}

export function usePatientClinicalItems(patientId: string) {
  const queryClient = useQueryClient()
  const { profile } = useAuthContext()
  const clinicId = profile?.clinicId

  const itemsQuery = useQuery({
    queryKey: QK.patients.clinicalItems(patientId),
    enabled: !!patientId && !!clinicId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('patient_clinical_items')
        .select('*, creator:user_profiles!created_by(name)')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data ?? []).map(row => mapClinicalItem(row as Record<string, unknown>))
    },
  })

  const prosthesesQuery = useQuery({
    queryKey: QK.patients.prostheses(patientId),
    enabled: !!patientId && !!clinicId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('patient_prostheses')
        .select('*, creator:user_profiles!created_by(name)')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data ?? []).map(row => mapProsthesis(row as Record<string, unknown>))
    },
  })

  const createItem = useMutation({
    mutationFn: async (input: PatientClinicalItemInput) => {
      if (!clinicId || !profile?.id) throw new Error('Perfil da clínica não carregado')

      const { data, error } = await supabase
        .from('patient_clinical_items')
        .insert({
          clinic_id: clinicId,
          patient_id: patientId,
          created_by: profile.id,
          ...sanitizeClinicalItemPayload(input),
        })
        .select('*, creator:user_profiles!created_by(name)')
        .single()

      if (error) throw error
      return mapClinicalItem(data as Record<string, unknown>)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QK.patients.clinicalItems(patientId) }),
  })

  const updateItem = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: PatientClinicalItemInput }) => {
      const { data, error } = await supabase
        .from('patient_clinical_items')
        .update(sanitizeClinicalItemPayload(input))
        .eq('id', id)
        .select('*, creator:user_profiles!created_by(name)')
        .single()

      if (error) throw error
      return mapClinicalItem(data as Record<string, unknown>)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QK.patients.clinicalItems(patientId) }),
  })

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('patient_clinical_items').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QK.patients.clinicalItems(patientId) }),
  })

  const createProsthesis = useMutation({
    mutationFn: async (input: PatientProsthesisInput) => {
      if (!clinicId || !profile?.id) throw new Error('Perfil da clínica não carregado')

      const { data, error } = await supabase
        .from('patient_prostheses')
        .insert({
          clinic_id: clinicId,
          patient_id: patientId,
          created_by: profile.id,
          ...sanitizeProsthesisPayload(input),
        })
        .select('*, creator:user_profiles!created_by(name)')
        .single()

      if (error) throw error
      return mapProsthesis(data as Record<string, unknown>)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QK.patients.prostheses(patientId) }),
  })

  const updateProsthesis = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: PatientProsthesisInput }) => {
      const { data, error } = await supabase
        .from('patient_prostheses')
        .update(sanitizeProsthesisPayload(input))
        .eq('id', id)
        .select('*, creator:user_profiles!created_by(name)')
        .single()

      if (error) throw error
      return mapProsthesis(data as Record<string, unknown>)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QK.patients.prostheses(patientId) }),
  })

  const deleteProsthesis = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('patient_prostheses').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QK.patients.prostheses(patientId) }),
  })

  return {
    itemsQuery,
    prosthesesQuery,
    createItem,
    updateItem,
    deleteItem,
    createProsthesis,
    updateProsthesis,
    deleteProsthesis,
  }
}