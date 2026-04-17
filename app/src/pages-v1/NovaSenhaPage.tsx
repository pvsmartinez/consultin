import { useState } from 'react'
import { Eye, EyeSlash, Stethoscope, CheckCircle } from '@phosphor-icons/react'
import { supabase } from '../services/supabase'
import { useAuthContext } from '../contexts/AuthContext'

export default function NovaSenhaPage() {
  const { clearRecoveryMode, refreshProfile } = useAuthContext()

  // Detect if this is from an invite link (first access) or a password reset
  const isInvite = typeof window !== 'undefined' && window.location.hash.includes('type=invite')

  const [password, setPassword]       = useState('')
  const [confirm, setConfirm]         = useState('')
  const [showPwd, setShowPwd]         = useState(false)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [done, setDone]               = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('As senhas não coincidem.')
      return
    }

    setLoading(true)

    try {
      // Ensure there is a valid session before calling updateUser.
      // If the OTP session expired or was never established, abort early.
      const { data: { session: activeSession } } = await supabase.auth.getSession()
      if (!activeSession) {
        setError('Sessão expirada. Solicite um novo código e tente novamente.')
        setLoading(false)
        return
      }

      // Race against a 15s timeout — updateUser can hang if the JWT refresh stalls.
      const result = await Promise.race([
        supabase.auth.updateUser({ password }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 15000)
        ),
      ])

      if (result.error) {
        setError('Não foi possível atualizar a senha. Tente novamente.')
        return
      }
    } catch (err) {
      const isTimeout = err instanceof Error && err.message === 'timeout'
      setError(
        isTimeout
          ? 'A requisição demorou demais. Verifique sua conexão e tente novamente.'
          : 'Não foi possível atualizar a senha. O link pode ter expirado.'
      )
      return
    } finally {
      setLoading(false)
    }

    setDone(true)
    // Fetch profile before clearing recovery mode so App.tsx renders the correct
    // screen (wizard or dashboard) instead of the "no-access" OnboardingPage.
    // This is critical for new clinic owners: fetchStartupData was skipped on the
    // SIGNED_IN+invite event, so profile is null until we explicitly load it here.
    await refreshProfile()
    setTimeout(() => clearRecoveryMode(), 2500)
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm text-center space-y-4">
          <CheckCircle size={48} className="text-green-500 mx-auto" />
          <h1 className="text-lg font-semibold text-gray-800">Senha atualizada!</h1>
          <p className="text-sm text-gray-500">Redirecionando…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-6">
          <Stethoscope size={24} className="text-blue-600" />
          <span className="text-lg font-semibold text-gray-800">Consultin</span>
        </div>

        <h1 className="text-lg font-semibold text-gray-800 mb-1">
          {isInvite ? 'Bem-vindo! Crie sua senha' : 'Criar nova senha'}
        </h1>
        <p className="text-sm text-gray-400 mb-6">
          {isInvite
            ? 'Defina uma senha para acessar sua conta.'
            : 'Escolha uma senha segura para sua conta.'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* New password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nova senha</label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="Mínimo 6 caracteres"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowPwd(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPwd ? <EyeSlash size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Confirm */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar senha</label>
            <input
              type={showPwd ? 'text' : 'password'}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              placeholder="Repita a senha"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2.5 text-sm font-medium transition disabled:opacity-50"
          >
            {loading ? 'Salvando…' : 'Salvar nova senha'}
          </button>
        </form>
      </div>
    </div>
  )
}
