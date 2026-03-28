import { useState, useMemo } from 'react'
import { UserCircle, Trash, Check, X, SlidersHorizontal, Clock, EnvelopeSimple } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useClinicMembers, useUpdateMemberRole, useRemoveClinicMember, useClinicInvites, useResendInvite, useCancelInvite } from '../../hooks/useClinic'
import type { ClinicInvite } from '../../hooks/useClinic'
import { useAuthContext } from '../../contexts/AuthContext'
import {
  USER_ROLE_LABELS,
  PERMISSION_LABELS,
  mergedPermissions,
} from '../../types'
import type { UserRole, PermissionKey } from '../../types'

const ROLE_COLORS: Record<UserRole, string> = {
  admin:          'bg-teal-100 text-teal-700',
  receptionist:   'bg-teal-100 text-teal-700',
  professional:   'bg-violet-100 text-violet-700',
  patient:        'bg-gray-100 text-gray-600',
}

const ASSIGNABLE_ROLES: UserRole[] = ['admin', 'receptionist', 'professional']
const ALL_PERMISSIONS = Object.keys(PERMISSION_LABELS) as PermissionKey[]

/** Computes which permission_overrides are needed to produce the desired effective permissions */
function computeOverrides(
  roles: UserRole[],
  desired: Record<string, boolean>,
): Partial<Record<string, boolean>> {
  const roleDefaults = mergedPermissions(roles)
  const overrides: Partial<Record<string, boolean>> = {}
  for (const key of ALL_PERMISSIONS) {
    if (desired[key] !== roleDefaults[key]) {
      overrides[key] = desired[key]
    }
  }
  return overrides
}

