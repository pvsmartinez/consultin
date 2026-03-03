/**
 * EquipePage
 *
 * Single entry-point for all team management:
 *  – Profissionais: clinical directory (specialty, council, availability, bank)
 *  – Acesso:  who can log in, with what role + permission overrides
 */
import { useState, useMemo } from 'react'
import { Plus, PencilSimple, ToggleRight, ToggleLeft, Envelope, Trash, Bank,
         PaperPlaneTilt, UserCircle, Check, X, SlidersHorizontal, Clock,
         EnvelopeSimple, UsersThree, UsersFour } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useProfessionals } from '../hooks/useProfessionals'
import { usePendingInvites, useCreateInvite, useDeleteInvite, useResendInviteEmail } from '../hooks/useInvites'
import ProfessionalModal from '../components/professionals/ProfessionalModal'
import ProfessionalBankAccountModal from '../components/professionals/ProfessionalBankAccountModal'
import { useClinic } from '../hooks/useClinic'
import { useClinicMembers, useUpdateMemberRole, useRemoveClinicMember, useClinicInvites, useResendInvite, useCancelInvite } from '../hooks/useClinic'
import type { ClinicInvite } from '../hooks/useClinic'
import { useAuthContext } from '../contexts/AuthContext'
import { USER_ROLE_LABELS, PERMISSION_LABELS, mergedPermissions } from '../types'
import type { Professional, UserRole, PermissionKey } from '../types'

type Tab = 'profissionais' | 'acesso'

const ROLE_COLORS: Record<UserRole, string> = {
  admin:         'bg-blue-100 text-blue-700',
  receptionist:  'bg-teal-100 text-teal-700',
  professional:  'bg-violet-100 text-violet-700',
  patient:       'bg-gray-100 text-gray-600',
}
const ASSIGNABLE_ROLES: UserRole[] = ['admin', 'receptionist', 'professional']
const ALL_PERMISSIONS = Object.keys(PERMISSION_LABELS) as PermissionKey[]

function computeOverrides(
  roles: UserRole[],
  desired: Record<string, boolean>,
): Partial<Record<string, boolean>> {
  const defs = mergedPermissions(roles)
  const overrides: Partial<Record<string, boolean>> = {}
  for (const key of ALL_PERMISSIONS) {
    if (desired[key] !== defs[key]) overrides[key] = desired[key]
  }
  return overrides
}

// ─── Profissionais tab ────────────────────────────────────────────────────────

