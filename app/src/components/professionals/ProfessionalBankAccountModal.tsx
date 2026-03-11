/**
 * ProfessionalBankAccountModal
 * Permite ao admin cadastrar ou editar a conta bancária de um profissional para repasses.
 */
import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { X, Bank } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Modal } from '@pvsmartinez/shared/ui'
import Input from '../ui/Input'
import { useUpsertBankAccount, useProfessionalBankAccount } from '../../hooks/useProfessionalBankAccount'
import { useAuthContext } from '../../contexts/AuthContext'
import { BANK_LIST } from '../../types'
import type { Professional } from '../../types'
import { validateCpfCnpj, maskCpfCnpj } from '../../utils/validators'

const schema = z.object({
  bankCode:      z.string().min(1, 'Banco obrigatório'),
  accountType:   z.enum(['CONTA_CORRENTE', 'CONTA_POUPANCA', 'CONTA_SALARIO']),
  agency:        z.string().min(1, 'Agência obrigatória'),
  agencyDigit:   z.string().optional(),
  account:       z.string().min(1, 'Conta obrigatória'),
  accountDigit:  z.string().optional(),
  ownerName:     z.string().min(3, 'Nome do titular obrigatório'),
  ownerCpfCnpj:  z
    .string()
    .min(1, 'CPF ou CNPJ obrigatório')
    .refine(validateCpfCnpj, 'CPF ou CNPJ inválido'),
})
type FormValues = z.infer<typeof schema>

const ACCOUNT_TYPES = [
  { value: 'CONTA_CORRENTE', label: 'Conta Corrente' },
  { value: 'CONTA_POUPANCA', label: 'Conta Poupança' },
  { value: 'CONTA_SALARIO',  label: 'Conta Salário'  },
] as const

interface Props {
  professional: Professional
  onClose: () => void
}

export default function ProfessionalBankAccountModal({ professional, onClose }: Props) {
  const { profile } = useAuthContext()
  const clinicId = profile?.clinicId ?? ''

  const { data: existing } = useProfessionalBankAccount(professional.id)
  const upsert = useUpsertBankAccount()

  const { register, handleSubmit, reset, control, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      bankCode:     '',
      accountType:  'CONTA_CORRENTE',
      agency:       '',
      agencyDigit:  '',
      account:      '',
      accountDigit: '',
      ownerName:    professional.name,
      ownerCpfCnpj: '',
    },
  })

  // Pre-fill com dados existentes
  useEffect(() => {
    if (existing) {
      reset({
        bankCode:     existing.bankCode,
        accountType:  existing.accountType,
        agency:       existing.agency,
        agencyDigit:  existing.agencyDigit ?? '',
        account:      existing.account,
        accountDigit: existing.accountDigit ?? '',
        ownerName:    existing.ownerName,
        ownerCpfCnpj: existing.ownerCpfCnpj,
      })
    }
  }, [existing, reset])

  async function onSubmit(values: FormValues) {
    const bankName = BANK_LIST.find(b => b.code === values.bankCode)?.name ?? values.bankCode
    try {
      await upsert.mutateAsync({
        professionalId: professional.id,
        clinicId,
        bankCode:     values.bankCode,
        bankName,
        accountType:  values.accountType,
        agency:       values.agency,
        agencyDigit:  values.agencyDigit ?? null,
        account:      values.account,
        accountDigit: values.accountDigit ?? null,
        ownerName:    values.ownerName,
        ownerCpfCnpj: values.ownerCpfCnpj.replace(/\D/g, ''),
        active:       true,
      })
      toast.success('Conta bancária salva!')
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar conta.')
    }
  }

  return (
    <Modal open={true} onClose={onClose} maxWidth="md">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Bank size={18} className="text-indigo-500" />
            <div>
              <h2 className="text-sm font-semibold text-gray-800">Conta bancária para repasse</h2>
              <p className="text-xs text-gray-400">{professional.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">

          {/* Banco */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Banco</label>
            <select {...register('bankCode')}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400">
              <option value="">Selecione o banco</option>
              {BANK_LIST.map(b => (
                <option key={b.code} value={b.code}>{b.code} — {b.name}</option>
              ))}
            </select>
            {errors.bankCode && <p className="text-xs text-red-500 mt-1">{errors.bankCode.message}</p>}
          </div>

          {/* Tipo de conta */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Tipo de conta</label>
            <div className="flex gap-3">
              {ACCOUNT_TYPES.map(t => (
                <label key={t.value} className="flex items-center gap-1.5 cursor-pointer text-sm text-gray-700">
                  <input type="radio" value={t.value} {...register('accountType')} className="accent-indigo-500" />
                  {t.label}
                </label>
              ))}
            </div>
          </div>

          {/* Agência + Conta */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex gap-2">
              <div className="flex-1">
                <Input label="Agência" {...register('agency')} error={errors.agency?.message} />
              </div>
              <div className="w-16">
                <Input label="Dígito" {...register('agencyDigit')} placeholder="-" />
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Input label="Conta" {...register('account')} error={errors.account?.message} />
              </div>
              <div className="w-16">
                <Input label="Dígito" {...register('accountDigit')} placeholder="-" />
              </div>
            </div>
          </div>

          {/* Titular */}
          <Input label="Nome do titular" required {...register('ownerName')} error={errors.ownerName?.message} />
          <Controller
            name="ownerCpfCnpj"
            control={control}
            render={({ field }) => (
              <Input
                label="CPF ou CNPJ do titular"
                required
                placeholder="000.000.000-00"
                error={errors.ownerCpfCnpj?.message}
                value={field.value ?? ''}
                onChange={e => field.onChange(maskCpfCnpj(e.target.value))}
                onBlur={field.onBlur}
              />
            )}
          />

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={isSubmitting}
              className="px-5 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {isSubmitting ? 'Salvando...' : 'Salvar conta'}
            </button>
          </div>
        </form>
    </Modal>
  )
}
