import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthContext } from '../contexts/AuthContext'
import { QK } from '../lib/queryKeys'
import { supabase } from '../services/supabase'
import type { Database } from '../types/database'
import type {
  InventoryMaterial,
  InventoryMaterialInput,
  InventoryMovement,
  InventoryMovementInput,
} from '../types'
import { mapInventoryMaterial, mapInventoryMovement } from '../utils/mappers'

export function useInventoryMaterials(enabled = true) {
  const { profile } = useAuthContext()
  const clinicId = profile?.clinicId

  return useQuery<InventoryMaterial[]>({
    queryKey: QK.inventory.materials(clinicId),
    enabled: !!clinicId && enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_materials')
        .select('*')
        .eq('clinic_id', clinicId!)
        .order('active', { ascending: false })
        .order('name')
      if (error) throw error
      return (data as Record<string, unknown>[] | null ?? []).map(row => mapInventoryMaterial(row))
    },
  })
}

export function useAppointmentInventoryMovements(appointmentId?: string | null) {
  const { profile } = useAuthContext()
  const clinicId = profile?.clinicId

  return useQuery<InventoryMovement[]>({
    queryKey: QK.inventory.appointmentMovements(clinicId, appointmentId),
    enabled: !!clinicId && !!appointmentId,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_movements')
        .select('*, material:inventory_materials(id, name, unit, category)')
        .eq('clinic_id', clinicId!)
        .contains('metadata', { appointmentId: appointmentId! })
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data as Record<string, unknown>[] | null ?? []).map(row => mapInventoryMovement(row))
    },
  })
}

export function useInventoryMovements(materialId?: string | null, limit = 20) {
  const { profile } = useAuthContext()
  const clinicId = profile?.clinicId

  return useQuery<InventoryMovement[]>({
    queryKey: QK.inventory.movements(clinicId, materialId, limit),
    enabled: !!clinicId,
    staleTime: 30_000,
    queryFn: async () => {
      let query = supabase
        .from('inventory_movements')
        .select('*, material:inventory_materials(id, name, unit, category)')
        .eq('clinic_id', clinicId!)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (materialId) {
        query = query.eq('material_id', materialId)
      }

      const { data, error } = await query
      if (error) throw error
      return (data as Record<string, unknown>[] | null ?? []).map(row => mapInventoryMovement(row))
    },
  })
}

export function useCreateInventoryMaterial() {
  const { profile } = useAuthContext()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: InventoryMaterialInput) => {
      const payload: Database['public']['Tables']['inventory_materials']['Insert'] = {
        clinic_id: profile!.clinicId!,
        created_by: profile!.id,
        name: input.name,
        category: input.category,
        unit: input.unit,
        sku: input.sku,
        current_quantity: input.currentQuantity,
        min_quantity: input.minQuantity,
        ideal_quantity: input.idealQuantity,
        notes: input.notes,
        active: input.active,
        metadata: input.metadata as Database['public']['Tables']['inventory_materials']['Insert']['metadata'],
      }

      const { data, error } = await supabase
        .from('inventory_materials')
        .insert(payload)
        .select('*')
        .single()
      if (error) throw error
      return mapInventoryMaterial(data as Record<string, unknown>)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.inventory.materials(profile?.clinicId) })
    },
  })
}

export function useUpdateInventoryMaterial() {
  const { profile } = useAuthContext()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<InventoryMaterialInput> & { id: string }) => {
      const payload: Database['public']['Tables']['inventory_materials']['Update'] = {}
      if (input.name !== undefined) payload.name = input.name
      if (input.category !== undefined) payload.category = input.category
      if (input.unit !== undefined) payload.unit = input.unit
      if (input.sku !== undefined) payload.sku = input.sku
      if (input.currentQuantity !== undefined) payload.current_quantity = input.currentQuantity
      if (input.minQuantity !== undefined) payload.min_quantity = input.minQuantity
      if (input.idealQuantity !== undefined) payload.ideal_quantity = input.idealQuantity
      if (input.notes !== undefined) payload.notes = input.notes
      if (input.active !== undefined) payload.active = input.active
      if (input.metadata !== undefined) {
        payload.metadata = input.metadata as Database['public']['Tables']['inventory_materials']['Update']['metadata']
      }

      const { data, error } = await supabase
        .from('inventory_materials')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single()
      if (error) throw error
      return mapInventoryMaterial(data as Record<string, unknown>)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.inventory.materials(profile?.clinicId) })
      qc.invalidateQueries({ queryKey: QK.inventory.movementsAll(profile?.clinicId) })
      qc.invalidateQueries({ queryKey: QK.inventory.appointmentMovementsAll(profile?.clinicId) })
    },
  })
}

export function useCreateInventoryMovement() {
  const { profile } = useAuthContext()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: InventoryMovementInput) => {
      const payload: Database['public']['Tables']['inventory_movements']['Insert'] = {
        clinic_id: profile!.clinicId!,
        created_by: profile!.id,
        material_id: input.materialId,
        movement_type: input.movementType,
        quantity: input.quantity,
        reason: input.reason ?? null,
        notes: input.notes ?? null,
        metadata: (input.metadata ?? {}) as Database['public']['Tables']['inventory_movements']['Insert']['metadata'],
      }

      const { data, error } = await supabase
        .from('inventory_movements')
        .insert(payload)
        .select('*, material:inventory_materials(id, name, unit, category)')
        .single()
      if (error) throw error
      return mapInventoryMovement(data as Record<string, unknown>)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.inventory.materials(profile?.clinicId) })
      qc.invalidateQueries({ queryKey: QK.inventory.movementsAll(profile?.clinicId) })
      qc.invalidateQueries({ queryKey: QK.inventory.appointmentMovementsAll(profile?.clinicId) })
    },
  })
}