import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '../services/supabase'
import { QK } from '../lib/queryKeys'
import { useAuthContext } from '../contexts/AuthContext'
import { useClinic } from './useClinic'
import type { Clinic } from '../types'

export type ClinicModule = 'rooms' | 'staff' | 'whatsapp' | 'financial'

export function useClinicModules() {
  const qc = useQueryClient()
  const { profile } = useAuthContext()
  const { data: clinic } = useClinic()
  const clinicId = profile?.clinicId

  const modules: ClinicModule[] = (clinic?.modulesEnabled ?? []) as ClinicModule[]

  const hasRooms     = modules.includes('rooms')
  const hasStaff     = modules.includes('staff')
  const hasWhatsApp  = modules.includes('whatsapp')
  const hasFinancial = modules.includes('financial')

  async function setModules(next: ClinicModule[]) {
    if (!clinicId) return
    const { error } = await supabase
      .from('clinics')
      .update({ modules_enabled: next })
      .eq('id', clinicId)
    if (error) throw error

    // Update cache immediately (optimistic-style, after confirm)
    qc.setQueryData<Clinic>(QK.clinic.detail(clinicId), old =>
      old ? { ...old, modulesEnabled: next } : old
    )
  }

  async function enableModule(module: ClinicModule) {
    if (modules.includes(module)) return
    try {
      await setModules([...modules, module])
      toast.success('Módulo ativado')
    } catch {
      toast.error('Erro ao ativar módulo')
    }
  }

  async function disableModule(module: ClinicModule) {
    try {
      await setModules(modules.filter(m => m !== module))
      toast.success('Módulo desativado')
    } catch {
      toast.error('Erro ao desativar módulo')
    }
  }

  return { modules, hasRooms, hasStaff, hasWhatsApp, hasFinancial, enableModule, disableModule }
}
