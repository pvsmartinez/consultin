import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { IMaskInput } from 'react-imask'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Plus, PencilSimple, Envelope, CaretDown, CaretUp, SignIn, Trash,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
  useAdminClinics, useCreateClinic, useUpdateClinic, useDeleteClinic, useEnterClinic, useInviteUser,
  useAdminAuthUsers,
} from '../../hooks/useAdmin'
import { useAuthContext } from '../../contexts/AuthContext'
import { USER_ROLE_LABELS } from '../../types'
import type { Clinic, UserRole } from '../../types'
import { BR_STATES } from '../../utils/constants'
import AdminInput from './AdminInput'
import { clinicSchema, createUserSchema } from './types'
import type { ClinicForm, CreateUserForm } from './types'
import { TIER_LABELS, TIER_LIMITS, TIER_PRICES } from '../../hooks/useClinicQuota'

// ─── Clinics Tab ──────────────────────────────────────────────────────────────

export default function ClinicsTab() {
  const { data: clinics = [], isLoading } = useAdminClinics()
  const createClinic = useCreateClinic()
  const [showForm, setShowForm] = useState(false)

  const { register, handleSubmit, reset, control, formState: { errors, isSubmitting } } = useForm<ClinicForm>({
    resolver: zodResolver(clinicSchema),
  })

  async function onSubmit(values: ClinicForm) {
    try {
      await createClinic.mutateAsync(values)
      toast.success(`Clínica "${values.name}" criada!`)
      reset()
      setShowForm(false)
    } catch (e: unknown) {
      toast.error((e as Error).message ?? 'Erro ao criar clínica')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-300">
          {isLoading ? 'Carregando...' : `${clinics.length} clínica${clinics.length !== 1 ? 's' : ''}`}
        </h2>
        <button onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors">
          <Plus size={14} /> Nova clínica
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleSubmit(onSubmit)}
          className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
          <p className="text-sm font-medium text-gray-300">Nova clínica</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <AdminInput label="Nome *" error={errors.name?.message} {...register('name')} />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">CNPJ</label>
              <Controller control={control} name="cnpj" render={({ field }) => (
                <IMaskInput mask="00.000.000/0000-00" value={field.value ?? ''} onAccept={(val: string) => field.onChange(val)}
                  placeholder="00.000.000/0001-00"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-600" />
              )} />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Telefone</label>
              <Controller control={control} name="phone" render={({ field }) => (
                <IMaskInput mask={[{ mask: '(00) 0000-0000' }, { mask: '(00) 00000-0000' }]}
                  value={field.value ?? ''} onAccept={(val: string) => field.onChange(val)}
                  placeholder="(11) 99999-9999"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-600" />
              )} />
            </div>
            <div className="col-span-2">
              <AdminInput label="E-mail" type="email" error={errors.email?.message} {...register('email')} />
            </div>
            <AdminInput label="Cidade" {...register('city')} />
            <div>
              <label className="block text-xs text-gray-400 mb-1">UF</label>
              <select {...register('state')}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">—</option>
                {BR_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors">Cancelar</button>
            <button type="submit" disabled={isSubmitting}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-40">
              {isSubmitting ? 'Criando...' : 'Criar clínica'}
            </button>
          </div>
        </form>
      )}

      {/* Clinic list */}
      <div className="space-y-2">
        {clinics.map(c => <ClinicRow key={c.id} clinic={c} />)}
        {!isLoading && clinics.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-8">Nenhuma clínica cadastrada. Crie a primeira acima.</p>
        )}
      </div>
    </div>
  )
}

// ─── Clinic Row (expandable) ──────────────────────────────────────────────────

