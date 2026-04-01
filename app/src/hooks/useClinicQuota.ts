/**
 * useClinicQuota — quota de consultas mensais por tier de assinatura
 *
 * Tier limits:
 *   trial        → unlimited during trial window, blocked after
 *   basic        → 40 appointments/month  (R$100)
 *   professional → 100 appointments/month (R$200)
 *   unlimited    → no limit               (R$300)
 */
import { useQuery } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { supabase } from '../services/supabase'
import { QK } from '../lib/queryKeys'
import type { Clinic } from '../types'

export const TIER_LIMITS: Record<Clinic['subscriptionTier'], number | null> = {
  trial:        null,   // unlimited while trial active
  basic:        40,
  professional: 100,
  unlimited:    null,
}

export const TIER_LABELS: Record<Clinic['subscriptionTier'], string> = {
  trial:        'Período de teste',
  basic:        'Básico',
  professional: 'Profissional',
  unlimited:    'Ilimitado',
}

export const TIER_PRICES: Record<Exclude<Clinic['subscriptionTier'], 'trial'>, number> = {
  basic:        100,
  professional: 200,
  unlimited:    300,
}

export interface ClinicQuota {
  /** Appointments created this calendar month */
  used: number
  /** Monthly limit (null = unlimited) */
  limit: number | null
  /** Trial is still active (trial_ends_at > now) */
  trialActive: boolean
  /** Days remaining in trial (0 if expired or not on trial) */
  trialDaysLeft: number
  /** Quota exceeded: tier limit reached AND not on trial */
  exceeded: boolean
  /** Subscription required: trial ended + no active subscription */
  subscriptionRequired: boolean
  isLoading: boolean
}

function computeTrialState(trialEndsAt: string | null): { trialActive: boolean; trialDaysLeft: number } {
  if (!trialEndsAt) return { trialActive: false, trialDaysLeft: 0 }
  const diff = new Date(trialEndsAt).getTime() - Date.now()
  const trialActive = diff > 0
  const trialDaysLeft = trialActive ? Math.ceil(diff / (1000 * 60 * 60 * 24)) : 0
  return { trialActive, trialDaysLeft }
}

export function useClinicQuota(clinic: Clinic | null | undefined): ClinicQuota {
  const now = new Date()
  const monthKey = format(now, 'yyyy-MM')
  const monthStart = startOfMonth(now).toISOString()
  const monthEnd = endOfMonth(now).toISOString()

  const { data: used = 0, isLoading } = useQuery({
    queryKey: QK.quota.monthly(clinic?.id, monthKey),
    enabled: !!clinic?.id,
    staleTime: 30_000, // revalidate every 30s — quota changes on every new appointment
    queryFn: async () => {
      const { count, error } = await supabase
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinic!.id)
        .gte('starts_at', monthStart)
        .lte('starts_at', monthEnd)
        .neq('status', 'cancelled')
      if (error) throw error
      return count ?? 0
    },
  })

  if (!clinic) {
    return { used: 0, limit: null, trialActive: false, trialDaysLeft: 0, exceeded: false, subscriptionRequired: false, isLoading }
  }

  const { trialActive, trialDaysLeft } = computeTrialState(clinic.trialEndsAt)
  const limit = TIER_LIMITS[clinic.subscriptionTier]
  const hasActiveSubscription = clinic.subscriptionStatus === 'ACTIVE' || clinic.billingOverrideEnabled

  // Trial ended + no subscription → access blocked
  const subscriptionRequired = !trialActive && !hasActiveSubscription

  // Tier limit exceeded (only applies when on a paid tier, not trial)
  const exceeded = !trialActive && hasActiveSubscription && limit !== null && used >= limit

  return { used, limit, trialActive, trialDaysLeft, exceeded, subscriptionRequired, isLoading }
}
