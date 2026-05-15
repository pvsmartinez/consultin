/**
 * EquipePage
 *
 * Single entry-point for all team management:
 *  – Profissionais: clinical directory (specialty, council, availability, bank)
 *  – Acesso:  who can log in, with what role + permission overrides
 */
import { useState } from 'react'
import { Plus, PencilSimple, ToggleRight, ToggleLeft, Envelope, Trash, Bank,
         PaperPlaneTilt, UsersThree, UsersFour, Sliders } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useProfessionals } from '../hooks/useProfessionals'
import { usePendingInvites, useCreateInvite, useDeleteInvite, useResendInviteEmail } from '../hooks/useInvites'
import ProfessionalModal from '../components/professionals/ProfessionalModal'
import ProfessionalBankAccountModal from '../components/professionals/ProfessionalBankAccountModal'
import { useClinic } from '../hooks/useClinic'
import { useAuthContext } from '../contexts/AuthContext'
import type { Professional } from '../types'
import { buildSettingsPath } from '../lib/settingsNavigation'
import UsuariosTab from './settings/UsuariosTab'

type Tab = 'profissionais' | 'acesso'

// ─── Profissionais tab ────────────────────────────────────────────────────────

function ProfissionaisTab() {
  const { data: professionals = [], isLoading, toggleActive, create: createProfessional } = useProfessionals()
  const { data: pendingInvites = [], isLoading: loadingInvites } = usePendingInvites()
  const { data: clinic } = useClinic()
  const { profile } = useAuthContext()
  const createInvite = useCreateInvite()
  const deleteInvite = useDeleteInvite()
  const resendEmail  = useResendInviteEmail()

  const ownerLinked = professionals.some(p => p.userId === profile?.id)

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

  async function handleAddSelfAsProfessional() {
    try {
      await createProfessional.mutateAsync({
        name:         profile?.name ?? '',
        specialty:    null,
        councilId:    null,
        phone:        null,
        email:        null,
        active:       true,
        customFields: {},
        userId:       profile?.id ?? null,
      })
      toast.success('Você foi adicionado como profissional!')
    } catch {
      toast.error('Erro ao adicionar como profissional')
    }
  }

  return (
    <div className="space-y-5">
      {!isLoading && !ownerLinked && profile && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-amber-800">
            <span className="font-medium">Você também atende?</span> Entre como profissional para aparecer na agenda.
          </p>
          <button
            onClick={handleAddSelfAsProfessional}
            disabled={createProfessional.isPending}
            className="shrink-0 rounded-xl bg-amber-600 px-3 py-2.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-60">
            Me adicionar
          </button>
        </div>
      )}

      <section className="rounded-2xl border border-gray-200 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(247,250,252,0.98))] px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Profissionais da clínica</h2>
            <p className="mt-1 text-sm text-gray-500">Cadastre quem atende e mantenha a agenda alinhada.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700">
                {professionals.length} cadastrado{professionals.length !== 1 ? 's' : ''}
              </span>
              {pendingInvites.length > 0 && (
                <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
                  {pendingInvites.length} convite{pendingInvites.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setShowInviteForm(v => !v)}
            className="flex items-center gap-2 px-4 py-2.5 border border-teal-200 text-[#006970] text-sm rounded-xl hover:bg-teal-50 transition-colors">
            <Envelope size={16} /> Convidar
          </button>
          <button onClick={() => { setEditing(null); setModalOpen(true) }}
            className="flex items-center gap-2 px-4 py-2.5 text-white text-sm rounded-xl transition-all active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}>
            <Plus size={16} /> Novo profissional
          </button>
        </div>
        </div>
      </section>

      {showInviteForm && (
        <div className="rounded-2xl border border-teal-100 bg-teal-50 p-4">
          <p className="text-sm font-medium text-[#006970] mb-3">Convite rápido</p>
          <form onSubmit={handleSendInvite} className="flex flex-col gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">E-mail *</label>
                <input type="email" required value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                  placeholder="profissional@clinica.com"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nome (opcional)</label>
                <input type="text" value={inviteName} onChange={e => setInviteName(e.target.value)}
                  placeholder="Dr. João Silva"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Funções</label>
              <div className="flex flex-wrap gap-4 items-center py-1">
                {(['professional', 'receptionist', 'admin'] as const).map(r => (
                  <label key={r} className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input type="checkbox" checked={inviteRoles.includes(r)} onChange={() => toggleInviteRole(r)}
                      className="w-3.5 h-3.5 rounded accent-blue-600" />
                    <span className="text-sm text-gray-700">
                      {r === 'professional' ? 'Profissional' : r === 'receptionist' ? 'Recepção' : 'Admin'}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={createInvite.isPending}
                className="px-4 py-2.5 text-white text-sm rounded-xl disabled:opacity-50 transition-all active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}>
                {createInvite.isPending ? 'Enviando…' : 'Criar convite'}
              </button>
              <button type="button" onClick={() => setShowInviteForm(false)}
                className="px-3 py-2.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {isLoading ? (
        <div className="text-sm text-gray-400 py-8 text-center">Carregando...</div>
      ) : professionals.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
          <p className="text-sm text-gray-400">Nenhum profissional cadastrado.</p>
          <button onClick={() => { setEditing(null); setModalOpen(true) }} className="mt-3 text-sm text-[#006970] hover:underline font-medium">Cadastrar o primeiro</button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-100">
          {professionals.map(p => (
            <div key={p.id} className="flex items-center gap-3 px-5 py-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-9 h-9 rounded-full bg-teal-50 flex items-center justify-center text-[#006970] font-semibold text-sm flex-shrink-0">
                  {p.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                  <p className="text-xs text-gray-400 truncate">
                    {p.specialty ?? 'Especialidade não informada'}{p.councilId ? ` · ${p.councilId}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <span className={`text-xs px-2 py-0.5 rounded-full mr-1 hidden sm:inline ${p.active ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
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
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-gray-700">Convites pendentes</h2>
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">{pendingInvites.length}</span>
          </div>
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 divide-y divide-gray-100">
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
                    className="p-1.5 text-gray-400 hover:text-[#0ea5b0] hover:bg-teal-50 rounded-lg disabled:opacity-40" title="Reenviar e-mail">
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

function AcessoTab() {
  return <UsuariosTab />
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
      <section className="rounded-[28px] border border-gray-200 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,176,0.12),_transparent_42%),linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(247,250,252,0.98))] px-5 py-5 shadow-sm sm:px-6 sm:py-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">Equipe</h1>
            <p className="mt-1 text-sm text-gray-500">Profissionais e acessos, sem desviar para telas paralelas.</p>
          </div>
        <Link
          to={buildSettingsPath('campos', 'profissionais')}
          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition hover:border-gray-300 hover:text-gray-800 flex-shrink-0"
          title="Personalizar campos do cadastro de profissionais"
        >
          <Sliders size={15} />
          <span>Campos do cadastro</span>
        </Link>
        </div>
      </section>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-gray-200 bg-white p-2">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'bg-[#006970] text-white'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
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