function ProfissionaisTab() {
  const { data: professionals = [], isLoading, toggleActive } = useProfessionals()
  const { data: pendingInvites = [], isLoading: loadingInvites } = usePendingInvites()
  const { data: clinic } = useClinic()
  const createInvite = useCreateInvite()
  const deleteInvite = useDeleteInvite()
  const resendEmail  = useResendInviteEmail()

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing]     = useState<Professional | null>(null)
  const [bankPro, setBankPro]     = useState<Professional | null>(null)
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteEmail, setInviteEmail]       = useState('')
  const [inviteName, setInviteName]         = useState('')
  const [inviteRoles, setInviteRoles]       = useState<('professional' | 'receptionist' | 'admin')[]>(['professional'])

  function toggleInviteRole(role: 'professional' | 'receptionist' | 'admin') {
    setInviteRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role])
  }

  async function handleToggle(p: Professional) {
    try {
      await toggleActive.mutateAsync({ id: p.id, active: !p.active })
      toast.success(p.active ? 'Profissional desativado' : 'Profissional ativado')
    } catch { toast.error('Erro ao alterar status') }
  }

  async function handleSendInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    if (inviteRoles.length === 0) { toast.error('Selecione ao menos uma função.'); return }
    try {
      const result = await createInvite.mutateAsync({ email: inviteEmail.trim(), roles: inviteRoles, name: inviteName.trim() || undefined })
      if (result.emailSent) toast.success('Convite enviado por e-mail!')
      else if (result.emailReason === 'already_registered') toast.success('Convite criado. Usuário já tem conta.')
      else toast.success('Convite registrado')
      setInviteEmail(''); setInviteName(''); setInviteRoles(['professional']); setShowInviteForm(false)
    } catch { toast.error('Erro ao criar convite') }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">{professionals.length} cadastrado{professionals.length !== 1 ? 's' : ''}</p>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowInviteForm(v => !v)}
            className="flex items-center gap-2 px-4 py-2 border border-blue-200 text-blue-600 text-sm rounded-lg hover:bg-blue-50">
            <Envelope size={16} /> Convidar
          </button>
          <button onClick={() => { setEditing(null); setModalOpen(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
            <Plus size={16} /> Novo profissional
          </button>
        </div>
      </div>

      {showInviteForm && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
          <p className="text-sm font-medium text-blue-800 mb-3">Convidar para o sistema</p>
          <form onSubmit={handleSendInvite} className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs text-gray-500 mb-1">E-mail *</label>
              <input type="email" required value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                placeholder="profissional@clinica.com"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="block text-xs text-gray-500 mb-1">Nome (opcional)</label>
              <input type="text" value={inviteName} onChange={e => setInviteName(e.target.value)}
                placeholder="Dr. João Silva"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Funções</label>
              <div className="flex gap-4 items-center h-[38px]">
                {(['professional', 'receptionist', 'admin'] as const).map(r => (
                  <label key={r} className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input type="checkbox" checked={inviteRoles.includes(r)} onChange={() => toggleInviteRole(r)}
                      className="w-3.5 h-3.5 rounded accent-blue-600" />
                    <span className="text-sm text-gray-700">
                      {r === 'professional' ? 'Profissional' : r === 'receptionist' ? 'Atendente' : 'Admin'}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <button type="submit" disabled={createInvite.isPending}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {createInvite.isPending ? 'Enviando…' : 'Criar convite'}
            </button>
            <button type="button" onClick={() => setShowInviteForm(false)}
              className="px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">Cancelar</button>
          </form>
        </div>
      )}

      {isLoading ? (
        <div className="text-sm text-gray-400 py-8 text-center">Carregando...</div>
      ) : professionals.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 py-16 text-center">
          <p className="text-sm text-gray-400">Nenhum profissional cadastrado.</p>
          <button onClick={() => { setEditing(null); setModalOpen(true) }} className="mt-3 text-sm text-blue-600 hover:underline">Cadastrar o primeiro</button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-100">
          {professionals.map(p => (
            <div key={p.id} className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-4">
                <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 font-semibold text-sm">
                  {p.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">{p.name}</p>
                  <p className="text-xs text-gray-400">
                    {p.specialty ?? 'Especialidade não informada'}{p.councilId ? ` · ${p.councilId}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <span className={`text-xs px-2 py-0.5 rounded-full mr-2 ${p.active ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                  {p.active ? 'Ativo' : 'Inativo'}
                </span>
                <button onClick={() => { setEditing(p); setModalOpen(true) }} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg">
                  <PencilSimple size={16} />
                </button>
                <button onClick={() => handleToggle(p)} title={p.active ? 'Desativar' : 'Ativar'}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg">
                  {p.active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                </button>
                {clinic?.paymentsEnabled && (
                  <button onClick={() => setBankPro(p)} title="Conta bancária para repasse"
                    className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg">
                    <Bank size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loadingInvites && pendingInvites.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-600 mb-2">Convites pendentes ({pendingInvites.length})</h2>
          <div className="bg-white rounded-xl border border-dashed border-gray-200 divide-y divide-gray-100">
            {pendingInvites.map(inv => (
              <div key={inv.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm text-gray-700">{inv.email}</p>
                  <p className="text-xs text-gray-400">
                    {inv.roles?.map(r =>
                      <span key={r} className="text-xs font-medium">
                        {r === 'professional' ? 'Profissional' : r === 'receptionist' ? 'Atendente' : 'Admin'}
                      </span>
                    ).reduce<React.ReactNode[]>((acc, el, i) => i === 0 ? [el] : [...acc, ' / ', el], [])}
                    {inv.name ? ` · ${inv.name}` : ''}
                    {' · '}{new Date(inv.createdAt).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-yellow-50 text-yellow-600 rounded-full px-2 py-0.5">Aguardando</span>
                  <button onClick={() => resendEmail.mutate(inv.id)} disabled={resendEmail.isPending}
                    className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg disabled:opacity-40" title="Reenviar e-mail">
                    <PaperPlaneTilt size={15} />
                  </button>
                  <button onClick={() => deleteInvite.mutate(inv.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg" title="Cancelar convite">
                    <Trash size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ProfessionalModal open={modalOpen} onClose={() => setModalOpen(false)} professional={editing} />
      {bankPro && <ProfessionalBankAccountModal professional={bankPro} onClose={() => setBankPro(null)} />}
    </div>
  )
}

// ─── Acesso tab ───────────────────────────────────────────────────────────────

function AcessoTab() {
  const { profile } = useAuthContext()
  const { data: members = [], isLoading } = useClinicMembers()
  const updateRole   = useUpdateMemberRole()
  const removeMember = useRemoveClinicMember()
  const { data: invites = [] } = useClinicInvites()
  const resendInvite = useResendInvite()
  const cancelInvite = useCancelInvite()

  const [editingId,    setEditingId]    = useState<string | null>(null)
  const [pendingRoles, setPendingRoles] = useState<UserRole[]>(['professional'])
  const [pendingPerms, setPendingPerms] = useState<Record<string, boolean>>({})
  const [showPerms,    setShowPerms]    = useState(false)

  const effectivePermsForEdit = useMemo(() => mergedPermissions(pendingRoles, pendingPerms), [pendingRoles, pendingPerms])
  const roleDefaultsForEdit   = useMemo(() => mergedPermissions(pendingRoles), [pendingRoles])

  function openEdit(id: string, currentRoles: UserRole[], currentOverrides: Partial<Record<string, boolean>>) {
    setEditingId(id); setPendingRoles(currentRoles.length > 0 ? currentRoles : ['professional'])
    const effective = mergedPermissions(currentRoles.length > 0 ? currentRoles : ['professional'], currentOverrides)
    setPendingPerms(effective); setShowPerms(false)
  }

  function toggleRole(role: UserRole) {
    const next = pendingRoles.includes(role) ? pendingRoles.filter(r => r !== role) : [...pendingRoles, role]
    setPendingRoles(next)
    const newRoleDefaults = mergedPermissions(next)
    const newEffective = { ...newRoleDefaults }
    const currentOverrides = computeOverrides(pendingRoles, pendingPerms)
    for (const [k, v] of Object.entries(currentOverrides)) newEffective[k] = v as boolean
    setPendingPerms(newEffective)
  }

  async function saveRole(memberId: string) {
    if (pendingRoles.length === 0) { toast.error('Selecione ao menos uma função.'); return }
    try {
      await updateRole.mutateAsync({ memberId, roles: pendingRoles, permissionOverrides: computeOverrides(pendingRoles, pendingPerms) })
      toast.success('Permissões atualizadas!'); setEditingId(null)
    } catch (e: unknown) { toast.error((e as Error).message ?? 'Erro ao atualizar') }
  }

  async function handleRemove(memberId: string, memberName: string) {
    if (!confirm(`Remover "${memberName}" da clínica?`)) return
    try {
      await removeMember.mutateAsync(memberId)
      toast.success(`${memberName} removido(a)!`)
      if (editingId === memberId) setEditingId(null)
    } catch (e: unknown) { toast.error((e as Error).message ?? 'Erro') }
  }

  if (isLoading) return <p className="text-sm text-gray-400 py-6 text-center">Carregando membros…</p>

  const others = members.filter(m => m.id !== profile?.id)
  const me     = members.find(m => m.id === profile?.id)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">
          {members.length} membro{members.length !== 1 ? 's' : ''}
          {invites.length > 0 && <span className="text-amber-500 ml-1.5">· {invites.length} convite{invites.length !== 1 ? 's' : ''} pendente{invites.length !== 1 ? 's' : ''}</span>}
        </p>
      </div>

      <div className="space-y-2">
        {me && (
          <div className="flex items-center justify-between px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl">
            <div className="flex items-center gap-3">
              <UserCircle size={20} className="text-blue-500 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-800">{me.name} <span className="text-xs text-blue-500">(você)</span></p>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {me.roles.map(r => (
                    <span key={r} className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[r]}`}>{USER_ROLE_LABELS[r]}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {others.map(m => {
          const isEditing     = editingId === m.id
          const hasOverrides  = Object.keys(m.permissionOverrides).length > 0
          const overrideCount = computeOverrides(m.roles, mergedPermissions(m.roles, m.permissionOverrides))

          return (
            <div key={m.id} className={`border rounded-xl transition-colors ${isEditing ? 'bg-gray-50 border-gray-300' : 'bg-white border-gray-200 hover:border-gray-300'}`}>
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <UserCircle size={20} className="text-gray-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{m.name}</p>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {(isEditing ? pendingRoles : m.roles).map(r => (
                        <span key={r} className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${isEditing ? 'bg-gray-200 text-gray-600' : ROLE_COLORS[r]}`}>
                          {USER_ROLE_LABELS[r]}
                        </span>
                      ))}
                      {!isEditing && hasOverrides && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 font-medium">
                          {Object.keys(overrideCount).length} personalizado{Object.keys(overrideCount).length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {isEditing ? (
                    <>
                      <div className="flex items-center gap-3 mr-1">
                        {ASSIGNABLE_ROLES.map(r => (
                          <label key={r} className="flex items-center gap-1.5 cursor-pointer select-none">
                            <input type="checkbox" checked={pendingRoles.includes(r)} onChange={() => toggleRole(r)}
                              className="w-3.5 h-3.5 rounded accent-blue-600" />
                            <span className="text-xs text-gray-600">{USER_ROLE_LABELS[r]}</span>
                          </label>
                        ))}
                      </div>
                      <button onClick={() => setShowPerms(v => !v)}
                        className={`p-1.5 border rounded-lg transition-colors ${showPerms ? 'text-blue-600 border-blue-300 bg-blue-50' : 'text-gray-400 border-gray-200'}`}
                        title="Personalizar permissões">
                        <SlidersHorizontal size={14} />
                      </button>
                      <button onClick={() => saveRole(m.id)} disabled={updateRole.isPending || pendingRoles.length === 0}
                        className="p-1.5 text-green-600 border border-green-200 rounded-lg disabled:opacity-40">
                        <Check size={14} />
                      </button>
                      <button onClick={() => setEditingId(null)} className="p-1.5 text-gray-400 border border-gray-200 rounded-lg">
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => openEdit(m.id, m.roles, m.permissionOverrides)}
                        className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-2.5 py-1.5 transition-colors">
                        Editar acesso
                      </button>
                      <button onClick={() => handleRemove(m.id, m.name)} disabled={removeMember.isPending}
                        className="p-1.5 text-red-400 hover:text-red-600 border border-red-100 hover:border-red-300 rounded-lg">
                        <Trash size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {isEditing && showPerms && (
                <div className="px-4 pb-4 border-t border-gray-200 pt-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2.5">
                    Permissões individuais <span className="text-gray-400 font-normal normal-case">— sobrepõem a função</span>
                  </p>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {ALL_PERMISSIONS.map(key => {
                      const effective    = effectivePermsForEdit[key]
                      const isCustomized = effective !== roleDefaultsForEdit[key]
                      return (
                        <label key={key} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer border transition-colors ${isCustomized ? 'border-orange-200 bg-orange-50' : 'border-gray-100 bg-white hover:border-gray-200'}`}>
                          <input type="checkbox" checked={!!effective} onChange={() => setPendingPerms(prev => ({ ...prev, [key]: !prev[key] }))}
                            className="w-3.5 h-3.5 rounded accent-blue-600 flex-shrink-0" />
                          <span className="text-sm text-gray-700 flex-1">{PERMISSION_LABELS[key]}</span>
                          {isCustomized && <span className="text-[10px] text-orange-500 font-medium">{effective ? 'liberado' : 'bloqueado'}</span>}
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {others.length === 0 && invites.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-6">Nenhum outro membro nesta clínica ainda.</p>
        )}

        {invites.length > 0 && (
          <>
            <div className="pt-2 pb-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                <Clock size={12} /> Convites pendentes ({invites.length})
              </p>
            </div>
            {invites.map(inv => (
              <div key={inv.id} className="flex items-center justify-between px-4 py-3 bg-amber-50 border border-amber-100 rounded-xl">
                <div className="flex items-center gap-3 min-w-0">
                  <UserCircle size={20} className="text-amber-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      {inv.name ?? inv.email}
                      {inv.name && <span className="text-xs text-gray-400 ml-1.5">{inv.email}</span>}
                    </p>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[inv.role as UserRole] ?? 'bg-gray-100 text-gray-500'}`}>
                      {USER_ROLE_LABELS[inv.role as UserRole] ?? inv.role}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => resendInvite.mutate((inv as ClinicInvite).id)} disabled={resendInvite.isPending}
                    className="flex items-center gap-1.5 text-xs text-blue-600 border border-blue-200 rounded-lg px-2.5 py-1.5 disabled:opacity-40">
                    <EnvelopeSimple size={13} /> Reenviar
                  </button>
                  <button onClick={() => cancelInvite.mutate((inv as ClinicInvite).id)} disabled={cancelInvite.isPending}
                    className="p-1.5 text-red-400 hover:text-red-600 border border-red-100 rounded-lg">
                    <Trash size={14} />
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

// ─── EquipePage ───────────────────────────────────────────────────────────────

export default function EquipePage() {
  const [tab, setTab] = useState<Tab>('profissionais')

  const tabs: { id: Tab; label: string; icon: typeof UsersThree }[] = [
    { id: 'profissionais', label: 'Profissionais', icon: UsersFour },
    { id: 'acesso',        label: 'Acesso ao sistema', icon: UsersThree },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-800">Equipe</h1>
        <p className="text-sm text-gray-400 mt-0.5">Gerencie profissionais e acessos ao sistema</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 gap-1">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.id
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            <t.icon size={16} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'profissionais' && <ProfissionaisTab />}
      {tab === 'acesso'        && <AcessoTab />}
    </div>
  )
}
