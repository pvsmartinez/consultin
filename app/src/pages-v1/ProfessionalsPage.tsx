import { useState } from 'react'
import { Plus, PencilSimple, ToggleRight, ToggleLeft, Envelope, Trash, Bank, PaperPlaneTilt } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useProfessionals } from '../hooks/useProfessionals'
import { usePendingInvites, useCreateInvite, useDeleteInvite, useResendInviteEmail } from '../hooks/useInvites'
import ProfessionalModal from '../components/professionals/ProfessionalModal'
import ProfessionalBankAccountModal from '../components/professionals/ProfessionalBankAccountModal'
import { useClinic } from '../hooks/useClinic'
import type { Professional } from '../types'

export default function ProfessionalsPage() {
  const { data: professionals = [], isLoading, toggleActive } = useProfessionals()
  const { data: pendingInvites = [], isLoading: loadingInvites } = usePendingInvites()
  const { data: clinic } = useClinic()
  const createInvite     = useCreateInvite()
  const deleteInvite     = useDeleteInvite()
  const resendEmail      = useResendInviteEmail()

  const [modalOpen, setModalOpen]   = useState(false)
  const [editing, setEditing]       = useState<Professional | null>(null)
  const [bankPro, setBankPro]       = useState<Professional | null>(null)

  // Standalone invite form state
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteEmail, setInviteEmail]       = useState('')
  const [inviteName, setInviteName]         = useState('')
  const [inviteRoles, setInviteRoles]       = useState<('professional' | 'receptionist' | 'admin')[]>(['professional'])

  function toggleInviteRole(role: 'professional' | 'receptionist' | 'admin') {
    setInviteRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    )
  }

  function openNew() { setEditing(null); setModalOpen(true) }
  function openEdit(p: Professional) { setEditing(p); setModalOpen(true) }

  async function handleToggle(p: Professional) {
    try {
      await toggleActive.mutateAsync({ id: p.id, active: !p.active })
      toast.success(p.active ? 'Profissional desativado' : 'Profissional ativado')
    } catch {
      toast.error('Erro ao alterar status')
    }
  }

  async function handleSendInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    if (inviteRoles.length === 0) {
      toast.error('Selecione ao menos uma função para o convite.')
      return
    }
    try {
      const result = await createInvite.mutateAsync({ email: inviteEmail.trim(), roles: inviteRoles, name: inviteName.trim() || undefined })
      if (result.emailSent) {
        toast.success('Convite enviado por e-mail!')
      } else if (result.emailReason === 'already_registered') {
        toast.success('Convite criado. Usuário já tem conta — ficará disponível ao acessar o sistema.')
      } else {
        toast.success('Convite registrado')
      }
      setInviteEmail(''); setInviteName(''); setInviteRoles(['professional']); setShowInviteForm(false)
    } catch {
      toast.error('Erro ao criar convite')
    }
  }

  async function handleResendEmail(inviteId: string) {
    try {
      const result = await resendEmail.mutateAsync(inviteId)
      if (result.sent) {
        toast.success('E-mail reenviado!')
      } else if (result.reason === 'already_registered') {
        toast.info('Usuário já tem conta — convite disponível ao acessar o sistema.')
      } else {
        toast.warning('Não foi possível reenviar o e-mail agora.')
      }
    } catch {
      toast.error('Erro ao reenviar e-mail')
    }
  }

  async function handleDeleteInvite(id: string) {
    try {
      await deleteInvite.mutateAsync(id)
      toast.success('Convite cancelado')
    } catch {
      toast.error('Erro ao cancelar convite')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-800">Profissionais</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {professionals.length} cadastrado{professionals.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowInviteForm(v => !v)}
            className="flex items-center gap-2 px-4 py-2 border border-teal-200 text-[#006970] text-sm rounded-xl hover:bg-teal-50">
            <Envelope size={16} />
            Convidar
          </button>
          <button onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 text-white text-sm rounded-xl transition-all active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}>
            <Plus size={16} />
            Novo profissional
          </button>
        </div>
      </div>

      {/* Inline invite form */}
      {showInviteForm && (
        <div className="bg-teal-50 border border-teal-100 rounded-xl p-4">
          <p className="text-sm font-medium text-[#006970] mb-3">Convidar profissional para o sistema</p>
          <form onSubmit={handleSendInvite} className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs text-gray-500 mb-1">E-mail *</label>
              <input type="email" required value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                placeholder="profissional@clinica.com"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]" />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="block text-xs text-gray-500 mb-1">Nome (opcional)</label>
              <input type="text" value={inviteName} onChange={e => setInviteName(e.target.value)}
                placeholder="Dr. João Silva"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Funções (múltipla escolha)</label>
              <div className="flex gap-4 items-center h-[38px]">
                {(['professional', 'receptionist', 'admin'] as const).map(r => (
                  <label key={r} className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={inviteRoles.includes(r)}
                      onChange={() => toggleInviteRole(r)}
                      className="w-3.5 h-3.5 rounded accent-blue-600"
                    />
                    <span className="text-sm text-gray-700">
                      {r === 'professional' ? 'Profissional' : r === 'receptionist' ? 'Atendente' : 'Administrador'}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <button type="submit" disabled={createInvite.isPending}
              className="px-4 py-2 text-white text-sm rounded-xl disabled:opacity-50 transition-all active:scale-[0.98]"
              style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}>
              {createInvite.isPending ? 'Enviando…' : 'Criar convite'}
            </button>
            <button type="button" onClick={() => setShowInviteForm(false)}
              className="px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">
              Cancelar
            </button>
          </form>
        </div>
      )}

      {/* Professionals list */}
      {isLoading ? (
        <div className="text-sm text-gray-400 py-8 text-center">Carregando...</div>
      ) : professionals.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 py-16 text-center">
          <p className="text-sm text-gray-400">Nenhum profissional cadastrado.</p>
          <button onClick={openNew} className="mt-3 text-sm text-[#006970] hover:underline">
            Cadastrar o primeiro
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-100">
          {professionals.map(p => (
            <div key={p.id} className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-4">
                <div className="w-9 h-9 rounded-full bg-teal-50 flex items-center justify-center text-[#006970] font-semibold text-sm">
                  {p.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">{p.name}</p>
                  <p className="text-xs text-gray-400">
                    {p.specialty ?? 'Especialidade não informada'}
                    {p.councilId ? ` · ${p.councilId}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <span className={`text-xs px-2 py-0.5 rounded-full mr-2 ${p.active ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                  {p.active ? 'Ativo' : 'Inativo'}
                </span>
                <button onClick={() => openEdit(p)}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg">
                  <PencilSimple size={16} />
                </button>
                <button onClick={() => handleToggle(p)}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg"
                  title={p.active ? 'Desativar' : 'Ativar'}>
                  {p.active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                </button>
                {clinic?.paymentsEnabled && (
                  <button onClick={() => setBankPro(p)}
                    className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"
                    title="Conta bancária para repasse">
                    <Bank size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pending invites section */}
      {!loadingInvites && pendingInvites.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-600 mb-2">
            Convites pendentes ({pendingInvites.length})
          </h2>
          <div className="bg-white rounded-xl border border-dashed border-gray-200 divide-y divide-gray-100">
            {pendingInvites.map(inv => (
              <div key={inv.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm text-gray-700">{inv.email}</p>
                  <p className="text-xs text-gray-400">
                    {inv.roles?.map(r => (
                      <span key={r} className="text-xs font-medium">
                        {r === 'professional' ? 'Profissional' : r === 'receptionist' ? 'Atendente' : 'Admin'}
                      </span>
                    )).reduce<React.ReactNode[]>((acc, el, i) => i === 0 ? [el] : [...acc, ' / ', el], [])}
                    {inv.name ? ` · ${inv.name}` : ''}
                    {' · enviado '}
                    {new Date(inv.createdAt).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-yellow-50 text-yellow-600 rounded-full px-2 py-0.5">Aguardando</span>
                  <button
                    onClick={() => handleResendEmail(inv.id)}
                    disabled={resendEmail.isPending}
                    className="p-1.5 text-gray-400 hover:text-[#0ea5b0] hover:bg-teal-50 rounded-lg disabled:opacity-40"
                    title="Reenviar e-mail de convite">
                    <PaperPlaneTilt size={15} />
                  </button>
                  <button onClick={() => handleDeleteInvite(inv.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                    title="Cancelar convite">
                    <Trash size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ProfessionalModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        professional={editing}
      />

      {bankPro && (
        <ProfessionalBankAccountModal
          professional={bankPro}
          onClose={() => setBankPro(null)}
        />
      )}
    </div>
  )
}
