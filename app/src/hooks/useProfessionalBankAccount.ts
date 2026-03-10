/**
 * useProfessionalBankAccount — CRUD conta bancária do profissional para repasses
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../services/supabase'
import { QK } from '../lib/queryKeys'
import type { ProfessionalBankAccount, ProfessionalBankAccountInput } from '../types'

function mapRow(r: Record<string, unknown>): ProfessionalBankAccount {
  return {
    id:              r.id as string,
    clinicId:        r.clinic_id as string,
    professionalId:  r.professional_id as string,
    bankCode:        r.bank_code as string,
    bankName:        r.bank_name as string,
    accountType:     r.account_type as ProfessionalBankAccount['accountType'],
    agency:          r.agency as string,
    agencyDigit:     (r.agency_digit as string) ?? null,
    account:         r.account as string,
    accountDigit:    (r.account_digit as string) ?? null,
    ownerName:       r.owner_name as string,
    ownerCpfCnpj:   r.owner_cpf_cnpj as string,
    asaasTransferId: (r.asaas_transfer_id as string) ?? null,
    active:          (r.active as boolean) ?? true,
    createdAt:       r.created_at as string,
  }
}

/** Busca conta bancária de um profissional específico */
export function useProfessionalBankAccount(professionalId: string | undefined) {
  return useQuery({
    queryKey: QK.professionals.bankAccount(professionalId),
    enabled: !!professionalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('professional_bank_accounts')
        .select('*')
        .eq('professional_id', professionalId!)
        .eq('active', true)
        .maybeSingle()
      if (error) throw error
      return data ? mapRow(data as Record<string, unknown>) : null
    },
  })
}

/** Lista todas as contas bancárias da clínica */
export function useClinicBankAccounts(clinicId: string | undefined) {
  return useQuery({
    queryKey: QK.professionals.bankAccounts(clinicId),
    enabled: !!clinicId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('professional_bank_accounts')
        .select('*, professional:professionals(id, name, specialty)')
        .eq('clinic_id', clinicId!)
        .eq('active', true)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map((r: Record<string, unknown>) => mapRow(r))
    },
  })
}

export interface UpsertBankAccountInput extends ProfessionalBankAccountInput {
  professionalId: string
  clinicId: string
}

/** Cria ou atualiza conta bancária do profissional */
export function useUpsertBankAccount() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpsertBankAccountInput) => {
      // Upsert by professional_id (UNIQUE constraint)
      const { data, error } = await supabase
        .from('professional_bank_accounts')
        .upsert({
          professional_id: input.professionalId,
          clinic_id:       input.clinicId,
          bank_code:       input.bankCode,
          bank_name:       input.bankName,
          account_type:    input.accountType,
          agency:          input.agency,
          agency_digit:    input.agencyDigit ?? null,
          account:         input.account,
          account_digit:   input.accountDigit ?? null,
          owner_name:      input.ownerName,
          owner_cpf_cnpj:  input.ownerCpfCnpj,
          active:          true,
        }, { onConflict: 'professional_id' })
        .select()
        .single()
      if (error) throw new Error(error.message)
      return mapRow(data as Record<string, unknown>)
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: QK.professionals.bankAccount(data.professionalId) })
      qc.invalidateQueries({ queryKey: QK.professionals.bankAccounts(data.clinicId) })
    },
  })
}

/** Remove conta bancária */
export function useDeleteBankAccount(clinicId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('professional_bank_accounts')
        .update({ active: false })
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.professionals.bankAccounts(clinicId) })
    },
  })
}
