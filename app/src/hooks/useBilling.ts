/**
 * useBilling — Assinatura mensal da clínica via Asaas
 */
import { supabase } from '../services/supabase'
import { invalidateQueryKeys, useAppMutation } from '../lib/mutations'
import { QK } from '../lib/queryKeys'
import { activateClinicSubscription, cancelAsaasSubscription, upgradeClinicSubscription } from '../services/asaas'
import type { AsaasBillingType } from '../types'

export interface ActivateBillingInput {
  clinicId: string
  billingType: AsaasBillingType
  tier: 'basic' | 'professional' | 'unlimited'
  responsible: {
    name: string
    cpfCnpj: string
    email?: string
    phone?: string
    postalCode?: string
    address?: string
    addressNumber?: string
    province?: string
    city?: string
    state?: string
  }
  clinic: {
    name: string
    cnpj?: string
    city?: string
    state?: string
  }
  creditCard?: {
    holderName: string
    number: string
    expiryMonth: string
    expiryYear: string
    ccv: string
  }
}

/** Ativa cobrança mensal da clínica — cria customer + subscription no Asaas */
export function useActivateClinicBilling() {
  return useAppMutation({
    mutationFn: async (input: ActivateBillingInput) => {
      // A edge function já salva asaas_customer_id, subscription_id,
      // subscription_status e payments_enabled=true no banco.
      // Não repetir o write aqui para evitar inconsistências.
      const { customerId, subscriptionId } = await activateClinicSubscription({
        clinicId: input.clinicId,
        billingType: input.billingType,
        tier: input.tier,
        responsible: input.responsible,
        clinic: input.clinic,
        creditCard: input.creditCard,
      })
      return { customerId, subscriptionId }
    },
    invalidate: ({ queryClient, variables }) => invalidateQueryKeys(queryClient, [QK.clinic.detail(variables.clinicId)]),
  })
}

/** Cancela assinatura e desativa módulo de pagamentos */
export function useCancelClinicBilling(clinicId: string) {
  const detailKey = QK.clinic.detail(clinicId)

  return useAppMutation({
    mutationFn: async (subscriptionId: string) => {
      await cancelAsaasSubscription(subscriptionId)
      const { error } = await supabase
        .from('clinics')
        .update({ subscription_status: 'INACTIVE', payments_enabled: false })
        .eq('id', clinicId)
      if (error) throw new Error(error.message)
    },
    invalidate: ({ queryClient }) => invalidateQueryKeys(queryClient, [detailKey]),
  })
}

/** Muda o tier de uma assinatura ativa — atualiza preço no Asaas e subscription_tier no DB */
export function useUpgradeClinicBilling(clinicId: string) {
  const detailKey = QK.clinic.detail(clinicId)

  return useAppMutation({
    mutationFn: async ({ subscriptionId, tier }: { subscriptionId: string; tier: 'basic' | 'professional' | 'unlimited' }) => {
      // subscriptionId is validated in the edge function via clinicId — pass clinicId as primary key
      void subscriptionId // unused locally; edge fn resolves it from clinicId
      return upgradeClinicSubscription(clinicId, tier)
    },
    invalidate: ({ queryClient }) => invalidateQueryKeys(queryClient, [detailKey]),
  })
}
