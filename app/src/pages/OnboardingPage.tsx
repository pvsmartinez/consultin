import { useState } from 'react'
import { Stethoscope, Spinner } from '@phosphor-icons/react'
import { IMaskInput } from 'react-imask'
import { supabase } from '../services/supabase'
import { useAuthContext } from '../contexts/AuthContext'
import { useMyInvite, useClinicsPublic, useAcceptInvite } from '../hooks/useInvites'

// ─────────────────────────────────────────────────────────────────────────────
// OnboardingPage — shown when the user is authenticated but has no user_profile.
//
// Access rules (post-session 5 redesign):
//   • Clinics are created ONLY by the super admin via /admin.
//   • Professionals receive a clinic_invite (email) and confirm here.
//   • Patients self-register: pick clinic + fill name/phone/cpf.
//   • Anyone else sees a "no access" screen with instructions.
// ─────────────────────────────────────────────────────────────────────────────

type View = 'checking' | 'invite' | 'patient' | 'no-access'

export default function OnboardingPage() {
  const { session, signOut } = useAuthContext()
  const email = session?.user.email ?? ''

  // Check if the user has a pending invite (used to choose initial view)
  const { data: invite, isLoading: checkingInvite } = useMyInvite(email)
  const { data: clinics = [], isLoading: loadingClinics } = useClinicsPublic()
  const acceptInvite = useAcceptInvite()

  // UI state
  const [view, setView] = useState<View | null>(null)
  // "invite" view
  const [inviteName, setInviteName] = useState(session?.user.user_metadata?.full_name ?? '')
  // "patient" view
  const [patientName, setPatientName] = useState(session?.user.user_metadata?.full_name ?? '')
  const [patientPhone, setPatientPhone] = useState('')
  const [patientCpf, setPatientCpf]   = useState('')
  const [patientClinicId, setPatientClinicId] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  // ── Derive active view ──────────────────────────────────────────────────────
  // While checking, show spinner.
  // Once resolved: invite → "invite" view, else follow manual override or default.
  function resolveView(): View {
    if (view) return view
    if (checkingInvite) return 'checking'
    if (invite) return 'invite'
    return 'no-access'
  }
  const activeView = resolveView()

  // ── Submit: accept invite ───────────────────────────────────────────────────
  async function handleAcceptInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!invite || !session || !inviteName.trim()) return
    setLoading(true); setError(null)
    try {
      await acceptInvite.mutateAsync({
        inviteId: invite.id,
        userId:   session.user.id,
        clinicId: invite.clinicId,
        roles:    invite.roles,
        name:     inviteName,
        email:    session.user.email,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao confirmar acesso.')
      setLoading(false)
    }
  }

  // ── Submit: patient self-registration ──────────────────────────────────────
  async function handlePatientRegister(e: React.FormEvent) {
    e.preventDefault()
    if (!session || !patientName.trim() || !patientClinicId) return
    setLoading(true); setError(null)
    try {
      // 1. Create patient record
      const { error: patientErr } = await supabase
        .from('patients')
        .insert({
          clinic_id: patientClinicId,
          user_id:   session.user.id,   // link from day one
          name:      patientName.trim(),
          phone:     patientPhone.trim() || null,
          cpf:       patientCpf.trim()   || null,
          email:     email || null,
        })
      if (patientErr) throw new Error(patientErr.message)

      // 2. Create user_profiles as patient
      const { error: profileErr } = await supabase
        .from('user_profiles')
        .insert({
          id:             session.user.id,
          clinic_id:      patientClinicId,
          roles:          ['patient'],
          name:           patientName.trim(),
          is_super_admin: false,
        })
      if (profileErr) throw new Error(profileErr.message)

      // 3. Re-fetch session → AuthContext picks up the new profile
      await supabase.auth.refreshSession()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar conta.')
      setLoading(false)
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-teal-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
        <div className="flex items-center gap-2 mb-6">
          <Stethoscope size={24} className="text-[#0ea5b0]" />
          <span className="text-lg font-semibold text-gray-800">Consultin</span>
        </div>
        {children}
      </div>
    </div>
  )

  // ── View: checking (loading) ───────────────────────────────────────────────
  if (activeView === 'checking') {
    return (
      <Shell>
        <div className="flex flex-col items-center py-8 gap-3 text-gray-400">
          <Spinner size={28} className="animate-spin text-[#0ea5b0]" />
          <span className="text-sm">Verificando acesso…</span>
        </div>
      </Shell>
    )
  }

  // ── View: invite (professional/staff) ─────────────────────────────────────
  if (activeView === 'invite' && invite) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold text-gray-800 mb-1">Confirmar acesso</h1>
        <p className="text-sm text-gray-400 mb-1">
          Você foi convidado para{' '}
          <span className="font-medium text-gray-700">{invite.clinicName ?? 'a clínica'}</span>{' '}
          como <span className="font-medium text-gray-700">{invite.roles.includes('professional') ? 'profissional' : invite.roles.map(r => r).join(', ')}</span>.
        </p>
        <p className="text-xs text-gray-400 mb-6">Confirme seu nome para ativar o acesso.</p>

        <form onSubmit={handleAcceptInvite} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Seu nome</label>
            <input
              type="text"
              value={inviteName}
              onChange={e => setInviteName(e.target.value)}
              required
              placeholder="Dr. João Silva"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
            <input readOnly value={email}
              className="w-full border border-gray-100 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-400" />
          </div>

          {error && <ErrorBanner msg={error} />}

          <button type="submit" disabled={loading}
            className="w-full text-white rounded-xl py-2.5 text-sm font-medium transition-all active:scale-[0.99] disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}>
            {loading ? 'Ativando…' : 'Ativar minha conta'}
          </button>
        </form>

        <button type="button" onClick={signOut}
          className="block text-center text-xs text-gray-400 hover:underline mt-5 w-full">
          Usar outra conta
        </button>
      </Shell>
    )
  }

  // ── View: patient self-register ────────────────────────────────────────────
  if (activeView === 'patient') {
    return (
      <Shell>
        <h1 className="text-lg font-semibold text-gray-800 mb-1">Criar conta de paciente</h1>
        <p className="text-sm text-gray-400 mb-6">
          Preencha seus dados para acessar o painel do paciente.
        </p>

        <form onSubmit={handlePatientRegister} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome completo *</label>
            <input type="text" value={patientName} onChange={e => setPatientName(e.target.value)}
              required placeholder="Maria da Silva"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Clínica *</label>
            {loadingClinics ? (
              <p className="text-xs text-gray-400">Carregando clínicas…</p>
            ) : (
              <select value={patientClinicId} onChange={e => setPatientClinicId(e.target.value)}
                required
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0] bg-white">
                <option value="">Selecione a clínica</option>
                {clinics.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
            <input type="tel" value={patientPhone} onChange={e => setPatientPhone(e.target.value)}
              placeholder="(11) 99999-9999"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CPF</label>
            <IMaskInput
              mask="000.000.000-00"
              value={patientCpf}
              onAccept={(val: string) => setPatientCpf(val)}
              placeholder="000.000.000-00"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5b0]" />
          </div>

          {error && <ErrorBanner msg={error} />}

          <button type="submit" disabled={loading || !patientClinicId}
            className="w-full text-white rounded-xl py-2.5 text-sm font-medium transition-all active:scale-[0.99] disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}>
            {loading ? 'Criando conta…' : 'Criar conta'}
          </button>
        </form>

        <button type="button" onClick={() => { setView('no-access'); setError(null) }}
          className="block text-center text-xs text-gray-400 hover:underline mt-4 w-full">
          ← Voltar
        </button>
        <button type="button" onClick={signOut}
          className="block text-center text-xs text-gray-400 hover:underline mt-1 w-full">
          Usar outra conta
        </button>
      </Shell>
    )
  }

  // ── View: no-access (default) ──────────────────────────────────────────────
  return (
    <Shell>
      <h1 className="text-lg font-semibold text-gray-800 mb-1">Acesso não autorizado</h1>
      <p className="text-sm text-gray-500 mb-2">
        O e-mail <span className="font-medium text-gray-700">{email}</span> não tem acesso
        a nenhuma clínica ainda.
      </p>
      <p className="text-sm text-gray-400 mb-6">
        Peça ao administrador da sua clínica para enviar um convite, ou crie uma conta de
        paciente abaixo.
      </p>

      <button type="button" onClick={() => { setView('patient'); setError(null) }}
        className="w-full text-white rounded-xl py-2.5 text-sm font-medium transition-all active:scale-[0.99] mb-3"
        style={{ background: 'linear-gradient(135deg, #0ea5b0 0%, #006970 100%)' }}>
        Sou paciente — criar conta
      </button>

      <button type="button" onClick={signOut}
        className="block text-center text-xs text-gray-400 hover:underline w-full">
        Usar outra conta
      </button>
    </Shell>
  )
}

// ── Small helper component ─────────────────────────────────────────────────────
function ErrorBanner({ msg }: { msg: string }) {
  return (
    <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
      {msg}
    </p>
  )
}
