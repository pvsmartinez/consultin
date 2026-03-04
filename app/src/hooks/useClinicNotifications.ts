/**
 * useClinicNotifications
 *
 * Gerencia notificações em tempo real para staff (admin / receptionist).
 * Fontes: whatsapp-webhook insere linhas em `clinic_notifications` após
 *   - Escalada para humano  → type = 'wa_escalated'
 *   - Cancelamento via WA   → type = 'appointment_cancelled'
 *   - Confirmação via WA    → type = 'appointment_confirmed'
 *
 * Comportamento:
 *   1. Busca notificações não-lidas via React Query (stale 30 s)
 *   2. Inscreve-se no canal Realtime INSERT → exibe toast + invalida query
 *   3. Expõe `unreadCount` para o badge no menu lateral
 *   4. Expõe `markAllRead()` para limpar o badge
 */

import { useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '../services/supabase'
import { useAuthContext } from '../contexts/AuthContext'
import type { Database } from '../types/database'

type NavigateFn = (path: string) => void

type ClinicNotification = Database['public']['Tables']['clinic_notifications']['Row']

const TOAST_LABELS: Record<string, string> = {
  wa_escalated:           '💬 Novo atendimento humano solicitado',
  appointment_cancelled:  '❌ Consulta cancelada pelo paciente',
  appointment_confirmed:  '✅ Consulta confirmada pelo paciente',
}

export function useClinicNotifications(navigate?: NavigateFn) {
  const { profile, role } = useAuthContext()
  const clinicId = profile?.clinicId ?? null
  const qc = useQueryClient()

  // Only admin and receptionist have RLS access to clinic_notifications
  const enabled = !!clinicId && (role === 'admin' || role === 'receptionist')

  // ── Query: notificações não-lidas (refetch a cada 30s) ───────────────────
  // Polling em vez de postgres_changes para evitar WAL subscription contínua.
  const query = useQuery({
    queryKey: ['clinic_notifications', clinicId],
    enabled,
    staleTime: 25_000,
    refetchInterval: enabled ? 30_000 : false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clinic_notifications')
        .select('*')
        .eq('clinic_id', clinicId!)
        .is('read_at', null)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data ?? []) as ClinicNotification[]
    },
  })

  // ── Toast: dispara quando chegam novas notificações no polling ─────────────
  const prevIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!query.data) return
    const current = query.data
    const prevIds = prevIdsRef.current

    // Na primeira carga, apenas registra os IDs sem disparar toasts
    if (prevIds.size === 0 && current.length > 0) {
      prevIdsRef.current = new Set(current.map(n => n.id))
      return
    }

    // Toasts apenas para notificações novas (não vistas antes)
    const newItems = current.filter(n => !prevIds.has(n.id))
    for (const row of newItems) {
      const label = TOAST_LABELS[row.type] ?? '🔔 Nova notificação'
      const patientName = (row.data as Record<string, unknown>)?.patientName as string | undefined
      toast.info(patientName ? `${label} — ${patientName}` : label, {
        duration: 8_000,
        action: {
          label:   'Ver mensagens',
          onClick: () => { if (navigate) navigate('/whatsapp'); else window.location.href = '/whatsapp' },
        },
      })
    }

    prevIdsRef.current = new Set(current.map(n => n.id))
  }, [query.data, navigate])

  // ── Mutation: marcar todas como lidas ─────────────────────────────────────
  const markAllRead = useMutation({
    mutationFn: async () => {
      if (!clinicId) return
      const { error } = await supabase
        .from('clinic_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('clinic_id', clinicId)
        .is('read_at', null)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinic_notifications', clinicId] })
    },
  })

  return {
    notifications: query.data ?? [],
    unreadCount:   query.data?.length ?? 0,
    isLoading:     query.isPending && query.isFetching,
    markAllRead:   () => markAllRead.mutate(),
  }
}