export default function UsuariosTab() {
  const { profile } = useAuthContext()
  const { data: members = [], isLoading } = useClinicMembers()
  const updateRole    = useUpdateMemberRole()
  const removeMember  = useRemoveClinicMember()
  const { data: invites = [] } = useClinicInvites()
  const resendInvite  = useResendInvite()
  const cancelInvite  = useCancelInvite()

  const [editingId,      setEditingId]      = useState<string | null>(null)
  const [pendingRoles,   setPendingRoles]   = useState<UserRole[]>(['professional'])
  const [pendingPerms,   setPendingPerms]   = useState<Record<string, boolean>>({})
  const [showPerms,      setShowPerms]      = useState(false)

  // When roles change in edit mode, recalculate effective perms (preserving manual overrides)
  const effectivePermsForEdit = useMemo(
    () => mergedPermissions(pendingRoles, pendingPerms),
    [pendingRoles, pendingPerms]
  )

  // Role defaults without any overrides — to show "customized" badge
  const roleDefaultsForEdit = useMemo(
    () => mergedPermissions(pendingRoles),
    [pendingRoles]
  )

  function openEdit(id: string, currentRoles: UserRole[], currentOverrides: Partial<Record<string, boolean>>) {
    setEditingId(id)
    setPendingRoles(currentRoles.length > 0 ? currentRoles : ['professional'])
    // Start with merged effective permissions so toggles show current reality
    const effective = mergedPermissions(currentRoles.length > 0 ? currentRoles : ['professional'], currentOverrides)
    setPendingPerms(effective)
    setShowPerms(false)
  }

  function toggleRole(role: UserRole) {
    const next = pendingRoles.includes(role)
      ? pendingRoles.filter(r => r !== role)
      : [...pendingRoles, role]
    setPendingRoles(next)
    // Recalculate effective: apply current manual overrides against new role defaults
    const newRoleDefaults = mergedPermissions(next)
    const newEffective = { ...newRoleDefaults }
    // Re-apply any explicit overrides the admin had set
    const currentOverrides = computeOverrides(pendingRoles, pendingPerms)
    for (const [k, v] of Object.entries(currentOverrides)) {
      newEffective[k] = v as boolean
    }
    setPendingPerms(newEffective)
  }

  function togglePerm(key: PermissionKey) {
    setPendingPerms(prev => ({ ...prev, [key]: !prev[key] }))
  }

  async function saveRole(memberId: string) {
    if (pendingRoles.length === 0) {
      toast.error('Selecione ao menos uma função.')
      return
    }
    const overrides = computeOverrides(pendingRoles, pendingPerms)
    try {
      await updateRole.mutateAsync({ memberId, roles: pendingRoles, permissionOverrides: overrides })
      toast.success('Permissões atualizadas!')
      setEditingId(null)
    } catch (e: unknown) {
      toast.error((e as Error).message ?? 'Erro ao atualizar permissões')
    }
  }

  async function handleRemove(memberId: string, memberName: string) {
    if (!confirm(`Remover "${memberName}" da clínica? O acesso será revogado imediatamente.`)) return
    try {
      await removeMember.mutateAsync(memberId)
      toast.success(`${memberName} removido(a)!`)
      if (editingId === memberId) setEditingId(null)
    } catch (e: unknown) {
      toast.error((e as Error).message ?? 'Erro ao remover membro')
    }
  }

  async function handleResend(invite: ClinicInvite) {
    try {
      await resendInvite.mutateAsync(invite.id)
      toast.success(`Convite reenviado para ${invite.email}!`)
    } catch (e: unknown) {
      toast.error((e as Error).message ?? 'Erro ao reenviar convite')
    }
  }

  async function handleCancelInvite(invite: ClinicInvite) {
    if (!confirm(`Cancelar convite para "${invite.email}"?`)) return
    try {
      await cancelInvite.mutateAsync(invite.id)
      toast.success('Convite cancelado.')
    } catch (e: unknown) {
      toast.error((e as Error).message ?? 'Erro ao cancelar convite')
    }
  }


  if (isLoading) {
    return <p className="text-sm text-gray-400 py-6 text-center">Carregando membros…</p>
  }

  const others = members.filter(m => m.id !== profile?.id)
  const me     = members.find(m => m.id === profile?.id)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-700">
          {members.length} membro{members.length !== 1 ? 's' : ''} nesta clínica
          {invites.length > 0 && (
            <span className="text-amber-500 ml-1.5">
              · {invites.length} convite{invites.length !== 1 ? 's' : ''} pendente{invites.length !== 1 ? 's' : ''}
            </span>
          )}
        </h2>
        <p className="text-xs text-gray-400">
          Para convidar novos membros, use a opção de convite por e-mail.
        </p>
      </div>

      <div className="space-y-2">
        {/* Current user row */}
        {me && (
          <div className="flex items-center justify-between px-4 py-3 bg-teal-50 border border-teal-100 rounded-xl">
            <div className="flex items-center gap-3 min-w-0">
              <UserCircle size={20} className="text-[#0ea5b0] flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-800">{me.name} <span className="text-xs text-[#0ea5b0]">(você)</span></p>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {me.roles.map(r => (
                    <span key={r} className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[r]}`}>
                      {USER_ROLE_LABELS[r]}
                    </span>
                  ))}
                  {Object.keys(me.permissionOverrides).length > 0 && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-orange-50 text-orange-600">
                      personalizado
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Other members */}
        {others.map(m => {
          const isEditing = editingId === m.id
          const hasOverrides = Object.keys(m.permissionOverrides).length > 0
          const overrideCount = computeOverrides(m.roles, mergedPermissions(m.roles, m.permissionOverrides))

          return (
            <div key={m.id}
              className={`border rounded-xl transition-colors ${
                isEditing ? 'bg-gray-50 border-gray-300' : 'bg-white border-gray-200 hover:border-gray-300'
              }`}>

              {/* Header row */}
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <UserCircle size={20} className="text-gray-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{m.name}</p>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {(isEditing ? pendingRoles : m.roles).map(r => (
                        <span key={r} className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                          isEditing ? 'bg-gray-200 text-gray-600' : ROLE_COLORS[r]
                        }`}>
                          {USER_ROLE_LABELS[r]}
                        </span>
                      ))}
                      {!isEditing && hasOverrides && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-orange-50 text-orange-600">
                          {Object.keys(overrideCount).length} personalizado{Object.keys(overrideCount).length !== 1 ? 's' : ''}
                        </span>
                      )}
                      {isEditing && pendingRoles.length === 0 && (
                        <span className="text-[11px] text-red-400">Selecione ao menos uma</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {isEditing ? (
                    <>
                      {/* Role checkboxes */}
                      <div className="flex items-center gap-3 mr-1">
                        {ASSIGNABLE_ROLES.map(r => (
                          <label key={r} className="flex items-center gap-1.5 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={pendingRoles.includes(r)}
                              onChange={() => toggleRole(r)}
                              className="w-3.5 h-3.5 rounded accent-blue-600"
                            />
                            <span className="text-xs text-gray-600">{USER_ROLE_LABELS[r]}</span>
                          </label>
                        ))}
                      </div>
                      {/* Toggle permissions panel */}
                      <button
                        onClick={() => setShowPerms(v => !v)}
                        className={`p-1.5 border rounded-lg transition-colors ${
                          showPerms
                            ? 'text-[#006970] border-teal-300 bg-teal-50'
                            : 'text-gray-400 hover:text-gray-600 border-gray-200'
                        }`}
                        title="Personalizar permissões">
                        <SlidersHorizontal size={14} />
                      </button>
                      <button onClick={() => saveRole(m.id)} disabled={updateRole.isPending || pendingRoles.length === 0}
                        className="p-1.5 text-green-600 hover:text-green-700 border border-green-200 rounded-lg transition-colors disabled:opacity-40">
                        <Check size={14} />
                      </button>
                      <button onClick={() => setEditingId(null)}
                        className="p-1.5 text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg transition-colors">
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
                        className="p-1.5 text-red-400 hover:text-red-600 border border-red-100 hover:border-red-300 rounded-lg transition-colors">
                        <Trash size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Permissions panel (shown while editing) */}
              {isEditing && showPerms && (
                <div className="px-4 pb-4 border-t border-gray-200 mt-0 pt-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2.5">
                    Permissões individuais — <span className="text-gray-400 font-normal normal-case">sobrepõem a função</span>
                  </p>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {ALL_PERMISSIONS.map(key => {
                      const effective = effectivePermsForEdit[key]
                      const isCustomized = effective !== roleDefaultsForEdit[key]
                      return (
                        <label
                          key={key}
                          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer select-none border transition-colors ${
                            isCustomized
                              ? 'border-orange-200 bg-orange-50'
                              : 'border-gray-100 bg-white hover:border-gray-200'
                          }`}>
                          <input
                            type="checkbox"
                            checked={!!effective}
                            onChange={() => togglePerm(key)}
                            className="w-3.5 h-3.5 rounded accent-blue-600 flex-shrink-0"
                          />
                          <span className="text-sm text-gray-700 flex-1">{PERMISSION_LABELS[key]}</span>
                          {isCustomized && (
                            <span className="text-[10px] text-orange-500 font-medium flex-shrink-0">
                              {effective
                                ? 'liberado'
                                : 'bloqueado'}
                            </span>
                          )}
                        </label>
                      )
                    })}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-2">
                    Permissões em laranja diferem do padrão da função selecionada.
                    Alterar as funções acima pode redefinir as permissões.
                  </p>
                </div>
              )}
            </div>
          )
        })}

        {others.length === 0 && invites.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-6">
            Nenhum outro membro nesta clínica ainda.
          </p>
        )}

        {/* Pending invites */}
        {invites.length > 0 && (
          <>
            <div className="pt-2 pb-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                <Clock size={12} />
                Convites pendentes ({invites.length})
              </p>
            </div>
            {invites.map(inv => (
              <div key={inv.id}
                className="flex items-center justify-between px-4 py-3 bg-amber-50 border border-amber-100 rounded-xl">
                <div className="flex items-center gap-3 min-w-0">
                  <UserCircle size={20} className="text-amber-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      {inv.name ?? inv.email}
                      {inv.name && <span className="text-xs text-gray-400 ml-1.5">{inv.email}</span>}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[inv.role as UserRole] ?? 'bg-gray-100 text-gray-500'}`}>
                        {USER_ROLE_LABELS[inv.role as UserRole] ?? inv.role}
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-600 flex items-center gap-0.5">
                        <Clock size={10} />
                        Aguardando confirmação
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleResend(inv)}
                    disabled={resendInvite.isPending}
                    className="flex items-center gap-1.5 text-xs text-[#006970] hover:text-[#004f55] border border-teal-200 hover:border-teal-300 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-40">
                    <EnvelopeSimple size={13} />
                    Reenviar
                  </button>
                  <button
                    onClick={() => handleCancelInvite(inv)}
                    disabled={cancelInvite.isPending}
                    className="p-1.5 text-red-400 hover:text-red-600 border border-red-100 hover:border-red-300 rounded-lg transition-colors">
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

