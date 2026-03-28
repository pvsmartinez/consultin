import { useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  MagnifyingGlass, Plus, ArrowClockwise, Envelope, PencilSimple,
  Key, Trash, Eye, EyeSlash, Check, X,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
  useAdminAuthUsers, useAdminClinics, useUpsertProfile, useInviteUser,
  useDeleteAuthUser, useResetUserPassword, useResendInvite,
  type AdminAuthUser,
} from '../../hooks/useAdmin'
import { USER_ROLE_LABELS } from '../../types'
import type { UserRole } from '../../types'
import AdminInput from './AdminInput'
import { profileSchema, createUserSchema } from './types'
import type { ProfileForm, CreateUserForm } from './types'

// ─── Users Tab ────────────────────────────────────────────────────────────────

export default function UsersTab() {
  const { data: users = [], isLoading, refetch, isFetching } = useAdminAuthUsers()
  const { data: clinics = [] } = useAdminClinics()
  const upsertProfile  = useUpsertProfile()
  const inviteUser     = useInviteUser()
  const deleteUser     = useDeleteAuthUser()
  const resetPassword  = useResetUserPassword()
  const resendInvite   = useResendInvite()

  const [search,       setSearch]       = useState('')
  const [showCreate,   setShowCreate]   = useState(false)
  const [editingUser,  setEditingUser]  = useState<AdminAuthUser | null>(null)
  const [resetTarget,  setResetTarget]  = useState<AdminAuthUser | null>(null)
  const [newPassword,  setNewPassword]  = useState('')
  const [showNewPwd,   setShowNewPwd]   = useState(false)

  // ── Create user form ───────────────────────────────────────────────────────
  const createForm = useForm<CreateUserForm>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { role: 'admin', clinicId: null, isSuperAdmin: false },
  })
  const isSuperCreate = createForm.watch('isSuperAdmin')

  async function onCreateSubmit(values: CreateUserForm) {
    try {
      await inviteUser.mutateAsync({
        email:        values.email,
        name:         values.name,
        role:         values.role,
        clinicId:     values.clinicId,
        isSuperAdmin: values.isSuperAdmin,
      })
      toast.success(`Convite enviado para ${values.email}`)
      createForm.reset({ role: 'admin', clinicId: null, isSuperAdmin: false })
      setShowCreate(false)
    } catch (e: unknown) {
      toast.error((e as Error).message ?? 'Erro ao enviar convite')
    }
  }

  // ── Edit profile form ──────────────────────────────────────────────────────
  const editForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { role: 'admin', clinicId: null, isSuperAdmin: false },
  })
  const isSuperEdit = editForm.watch('isSuperAdmin')

  function openEdit(u: AdminAuthUser) {
    setEditingUser(u)
    editForm.reset({
      id:           u.id,
      name:         u.name ?? '',
      role:         u.roles?.[0] ?? 'admin',
      clinicId:     u.clinicId,
      isSuperAdmin: u.isSuperAdmin,
    })
  }

  async function onEditSubmit(values: ProfileForm) {
    try {
      await upsertProfile.mutateAsync({ ...values, roles: [values.role] })
      toast.success('Perfil atualizado!')
      setEditingUser(null)
      refetch()
    } catch (e: unknown) {
      toast.error((e as Error).message ?? 'Erro ao salvar perfil')
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function handleDelete(u: AdminAuthUser) {
    if (!confirm(`Remover ${u.email}? Esta ação não pode ser desfeita.`)) return
    try {
      await deleteUser.mutateAsync(u.id)
      toast.success('Usuário removido')
      if (editingUser?.id === u.id) setEditingUser(null)
    } catch (e: unknown) {
      toast.error((e as Error).message ?? 'Erro ao remover usuário')
    }
  }

  // ── Password reset ─────────────────────────────────────────────────────────
  async function handleResetPassword() {
    if (!resetTarget || newPassword.length < 6) return
    try {
      await resetPassword.mutateAsync({ userId: resetTarget.id, password: newPassword })
      toast.success('Senha atualizada!')
      setResetTarget(null)
      setNewPassword('')
    } catch (e: unknown) {
      toast.error((e as Error).message ?? 'Erro ao resetar senha')
    }
  }

  // ── Filtered list ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return users
    return users.filter(u =>
      u.email.toLowerCase().includes(q) ||
      (u.name ?? '').toLowerCase().includes(q) ||
      (u.clinicName ?? '').toLowerCase().includes(q)
    )
  }, [users, search])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-300">
          {isLoading ? 'Carregando...' : `${users.length} usuário${users.length !== 1 ? 's' : ''}`}
        </h2>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} disabled={isFetching}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 border border-gray-700 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-40">
            <ArrowClockwise size={13} className={isFetching ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => { setShowCreate(v => !v); setEditingUser(null) }}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors">
            <Plus size={14} /> Novo usuário
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nome, e-mail ou clínica…"
          className="w-full bg-gray-900 border border-gray-700 rounded-xl pl-8 pr-4 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Create form */}
      {showCreate && (
        <form onSubmit={createForm.handleSubmit(onCreateSubmit)}
          className="bg-gray-900 border border-blue-700/40 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-200">Novo usuário</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <AdminInput label="E-mail *" type="email" placeholder="usuario@clinica.com"
                error={createForm.formState.errors.email?.message}
                {...createForm.register('email')} />
            </div>
            <div className="col-span-2">
              <AdminInput label="Nome completo *" placeholder="João da Silva"
                error={createForm.formState.errors.name?.message}
                {...createForm.register('name')} />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Função</label>
              <select {...createForm.register('role')}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                {(Object.entries(USER_ROLE_LABELS) as [UserRole, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Clínica</label>
              <select
                value={createForm.watch('clinicId') ?? ''}
                onChange={e => createForm.setValue('clinicId', e.target.value || null)}
                disabled={isSuperCreate}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40">
                <option value="">— sem clínica —</option>
                {clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input type="checkbox" className="rounded" {...createForm.register('isSuperAdmin')} />
            Super admin (acesso total a todas as clínicas)
          </label>

          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowCreate(false)}
              className="flex items-center gap-1 px-4 py-2 text-sm text-gray-400 hover:text-gray-200">
              <X size={14} /> Cancelar
            </button>
            <button type="submit" disabled={createForm.formState.isSubmitting}
              className="flex items-center gap-1 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-40">
              <Envelope size={14} />
              {createForm.formState.isSubmitting ? 'Enviando...' : 'Enviar convite'}
            </button>
          </div>
        </form>
      )}

      {/* Password reset inline */}
      {resetTarget && (
        <div className="bg-gray-900 border border-amber-700/40 rounded-xl p-5 space-y-3">
          <p className="text-sm font-medium text-gray-200">
            Redefinir senha — <span className="text-amber-400">{resetTarget.email}</span>
          </p>
          <div className="relative">
            <input type={showNewPwd ? 'text' : 'password'}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Nova senha (mínimo 6 caracteres)"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 pr-10 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500 placeholder:text-gray-600" />
            <button type="button" onClick={() => setShowNewPwd(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
              {showNewPwd ? <EyeSlash size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setResetTarget(null); setNewPassword('') }}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200">
              <X size={14} /> Cancelar
            </button>
            <button
              onClick={handleResetPassword}
              disabled={newPassword.length < 6 || resetPassword.isPending}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-amber-600 hover:bg-amber-500 text-white rounded-lg disabled:opacity-40">
              <Key size={14} /> {resetPassword.isPending ? 'Salvando...' : 'Redefinir senha'}
            </button>
          </div>
        </div>
      )}

      {/* Edit profile form */}
      {editingUser && (
        <form onSubmit={editForm.handleSubmit(onEditSubmit)}
          className="bg-gray-900 border border-gray-600 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-200">Editar acesso</p>
              <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                <Envelope size={11} /> {editingUser.email}
              </p>
            </div>
            <button type="button" onClick={() => setEditingUser(null)}
              className="text-gray-500 hover:text-gray-300">
              <X size={16} />
            </button>
          </div>

          <AdminInput label="Nome *" error={editForm.formState.errors.name?.message}
            {...editForm.register('name')} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Função</label>
              <select {...editForm.register('role')}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                {(Object.entries(USER_ROLE_LABELS) as [UserRole, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Clínica</label>
              <select
                value={editForm.watch('clinicId') ?? ''}
                onChange={e => editForm.setValue('clinicId', e.target.value || null)}
                disabled={isSuperEdit}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40">
                <option value="">— sem clínica —</option>
                {clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input type="checkbox" className="rounded" {...editForm.register('isSuperAdmin')} />
            Super admin (acesso total a todas as clínicas)
          </label>

          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <button type="button"
                onClick={() => { setResetTarget(editingUser); setEditingUser(null) }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-amber-400 hover:text-amber-300 border border-amber-700/50 hover:border-amber-600 rounded-lg transition-colors">
                <Key size={13} /> Redefinir senha
              </button>
              <button type="button"
                onClick={() => handleDelete(editingUser)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400 hover:text-red-300 border border-red-700/50 hover:border-red-600 rounded-lg transition-colors">
                <Trash size={13} /> Remover conta
              </button>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setEditingUser(null)}
                className="flex items-center gap-1 px-4 py-2 text-sm text-gray-400 hover:text-gray-200">
                <X size={14} /> Cancelar
              </button>
              <button type="submit" disabled={editForm.formState.isSubmitting}
                className="flex items-center gap-1 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-40">
                <Check size={14} /> {editForm.formState.isSubmitting ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Users list */}
      <div className="space-y-2">
        {isLoading && (
          <p className="text-sm text-gray-500 text-center py-8">Carregando usuários…</p>
        )}
        {!isLoading && filtered.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-8">
            {search ? 'Nenhum resultado.' : 'Nenhum usuário encontrado.'}
          </p>
        )}
        {filtered.map(u => (
          <div key={u.id}
            className={`flex items-center justify-between px-4 py-3 bg-gray-900 border rounded-xl transition-colors ${
              editingUser?.id === u.id ? 'border-blue-600/60' : 'border-gray-800 hover:border-gray-700'
            }`}>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium text-gray-100 truncate">
                  {u.name ?? <span className="italic text-gray-500">sem nome</span>}
                </p>
                {u.isSuperAdmin && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded font-medium whitespace-nowrap">super admin</span>
                )}
                {u.roles && u.roles.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-gray-800 text-gray-400 rounded whitespace-nowrap">
                    {u.roles.map(r => USER_ROLE_LABELS[r]).join(' + ')}
                  </span>
                )}
                {!u.confirmed && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-orange-900/40 text-orange-400 rounded border border-orange-700/40 whitespace-nowrap">
                    aguardando confirmação
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                <Envelope size={10} /> {u.email}
              </p>
              {u.clinicName && (
                <p className="text-xs text-gray-600 mt-0.5">🏥 {u.clinicName}</p>
              )}
              {!u.hasProfile && (
                <p className="text-[10px] text-amber-600 mt-0.5">⚠️ sem perfil atribuído</p>
              )}
            </div>
            <button onClick={() => openEdit(u)}
              className="ml-4 flex-shrink-0 text-gray-500 hover:text-gray-300 border border-gray-700 rounded-lg p-1.5 transition-colors">
              <PencilSimple size={14} />
            </button>
            {!u.confirmed && (
              <button
                onClick={async () => {
                  try {
                    await resendInvite.mutateAsync(u.id)
                    toast.success(`Convite reenviado para ${u.email}`)
                  } catch (e: unknown) {
                    toast.error((e as Error).message ?? 'Erro ao reenviar convite')
                  }
                }}
                disabled={resendInvite.isPending}
                title="Reenviar convite"
                className="flex-shrink-0 flex items-center gap-1 px-2 py-1.5 text-xs text-orange-400 hover:text-orange-300 border border-orange-700/50 hover:border-orange-600 rounded-lg transition-colors disabled:opacity-40">
                <Envelope size={13} /> Reenviar
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
