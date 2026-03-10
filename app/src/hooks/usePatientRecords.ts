import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { QK } from '../lib/queryKeys'
import { supabase } from '../services/supabase'
import { useAuthContext } from '../contexts/AuthContext'
import type { PatientRecord, RecordType } from '../types'

const BUCKET = 'patient-files'

function mapRow(r: Record<string, unknown>): PatientRecord {
  const creator = r.creator as Record<string, unknown> | null
  return {
    id:            r.id as string,
    clinicId:      r.clinic_id as string,
    patientId:     r.patient_id as string,
    appointmentId: (r.appointment_id as string) ?? null,
    createdBy:     r.created_by as string,
    createdByName: creator ? (creator.name as string) : null,
    type:          r.type as RecordType,
    content:       (r.content as string) ?? null,
    fileName:      (r.file_name as string) ?? null,
    filePath:      (r.file_path as string) ?? null,
    fileMime:      (r.file_mime as string) ?? null,
    fileSize:      (r.file_size as number) ?? null,
    createdAt:     r.created_at as string,
  }
}

export function usePatientRecords(patientId: string) {
  const qc = useQueryClient()
  const { profile } = useAuthContext()
  const clinicId = profile?.clinicId

  // ─── List ──────────────────────────────────────────────────────────────────
  const query = useQuery({
    queryKey: QK.patients.records(patientId),
    enabled: !!patientId && !!clinicId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('patient_records')
        .select('*, creator:user_profiles!created_by(name)')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(r => mapRow(r as Record<string, unknown>))
    },
  })

  // ─── Add note ─────────────────────────────────────────────────────────────
  const addNote = useMutation({
    mutationFn: async ({
      content,
      appointmentId,
    }: {
      content: string
      appointmentId?: string
    }) => {
      const { data, error } = await supabase
        .from('patient_records')
        .insert({
          clinic_id:      clinicId!,
          patient_id:     patientId,
          created_by:     profile!.id,
          type:           'note',
          content,
          appointment_id: appointmentId ?? null,
        })
        .select('*, creator:user_profiles!created_by(name)')
        .single()
      if (error) throw error
      return mapRow(data as Record<string, unknown>)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.patients.records(patientId) }),
  })

  // ─── Upload attachment ─────────────────────────────────────────────────────
  const uploadFile = useMutation({
    mutationFn: async ({
      file,
      appointmentId,
    }: {
      file: File
      appointmentId?: string
    }) => {
      if (!clinicId) throw new Error('clinic not loaded')

      // Build a unique path so old files of the same name can coexist
      const timestamp = Date.now()
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const filePath = `${clinicId}/${patientId}/${timestamp}_${safeName}`

      // Upload to Storage (private bucket)
      const { error: storageError } = await supabase.storage
        .from(BUCKET)
        .upload(filePath, file, { contentType: file.type, upsert: false })
      if (storageError) throw storageError

      // Insert record
      const { data, error: dbError } = await supabase
        .from('patient_records')
        .insert({
          clinic_id:      clinicId!,
          patient_id:     patientId,
          created_by:     profile!.id,
          type:           'attachment',
          file_name:      file.name,
          file_path:      filePath,
          file_mime:      file.type,
          file_size:      file.size,
          appointment_id: appointmentId ?? null,
        })
        .select('*, creator:user_profiles!created_by(name)')
        .single()
      if (dbError) throw dbError
      return mapRow(data as Record<string, unknown>)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.patients.records(patientId) }),
  })

  // ─── Delete ───────────────────────────────────────────────────────────────
  const deleteRecord = useMutation({
    mutationFn: async (record: PatientRecord) => {
      // Remove from storage first (if attachment)
      if (record.type === 'attachment' && record.filePath) {
        const { error: storageError } = await supabase.storage
          .from(BUCKET)
          .remove([record.filePath])
        if (storageError) throw storageError
      }
      // Delete DB row
      const { error } = await supabase
        .from('patient_records')
        .delete()
        .eq('id', record.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.patients.records(patientId) }),
  })

  // ─── Get a short-lived signed URL for a private attachment ────────────────
  async function getAttachmentUrl(filePath: string): Promise<string> {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(filePath, 60 * 60) // 1 hour
    if (error) throw error
    return data.signedUrl
  }

  return { ...query, addNote, uploadFile, deleteRecord, getAttachmentUrl, isLoading: query.isPending && query.isFetching }
}
