import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../services/supabase'
import { QK } from '../lib/queryKeys'
import { useAuthContext } from '../contexts/AuthContext'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PatientFile {
  id:          string
  patientId:   string
  clinicId:    string
  name:        string
  storagePath: string
  sizeBytes:   number | null
  mimeType:    string | null
  uploadedBy:  string | null
  createdAt:   string
}

function mapFile(r: Record<string, unknown>): PatientFile {
  return {
    id:          r.id as string,
    patientId:   r.patient_id as string,
    clinicId:    r.clinic_id as string,
    name:        r.name as string,
    storagePath: r.storage_path as string,
    sizeBytes:   (r.size_bytes as number) ?? null,
    mimeType:    (r.mime_type as string) ?? null,
    uploadedBy:  (r.uploaded_by as string) ?? null,
    createdAt:   r.created_at as string,
  }
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function usePatientFiles(patientId: string) {
  return useQuery<PatientFile[]>({
    queryKey: QK.patients.files(patientId),
    enabled: !!patientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('patient_files')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(r => mapFile(r as Record<string, unknown>))
    },
  })
}

export function useUploadPatientFile(patientId: string) {
  const qc = useQueryClient()
  const { profile } = useAuthContext()

  return useMutation({
    mutationFn: async ({ file, clinicId }: { file: File; clinicId: string }) => {
      const fileId     = crypto.randomUUID()
      // Sanitise filename — replace spaces/special chars
      const safeName   = file.name.replace(/[^a-zA-Z0-9._\-]/g, '_')
      const storagePath = `${clinicId}/${patientId}/${fileId}/${safeName}`

      const { error: uploadError } = await supabase.storage
        .from('patient-files')
        .upload(storagePath, file, { upsert: false })
      if (uploadError) throw uploadError

      const { error: dbError } = await supabase
        .from('patient_files')
        .insert({
          patient_id:   patientId,
          clinic_id:    clinicId,
          name:         file.name,
          storage_path: storagePath,
          size_bytes:   file.size,
          mime_type:    file.type || null,
          uploaded_by:  profile?.id ?? null,
        })
      if (dbError) {
        // Rollback storage
        await supabase.storage.from('patient-files').remove([storagePath])
        throw dbError
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.patients.files(patientId) }),
  })
}

export function useDeletePatientFile(patientId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ fileId, storagePath }: { fileId: string; storagePath: string }) => {
      const { error } = await supabase
        .from('patient_files')
        .delete()
        .eq('id', fileId)
      if (error) throw error
      // Best-effort storage cleanup — don't fail if file already gone
      await supabase.storage.from('patient-files').remove([storagePath]).catch(() => {})
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.patients.files(patientId) }),
  })
}

export async function getFileSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('patient-files')
    .createSignedUrl(storagePath, 60 * 60) // 1 hour
  if (error) throw error
  return data.signedUrl
}

/** Format bytes into a human-readable string. */
export function formatBytes(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
