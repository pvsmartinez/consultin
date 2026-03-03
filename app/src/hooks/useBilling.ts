/**
 * useBilling — Assinatura mensal da clínica via Asaas
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../services/supabase'
import { activateClinicSubscription, cancelAsaasSubscription } from '../services/asaas'
import type { AsaasBillingType } from '../types'

export interface ActivateBillingInput {
  clinicId: string
  billingType: AsaasBillingType
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
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: ActivateBillingInput) => {
      // A edge function já salva asaas_customer_id, subscription_id,
      // subscription_status e payments_enabled=true no banco.
      // Não repetir o write aqui para evitar inconsistências.
      const { customerId, subscriptionId } = await activateClinicSubscription({
        clinicId: input.clinicId,
        billingType: input.billingType,
        responsible: input.responsible,
        clinic: input.clinic,
        creditCard: input.creditCard,
      })
      return { customerId, subscriptionId }
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['clinic', vars.clinicId] })
    },
  })
}

/** Cancela assinatura e desativa módulo de pagamentos */
export function useCancelClinicBilling(clinicId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (subscriptionId: string) => {
      await cancelAsaasSubscription(subscriptionId)
      const { error } = await supabase
        .from('clinics')
        .update({ subscription_status: 'INACTIVE', payments_enabled: false })
        .eq('id', clinicId)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinic', clinicId] }),
  })
}
