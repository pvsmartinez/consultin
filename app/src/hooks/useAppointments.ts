import { useQuery } from '@tanstack/react-query'
import { supabase } from '../services/supabase'
import { mapAppointment } from '../utils/mappers'

/** Fetch appointments for a specific patient */
export function usePatientAppointments(patientId: string) {
  const query = useQuery({
    queryKey: ['patient-appointments', patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select(`*, professional:professionals(id, name, specialty)`)
        .eq('patient_id', patientId)
        .order('starts_at', { ascending: false })
      if (error) throw new Error(error.message)
      return (data ?? []).map(r => mapAppointment(r as Record<string, unknown>))
    },
    enabled: !!patientId,
  })

  return {
    appointments: query.data ?? [],
    loading:      query.isPending && query.isFetching,
  }
}