function ClinicRow({ clinic }: { clinic: Clinic }) {
  const { profile } = useAuthContext()
  const [open,        setOpen]        = useState(false)
  const [editMode,    setEditMode]    = useState(false)
  const [showAddUser, setShowAddUser] = useState(false)

  const updateClinic = useUpdateClinic()
  const deleteClinic = useDeleteClinic()
  const enterClinic  = useEnterClinic()
  const inviteUser   = useInviteUser()
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function handleDelete() {
    try {
      await deleteClinic.mutateAsync(clinic.id)
      toast.success(`Clínica "${clinic.name}" removida.`)
    } catch (e: unknown) {
      toast.error((e as Error).message ?? 'Erro ao remover clínica')
    }
  }

  // Só carrega usuários quando a linha é expandida (evita cold start da edge function no load inicial)
  const { data: allUsers = [], isLoading: loadingUsers } = useAdminAuthUsers({ enabled: open })
  const clinicUsers = allUsers.filter(u => u.clinicId === clinic.id)

  // ── Edit clinic form ───────────────────────────────────────────────────────
  const editForm = useForm<ClinicForm>({
    resolver: zodResolver(clinicSchema),
    defaultValues: {
      name:  clinic.name,
      cnpj:  clinic.cnpj  ?? '',
      phone: clinic.phone ?? '',
      email: clinic.email ?? '',
      city:  clinic.city  ?? '',
      state: clinic.state ?? '',
    },
  })

  async function onEditSubmit(values: ClinicForm) {
    try {
      await updateClinic.mutateAsync({ id: clinic.id, ...values })
      toast.success('Clínica atualizada!')
      setEditMode(false)
    } catch (e: unknown) {
      toast.error((e as Error).message ?? 'Erro ao salvar')
    }
  }

  async function handleBillingOverride(enable: boolean) {
    const action = enable ? 'liberar' : 'bloquear'
    if (!confirm(`${action[0].toUpperCase()}${action.slice(1)} manualmente o módulo financeiro de "${clinic.name}"?`)) return
    try {
      await updateClinic.mutateAsync({
        id: clinic.id,
        billingOverrideEnabled: enable,
        ...(enable
          ? { subscriptionStatus: clinic.subscriptionStatus ?? 'ACTIVE' }
          : !clinic.asaasSubscriptionId
            ? { subscriptionStatus: 'INACTIVE' as const }
            : {}),
      })
      toast.success(enable ? 'Módulo financeiro liberado manualmente.' : 'Override manual removido.')
    } catch (e: unknown) {
      toast.error((e as Error).message ?? 'Erro ao atualizar override do financeiro')
    }
  }

  async function handleSetTier(tier: 'trial' | 'basic' | 'professional' | 'unlimited') {
    if (!confirm(`Alterar plano de "${clinic.name}" para ${TIER_LABELS[tier]}?`)) return
    try {
      await updateClinic.mutateAsync({
        id: clinic.id,
        subscriptionTier: tier,
        ...(tier !== 'trial' ? { subscriptionStatus: 'ACTIVE', paymentsEnabled: true } : {}),
      })
      toast.success(`Plano alterado para ${TIER_LABELS[tier]}.`)
    } catch (e: unknown) {
      toast.error((e as Error).message ?? 'Erro ao alterar plano')
    }
  }

  async function handleExtendTrial(days: number) {
    const newDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
    try {
      await updateClinic.mutateAsync({ id: clinic.id, trialEndsAt: newDate })
      toast.success(`Trial de "${clinic.name}" estendido por ${days} dias.`)
    } catch (e: unknown) {
      toast.error((e as Error).message ?? 'Erro ao estender trial')
    }
  }

  // ── Add user form (pre-filled with this clinicId) ──────────────────────────
  const addUserForm = useForm<CreateUserForm>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { role: 'admin', clinicId: clinic.id, isSuperAdmin: false },
  })

  async function onAddUserSubmit(values: CreateUserForm) {
    try {
      await inviteUser.mutateAsync({
        email: values.email,
        name: values.name,
        role: values.role,
        clinicId: clinic.id,
        isSuperAdmin: false,
      })
      toast.success(`Convite enviado para ${values.email}`)
      addUserForm.reset({ role: 'admin', clinicId: clinic.id, isSuperAdmin: false })
      setShowAddUser(false)
    } catch (e: unknown) {
      toast.error((e as Error).message ?? 'Erro ao enviar convite')
    }
  }

  // ── Enter clinic ───────────────────────────────────────────────────────────
  async function handleEnter() {
    if (!profile) return
    if (!confirm(`Entrar em "${clinic.name}" como admin? O app vai recarregar e você verá a clínica como um admin normal. Volte para /admin para sair.`)) return
    try {
      await enterClinic.mutateAsync({ userId: profile.id, clinicId: clinic.id })
    } catch (e: unknown) {
      toast.error((e as Error).message ?? 'Erro ao entrar na clínica')
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {/* Header row — always visible */}
      <div className="flex items-center justify-between px-4 py-3">
        <button className="flex-1 text-left" onClick={() => setOpen(v => !v)}>
          <div className="flex items-center gap-2">
            {open ? <CaretUp size={14} className="text-gray-500" /> : <CaretDown size={14} className="text-gray-500" />}
            <div>
              <p className="text-sm font-medium text-gray-100">{clinic.name}</p>
              <p className="text-[11px] text-gray-500 font-mono">{clinic.id}</p>
              {(clinic.city || clinic.state) && (
                <p className="text-xs text-gray-400">{[clinic.city, clinic.state].filter(Boolean).join(' — ')}</p>
              )}
            </div>
          </div>
        </button>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-gray-500">{open && !loadingUsers ? `${clinicUsers.length} usuário${clinicUsers.length !== 1 ? 's' : ''}` : '—'}</span>
          <button onClick={handleEnter} disabled={enterClinic.isPending}
            title="Entrar nesta clínica como admin (modo teste)"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-green-400 border border-green-700/50 hover:border-green-500 hover:text-green-300 rounded-lg transition-colors disabled:opacity-40">
            <SignIn size={13} /> Entrar
          </button>
          <button onClick={() => { navigator.clipboard.writeText(clinic.id); toast.success('ID copiado!') }}
            className="text-xs text-gray-500 hover:text-gray-300 border border-gray-700 rounded-lg px-2 py-1 transition-colors font-mono">
            copiar ID
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {open && (
        <div className="border-t border-gray-800 px-4 py-4 space-y-5">

          {/* Edit form */}
          {editMode ? (
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-3">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Editar clínica</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <AdminInput label="Nome *" error={editForm.formState.errors.name?.message} {...editForm.register('name')} />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">CNPJ</label>
                  <Controller control={editForm.control} name="cnpj" render={({ field }) => (
                    <IMaskInput mask="00.000.000/0000-00" value={field.value ?? ''} onAccept={(val: string) => field.onChange(val)}
                      placeholder="00.000.000/0001-00"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-600" />
                  )} />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Telefone</label>
                  <Controller control={editForm.control} name="phone" render={({ field }) => (
                    <IMaskInput mask={[{ mask: '(00) 0000-0000' }, { mask: '(00) 00000-0000' }]}
                      value={field.value ?? ''} onAccept={(val: string) => field.onChange(val)}
                      placeholder="(11) 99999-9999"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-600" />
                  )} />
                </div>
                <div className="col-span-2">
                  <AdminInput label="E-mail" type="email" error={editForm.formState.errors.email?.message} {...editForm.register('email')} />
                </div>
                <AdminInput label="Cidade" {...editForm.register('city')} />
                <div>
                  <label className="block text-xs text-gray-400 mb-1">UF</label>
                  <select {...editForm.register('state')}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">—</option>
                    {BR_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setEditMode(false)}
                  className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200">Cancelar</button>
                <button type="submit" disabled={editForm.formState.isSubmitting}
                  className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-40">
                  {editForm.formState.isSubmitting ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          ) : (
            <button onClick={() => setEditMode(true)}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors">
              <PencilSimple size={13} /> Editar dados da clínica
            </button>
          )}

          {/* Users list */}
          {clinicUsers.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Usuários</p>
              <div className="space-y-1.5">
                {clinicUsers.map(u => (
                  <div key={u.id} className="flex items-center justify-between px-3 py-2 bg-gray-800/60 rounded-lg">
                    <div>
                      <p className="text-sm text-gray-200">{u.name ?? '—'}</p>
                      <p className="text-xs text-gray-500">{u.email} · {u.roles?.map(r => USER_ROLE_LABELS[r]).join(' + ') ?? '—'}</p>
                    </div>
                    {!u.confirmed && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-400 border border-amber-700/40">pendente</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-indigo-800/60 bg-indigo-950/30 p-4 space-y-4">
            {/* Status line */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-xs font-medium text-indigo-300 uppercase tracking-wider mb-1">Assinatura</p>
                <p className="text-sm text-gray-300">
                  Status: <span className="font-medium text-white">{clinic.subscriptionStatus ?? 'sem assinatura'}</span>
                  {' · '}Tier: <span className="font-medium text-white">{TIER_LABELS[clinic.subscriptionTier] ?? 'trial'}</span>
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Financeiro: {clinic.paymentsEnabled ? 'liberado' : 'bloqueado'}
                  {clinic.billingOverrideEnabled ? ' (override manual)' : ''}
                  {clinic.trialEndsAt ? ` · trial até ${new Date(clinic.trialEndsAt).toLocaleDateString('pt-BR')}` : ''}
                </p>
              </div>
              <span className={`text-[10px] px-2 py-1 rounded-full border ${
                clinic.billingOverrideEnabled
                  ? 'border-emerald-700/60 bg-emerald-900/40 text-emerald-300'
                  : 'border-gray-700 bg-gray-800 text-gray-400'
              }`}>
                {clinic.billingOverrideEnabled ? 'override ativo' : 'sem override'}
              </span>
            </div>

            {/* Tier selector */}
            <div>
              <p className="text-xs text-gray-400 mb-2">Definir plano (sem Asaas):</p>
              <div className="flex flex-wrap gap-1.5">
                {(['trial', 'basic', 'professional', 'unlimited'] as const).map(tier => (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => handleSetTier(tier)}
                    disabled={updateClinic.isPending || clinic.subscriptionTier === tier}
                    className={`px-2.5 py-1 text-xs rounded-lg border transition-colors disabled:opacity-40 ${
                      clinic.subscriptionTier === tier
                        ? 'border-indigo-500 bg-indigo-800/60 text-indigo-200 cursor-default'
                        : 'border-gray-700 text-gray-400 hover:border-indigo-500 hover:text-indigo-300'
                    }`}
                  >
                    {TIER_LABELS[tier]}{tier !== 'trial' ? ` R$${TIER_PRICES[tier]}` : ''}
                    {tier !== 'trial' && TIER_LIMITS[tier] !== null ? ` /${TIER_LIMITS[tier]}` : ''}
                  </button>
                ))}
              </div>
            </div>

            {/* Trial extension */}
            <div>
              <p className="text-xs text-gray-400 mb-2">Estender trial:</p>
              <div className="flex flex-wrap gap-1.5">
                {[7, 14, 30].map(days => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => handleExtendTrial(days)}
                    disabled={updateClinic.isPending}
                    className="px-2.5 py-1 text-xs rounded-lg border border-gray-700 text-gray-400 hover:border-teal-500 hover:text-teal-300 transition-colors disabled:opacity-40"
                  >
                    +{days} dias
                  </button>
                ))}
              </div>
            </div>

            {/* Override toggle */}
            <div className="flex flex-wrap gap-2 pt-1 border-t border-indigo-800/40">
              {!clinic.billingOverrideEnabled ? (
                <button
                  type="button"
                  onClick={() => handleBillingOverride(true)}
                  disabled={updateClinic.isPending}
                  className="px-3 py-1.5 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40"
                >
                  Liberar financeiro (override)
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleBillingOverride(false)}
                  disabled={updateClinic.isPending}
                  className="px-3 py-1.5 text-xs rounded-lg bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-40"
                >
                  Remover override manual
                </button>
              )}
            </div>
          </div>

          {/* Delete clinic */}
          <div className="pt-2 border-t border-gray-800">
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-400 transition-colors"
              >
                <Trash size={13} /> Remover clínica
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-xs text-red-400">Remover "{clinic.name}"? Todos os dados serão perdidos.</span>
                <button type="button" onClick={handleDelete} disabled={deleteClinic.isPending}
                  className="text-xs font-semibold text-red-500 hover:text-red-400 disabled:opacity-40">
                  {deleteClinic.isPending ? 'Removendo...' : 'Confirmar'}
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)}
                  className="text-xs text-gray-500 hover:text-gray-300">Cancelar</button>
              </div>
            )}
          </div>

          {/* Add user */}
          {showAddUser ? (
            <form onSubmit={addUserForm.handleSubmit(onAddUserSubmit)} className="space-y-3">
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Convidar usuário</p>
                <p className="text-xs text-gray-500 mt-0.5">Um link de acesso será enviado por e-mail. O usuário define a própria senha.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <AdminInput label="Nome *" error={addUserForm.formState.errors.name?.message} {...addUserForm.register('name', { required: 'Obrigatório' })} />
                <AdminInput label="E-mail *" type="email" error={addUserForm.formState.errors.email?.message} {...addUserForm.register('email', { required: 'Obrigatório' })} />
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Papel</label>
                  <select {...addUserForm.register('role')}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {(['admin','receptionist','professional','patient'] as UserRole[]).map(r => (
                      <option key={r} value={r}>{USER_ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowAddUser(false)}
                  className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200">Cancelar</button>
                <button type="submit" disabled={addUserForm.formState.isSubmitting}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-40">
                  <Envelope size={13} />
                  {addUserForm.formState.isSubmitting ? 'Enviando...' : 'Enviar convite'}
                </button>
              </div>
            </form>
          ) : (
            <button onClick={() => setShowAddUser(true)}
              className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors">
              <Plus size={13} /> Convidar usuário para esta clínica
            </button>
          )}
        </div>
      )}
    </div>
  )
}
