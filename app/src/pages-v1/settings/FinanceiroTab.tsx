import { useState, useEffect } from 'react'
import { useForm, Controller, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle, Warning, Prohibit, CreditCard, Gauge, ArrowsClockwise } from '@phosphor-icons/react'
import { toast } from 'sonner'
import Input from '../../components/ui/Input'
import { useActivateClinicBilling, useCancelClinicBilling, useUpgradeClinicBilling } from '../../hooks/useBilling'
import { useAuthContext } from '../../contexts/AuthContext'
import { gtagEvent } from '../../lib/gtag'
import { validateCpfCnpj, maskCpfCnpj, maskCEP, fetchAddressByCEP, formatPhone } from '../../utils/validators'
import { useClinicQuota, TIER_LABELS, TIER_PRICES, TIER_LIMITS } from '../../hooks/useClinicQuota'
import type { Clinic } from '../../types'

const billingSchema = z.object({
  responsibleName:          z.string().min(3, 'Nome obrigatório'),
  responsibleCpfCnpj:       z.string().min(1, 'CPF ou CNPJ obrigatório').refine(validateCpfCnpj, 'CPF ou CNPJ inválido'),
  responsibleEmail:         z.string().email('E-mail inválido').optional().or(z.literal('')),
  responsiblePhone:         z.string().optional(),
  responsiblePostalCode:    z.string().optional().refine(v => !v || v.replace(/\D/g, '').length === 8, 'CEP inválido'),
  responsibleAddress:       z.string().optional(),
  responsibleAddressNumber: z.string().optional(),
  responsibleBairro:        z.string().optional(),
  responsibleCity:          z.string().optional(),
  responsibleState:         z.string().optional(),
  // Cartão de crédito
  cardHolderName:  z.string().min(3, 'Nome no cartão obrigatório'),
  cardNumber:      z.string().min(13, 'Número do cartão inválido').max(19, 'Número do cartão inválido'),
  cardExpiryMonth: z.string().regex(/^(0[1-9]|1[0-2])$/, 'Mês inválido (01–12)'),
  cardExpiryYear:  z.string().regex(/^\d{4}$/, 'Ano inválido (ex: 2028)'),
  cardCcv:         z.string().min(3, 'CVV inválido').max(4, 'CVV inválido'),
})
type BillingForm = z.infer<typeof billingSchema>

const SUBSCRIPTION_STATUS_LABELS: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  ACTIVE:   { label: 'Ativa',    color: 'text-green-600 bg-green-50',   icon: CheckCircle },
  OVERDUE:  { label: 'Vencida',  color: 'text-yellow-600 bg-yellow-50', icon: Warning },
  INACTIVE: { label: 'Inativa',  color: 'text-gray-500 bg-gray-100',    icon: Prohibit },
  EXPIRED:  { label: 'Expirada', color: 'text-red-600 bg-red-50',       icon: Prohibit },
}

