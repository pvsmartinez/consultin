import { useQuery } from '@tanstack/react-query'
import { supabase } from '../services/supabase'
import { QK } from '../lib/queryKeys'
import type { Database } from '../types/database'

export type PatientImportJob = Database['public']['Tables']['patient_import_jobs']['Row']

export function usePatientImportJob(jobId: string | null) {
  return useQuery<PatientImportJob | null>({
    queryKey: QK.patientImports.detail(jobId),
    enabled: !!jobId,
    staleTime: 0,
    refetchInterval: query => {
      const status = query.state.data?.status
      return status === 'queued' || status === 'processing' ? 2_000 : false
    },
    queryFn: async () => {
      const { data, error } = await supabase
        .from('patient_import_jobs')
        .select('*')
        .eq('id', jobId!)
        .single()
      if (error) throw error
      return (data ?? null) as PatientImportJob | null
    },
  })
}