import { useQuery } from '@tanstack/react-query'
import { supabase } from '../services/supabase'
import { useAuthContext } from '../contexts/AuthContext'
import { QK } from '../lib/queryKeys'
import type { Patient } from '../types'

function mapRow(row: Record<string, unknown>): Patient {
  return {
    id:         row.id as string,
    clinicId:   row.clinic_id as string,
    name:       row.name as string,
    phone:      (row.phone as string) ?? null,
    cpf:        (row.cpf as string) ?? null,
    email:      (row.email as string) ?? null,
    birthDate:  (row.birth_date as string) ?? null,
    createdAt:  row.created_at as string,
  }
}

export function usePatientSearch(search: string, limit = 30) {
  const { profile } = useAuthContext()
  const clinicId = profile?.clinicId
  const trimmed = search.trim()

  return useQuery({
    queryKey: QK.patients.search(clinicId, trimmed, limit),
    staleTime: 30_000,
    enabled: !!clinicId,
    queryFn: async () => {
      let q = supabase
        .from('patients')
        .select('id, clinic_id, name, phone, cpf, email, birth_date, created_at')
        .eq('clinic_id', clinicId!)
        .order('name', { ascending: true })
        .limit(limit)

      if (trimmed) {
        q = q.ilike('name', `%${trimmed}%`)
      }

      const { data, error } = await q
      if (error) throw error
      return (data ?? []).map(r => mapRow(r as unknown as Record<string, unknown>))
    },
  })
}