export default function FinanceiroTab({ clinic }: { clinic: Clinic }) {
  const { profile } = useAuthContext()
  const activate    = useActivateClinicBilling()
  const cancel      = useCancelClinicBilling(clinic.id)
  const quota       = useClinicQuota(clinic)
  const [showCancel, setShowCancel] = useState(false)
  const [cepLoading, setCepLoading] = useState(false)
  const [selectedTier, setSelectedTier] = useState<'basic' | 'professional' | 'unlimited'>('basic')

  const { register, handleSubmit, control, setValue, formState: { errors, isSubmitting } } = useForm<BillingForm>({
    resolver: zodResolver(billingSchema),
    defaultValues: {
      responsibleName: profile?.name ?? '',
    },
  })

  // CEP auto-complete via ViaCEP
  const cepValue = useWatch({ control, name: 'responsiblePostalCode' })
  useEffect(() => {
    const digits = (cepValue ?? '').replace(/\D/g, '')
    if (digits.length !== 8) return
    setCepLoading(true)
    fetchAddressByCEP(digits).then(addr => {
      if (addr) {
        setValue('responsibleAddress', addr.logradouro, { shouldValidate: false })
        setValue('responsibleBairro',  addr.bairro,     { shouldValidate: false })
        setValue('responsibleCity',    addr.localidade, { shouldValidate: false })
        setValue('responsibleState',   addr.uf,         { shouldValidate: false })
      }
      setCepLoading(false)
    })
  }, [cepValue, setValue])

  const statusInfo = clinic.subscriptionStatus ? SUBSCRIPTION_STATUS_LABELS[clinic.subscriptionStatus] : null

  async function onActivate(values: BillingForm) {
    const price = TIER_PRICES[selectedTier]
    gtagEvent('begin_checkout', { currency: 'BRL', value: price, items: [{ item_id: `consultin-${selectedTier}`, item_name: `Consultin ${TIER_LABELS[selectedTier]}`, price, quantity: 1 }] })
    try {
      await activate.mutateAsync({
        clinicId:    clinic.id,
        billingType: 'CREDIT_CARD',
        tier:        selectedTier,
        responsible: {
          name:          values.responsibleName,
          cpfCnpj:       values.responsibleCpfCnpj.replace(/\D/g, ''),
          email:         values.responsibleEmail || undefined,
          phone:         values.responsiblePhone?.replace(/\D/g, '') || undefined,
          postalCode:    values.responsiblePostalCode?.replace(/\D/g, '') || undefined,
          address:       values.responsibleAddress || undefined,
          addressNumber: values.responsibleAddressNumber || undefined,
          province:      values.responsibleBairro  || undefined,
          city:          values.responsibleCity    || undefined,
          state:         values.responsibleState   || undefined,
        },
        clinic: {
          name:  clinic.name,
          cnpj:  clinic.cnpj  ?? undefined,
          city:  clinic.city  ?? undefined,
          state: clinic.state ?? undefined,
        },
        creditCard: {
          holderName:  values.cardHolderName,
          number:      values.cardNumber.replace(/\s/g, ''),
          expiryMonth: values.cardExpiryMonth,
          expiryYear:  values.cardExpiryYear,
          ccv:         values.cardCcv,
        },
      })
      toast.success(`Assinatura ${TIER_LABELS[selectedTier]} ativada! Cobrança de R$\u00a0${price}/mês configurada no cartão.`)
      gtagEvent('purchase', { currency: 'BRL', value: price, items: [{ item_id: `consultin-${selectedTier}`, item_name: `Consultin ${TIER_LABELS[selectedTier]}`, price, quantity: 1 }] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao ativar assinatura.')
    }
  }

  async function onCancel() {
    if (!clinic.asaasSubscriptionId) return
    try {
      await cancel.mutateAsync(clinic.asaasSubscriptionId)
      toast.success('Assinatura cancelada.')
      setShowCancel(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao cancelar.')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Assinatura Consultin</h2>
        <p className="text-sm text-gray-500 mt-1">
          Planos a partir de R$&nbsp;100/mês. Cobrança automática no cartão de crédito.
        </p>
      </div>

      {/* Trial banner */}
      {quota.trialActive && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-teal-200 bg-teal-50">
          <CheckCircle size={20} className="text-teal-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-teal-900">Período de teste ativo</p>
            <p className="text-xs text-teal-700 mt-0.5">
              {quota.trialDaysLeft} {quota.trialDaysLeft === 1 ? 'dia restante' : 'dias restantes'} — aproveite para configurar sua clínica.
            </p>
          </div>
        </div>
      )}

      {/* Subscription status */}
      {clinic.paymentsEnabled && statusInfo && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
          clinic.subscriptionStatus === 'ACTIVE' ? 'border-green-200 bg-green-50' : 'border-yellow-200 bg-yellow-50'
        }`}>
          <statusInfo.icon size={20} className={statusInfo.color.split(' ')[0]} />
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-800">
              Assinatura {statusInfo.label} — Plano {TIER_LABELS[clinic.subscriptionTier]}
            </p>
            {clinic.asaasSubscriptionId && (
              <p className="text-xs text-gray-400 mt-0.5">ID: {clinic.asaasSubscriptionId}</p>
            )}
          </div>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusInfo.color}`}>
            R$&nbsp;{TIER_PRICES[clinic.subscriptionTier as Exclude<typeof clinic.subscriptionTier, 'trial'>] ?? '—'},00&nbsp;/ mês
          </span>
        </div>
      )}

      {/* Quota usage (only when subscribed) */}
      {clinic.paymentsEnabled && clinic.subscriptionTier !== 'trial' && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 bg-gray-50">
          <Gauge size={20} className="text-indigo-500 shrink-0" />
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-sm font-medium text-gray-700">Uso este mês</p>
              <span className="text-xs text-gray-500">
                {quota.used} / {quota.limit !== null ? quota.limit : '∞'}
              </span>
            </div>
            {quota.limit !== null && (
              <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    quota.exceeded ? 'bg-red-500' : quota.used / quota.limit > 0.8 ? 'bg-yellow-500' : 'bg-teal-500'
                  }`}
                  style={{ width: `${Math.min(100, (quota.used / quota.limit) * 100)}%` }}
                />
              </div>
            )}
            {quota.exceeded && (
              <p className="text-xs text-red-600 mt-1.5 font-medium">
                Limite atingido. Faça upgrade para continuar agendando.
              </p>
            )}
          </div>
        </div>
      )}

      {clinic.billingOverrideEnabled && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-indigo-200 bg-indigo-50">
          <CreditCard size={20} className="text-indigo-600" />
          <div>
            <p className="text-sm font-medium text-indigo-950">Liberação manual ativa</p>
            <p className="text-xs text-indigo-700 mt-0.5">
              O módulo financeiro foi liberado manualmente por um super admin, independentemente da assinatura do Asaas.
            </p>
          </div>
        </div>
      )}

      {!clinic.paymentsEnabled && (
        <form onSubmit={handleSubmit(onActivate)} className="space-y-6">
          {/* Tier selector */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Escolha seu plano</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(['basic', 'professional', 'unlimited'] as const).map(tier => {
                const limit = TIER_LIMITS[tier]
                return (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => setSelectedTier(tier)}
                    className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                      selectedTier === tier
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    {tier === 'professional' && (
                      <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] font-semibold bg-indigo-600 text-white px-2 py-0.5 rounded-full whitespace-nowrap">
                        Popular
                      </span>
                    )}
                    <p className={`text-sm font-semibold ${selectedTier === tier ? 'text-indigo-900' : 'text-gray-800'}`}>
                      {TIER_LABELS[tier]}
                    </p>
                    <p className={`text-xs mt-0.5 ${selectedTier === tier ? 'text-indigo-600' : 'text-gray-500'}`}>
                      {limit !== null ? `Até ${limit} consultas/mês` : 'Consultas ilimitadas'}
                    </p>
                    <p className={`text-lg font-bold mt-2 ${selectedTier === tier ? 'text-indigo-700' : 'text-gray-800'}`}>
                      R$&nbsp;{TIER_PRICES[tier]}<span className="text-xs font-normal text-gray-400">/mês</span>
                    </p>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="bg-teal-50 border border-teal-100 rounded-xl p-4 text-sm text-[#006970]">
            <strong>Cobrança automática:</strong> R$&nbsp;{TIER_PRICES[selectedTier]},00/mês debitado diretamente no cartão.
            Sem ação necessária após a ativação.
          </div>

          {/* Dados do responsável */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700">Dados do responsável</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Input label="Nome completo" required {...register('responsibleName')}
                  error={errors.responsibleName?.message} />
              </div>

              <Controller name="responsibleCpfCnpj" control={control} render={({ field }) => (
                <Input label="CPF ou CNPJ" required placeholder="000.000.000-00"
                  error={errors.responsibleCpfCnpj?.message}
                  value={field.value ?? ''} onBlur={field.onBlur}
                  onChange={e => field.onChange(maskCpfCnpj(e.target.value))} />
              )} />

              <Controller name="responsiblePhone" control={control} render={({ field }) => (
                <Input label="Telefone" placeholder="(11) 99999-9999"
                  error={errors.responsiblePhone?.message}
                  value={field.value ?? ''} onBlur={field.onBlur}
                  onChange={e => field.onChange(formatPhone(e.target.value))} />
              )} />

              <div className="sm:col-span-2">
                <Input label="E-mail" type="email" {...register('responsibleEmail')}
                  error={errors.responsibleEmail?.message} />
              </div>

              <Controller name="responsiblePostalCode" control={control} render={({ field }) => (
                <Input label={cepLoading ? 'CEP (buscando…)' : 'CEP'} placeholder="00000-000"
                  error={errors.responsiblePostalCode?.message}
                  value={field.value ?? ''} onBlur={field.onBlur}
                  onChange={e => field.onChange(maskCEP(e.target.value))} />
              )} />

              <Input label="Número" placeholder="42" {...register('responsibleAddressNumber')}
                error={errors.responsibleAddressNumber?.message} />

              <div className="sm:col-span-2">
                <Input label="Logradouro" placeholder="Auto-preenchido pelo CEP"
                  disabled={cepLoading} {...register('responsibleAddress')} />
              </div>

              <Input label="Bairro" placeholder="Auto-preenchido pelo CEP"
                disabled={cepLoading} {...register('responsibleBairro')} />

              <Input label="Cidade" placeholder="Auto-preenchido pelo CEP"
                disabled={cepLoading} {...register('responsibleCity')} />

              <Input label="Estado (UF)" placeholder="SP" maxLength={2}
                disabled={cepLoading} {...register('responsibleState')} />
            </div>
          </div>

          {/* Dados do cartão */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <CreditCard size={16} />
              Dados do cartão de crédito
            </h3>
            <p className="text-xs text-gray-500">
              Os dados do cartão são enviados diretamente para o Asaas (PCI-DSS) e nunca
              armazenados em nossos servidores.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Input label="Nome no cartão" required placeholder="NOME COMO NO CARTÃO"
                  {...register('cardHolderName')} error={errors.cardHolderName?.message} />
              </div>

              <div className="sm:col-span-2">
                <Input label="Número do cartão" required placeholder="0000 0000 0000 0000"
                  maxLength={19}
                  {...register('cardNumber', {
                    onChange: e => {
                      // formata com espaços a cada 4 dígitos
                      const v = e.target.value.replace(/\D/g, '').slice(0, 16)
                      e.target.value = v.replace(/(.{4})/g, '$1 ').trim()
                    },
                  })}
                  error={errors.cardNumber?.message} />
              </div>

              <div className="grid grid-cols-2 gap-4 sm:col-span-1">
                <Input label="Mês" required placeholder="MM"
                  maxLength={2} {...register('cardExpiryMonth')}
                  error={errors.cardExpiryMonth?.message} />
                <Input label="Ano" required placeholder="AAAA"
                  maxLength={4} {...register('cardExpiryYear')}
                  error={errors.cardExpiryYear?.message} />
              </div>

              <Input label="CVV" required placeholder="123"
                maxLength={4} {...register('cardCcv')}
                error={errors.cardCcv?.message} />
            </div>
          </div>

          <button type="submit" disabled={isSubmitting}
            className="w-full sm:w-auto px-6 py-2.5 text-sm font-medium rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {isSubmitting ? 'Ativando assinatura...' : `Ativar plano ${TIER_LABELS[selectedTier]} — R$\u00a0${TIER_PRICES[selectedTier]}/mês`}
          </button>
        </form>
      )}

      {/* ── Upgrade/downgrade plan (active subscription) ────────────────── */}
      {clinic.paymentsEnabled && clinic.asaasSubscriptionId && clinic.subscriptionTier !== 'trial' && (
        <UpgradePlanSection clinic={clinic} />
      )}

      {clinic.paymentsEnabled && clinic.asaasSubscriptionId && profile?.roles.includes('admin') && (
        <div className="border-t border-gray-200 pt-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Cancelar assinatura</h3>
          <p className="text-sm text-gray-400 mb-3">
            Ao cancelar, a cobrança mensal será interrompida.
          </p>
          {!showCancel ? (
            <button onClick={() => setShowCancel(true)}
              className="text-sm text-red-600 hover:text-red-700 underline">
              Cancelar assinatura
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600">Tem certeza?</span>
              <button onClick={onCancel} disabled={cancel.isPending}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                {cancel.isPending ? 'Cancelando...' : 'Confirmar cancelamento'}
              </button>
              <button onClick={() => setShowCancel(false)}
                className="text-sm text-gray-400 hover:text-gray-600">Voltar</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── UpgradePlanSection ───────────────────────────────────────────────────────

function UpgradePlanSection({ clinic }: { clinic: Clinic }) {
  const upgrade = useUpgradeClinicBilling(clinic.id)
  const [selectedTier, setSelectedTier] = useState<'basic' | 'professional' | 'unlimited'>(
    (clinic.subscriptionTier as 'basic' | 'professional' | 'unlimited') ?? 'basic'
  )

  const changed = selectedTier !== clinic.subscriptionTier

  async function handleUpgrade() {
    if (!changed) return
    try {
      await upgrade.mutateAsync({ subscriptionId: clinic.asaasSubscriptionId!, tier: selectedTier })
      toast.success(`Plano alterado para ${TIER_LABELS[selectedTier]} — R$\u00a0${TIER_PRICES[selectedTier]}/mês a partir da próxima cobrança.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao alterar plano.')
    }
  }

  return (
    <div className="border-t border-gray-200 pt-6 space-y-4">
      <div className="flex items-center gap-2">
        <ArrowsClockwise size={16} className="text-indigo-500" />
        <h3 className="text-sm font-semibold text-gray-700">Trocar plano</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {(['basic', 'professional', 'unlimited'] as const).map(tier => {
          const limit = TIER_LIMITS[tier]
          const isCurrent = tier === clinic.subscriptionTier
          return (
            <button
              key={tier}
              type="button"
              onClick={() => setSelectedTier(tier)}
              className={`relative p-3 rounded-xl border-2 text-left transition-all ${
                selectedTier === tier
                  ? isCurrent
                    ? 'border-gray-400 bg-gray-50'
                    : 'border-indigo-500 bg-indigo-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              {isCurrent && (
                <span className="absolute -top-2 left-3 text-[9px] font-semibold bg-gray-500 text-white px-2 py-0.5 rounded-full whitespace-nowrap">
                  Plano atual
                </span>
              )}
              <p className="text-sm font-semibold text-gray-800">{TIER_LABELS[tier]}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {limit !== null ? `Até ${limit} consultas/mês` : 'Ilimitadas'}
              </p>
              <p className="text-lg font-bold text-gray-800 mt-1.5">
                R$&nbsp;{TIER_PRICES[tier]}<span className="text-xs font-normal text-gray-400">/mês</span>
              </p>
            </button>
          )
        })}
      </div>
      {changed && (
        <div className="flex items-center gap-3">
          <button
            onClick={handleUpgrade}
            disabled={upgrade.isPending}
            className="px-5 py-2 text-sm font-medium rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {upgrade.isPending
              ? 'Atualizando...'
              : `Alterar para ${TIER_LABELS[selectedTier]} — R$\u00a0${TIER_PRICES[selectedTier]}/mês`}
          </button>
          <button
            onClick={() => setSelectedTier((clinic.subscriptionTier as 'basic' | 'professional' | 'unlimited') ?? 'basic')}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  )
}
