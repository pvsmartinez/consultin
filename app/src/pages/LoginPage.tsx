import { useRef, useState } from 'react'
import { Stethoscope, ArrowLeft } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { useAuthContext } from '../contexts/AuthContext'

// ─── Social icons (inline SVG — no extra deps) ───────────────────────────────
const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.2 0 5.8 1.1 7.9 2.9l5.9-5.9C34.2 3.5 29.5 1.5 24 1.5 14.8 1.5 7 7.3 3.7 15.4l6.9 5.4C12.3 14.1 17.7 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.4c-.5 2.8-2.1 5.2-4.5 6.8l7 5.4C42.8 37 46.1 31.2 46.1 24.5z" />
    <path fill="#FBBC05" d="M10.6 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-6.9-5.4A22.5 22.5 0 001.5 24c0 3.6.9 7 2.4 9.9l6.7-5.2z" />
    <path fill="#34A853" d="M24 46.5c5.5 0 10.1-1.8 13.5-4.9l-7-5.4c-1.9 1.3-4.3 2-6.5 2-6.3 0-11.6-4.6-13.6-10.8l-6.7 5.2C7 40.7 14.8 46.5 24 46.5z" />
  </svg>
)

const AppleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 814 1000" fill="currentColor" aria-hidden="true">
    <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-57.8-155.5-127.4C46 376.5 0 246.5 0 122.7c0-71.2 26.1-136.6 73.1-183.6C120.1-14.2 186.4-42 256-42c66.5 0 122.7 40.1 164 40.1 39.2 0 101.2-42.4 180.3-42.4 28 0 106.9 2.6 164 76zm-87.5-221.8c35.5-41.5 61.6-100.5 61.6-159.3 0-7.8-.7-15.9-1.9-22.7-57.8 2.6-128.5 37.6-171.7 86.5-32.1 36.2-62.5 96.1-62.5 155.9 0 8.4 1.3 16.9 1.9 19.5 3.2.6 8.4 1.3 13.6 1.3 51.8 0 116.1-33.7 158.9-81.2z" />
  </svg>
)

// ─── OTP input — 6 separate digit boxes ──────────────────────────────────────
function OtpInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const digits = value.split('')

  const focusNext = (i: number) => inputs.current[i + 1]?.focus()
  const focusPrev = (i: number) => inputs.current[i - 1]?.focus()

  const handleKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (digits[i]) {
        const next = [...digits]
        next[i] = ''
        onChange(next.join('').padEnd(6, '').slice(0, 6).replace(/\s/g, ''))
      } else {
        focusPrev(i)
      }
    }
    if (e.key === 'ArrowLeft') focusPrev(i)
    if (e.key === 'ArrowRight') focusNext(i)
  }

  const handleChange = (i: number, raw: string) => {
    const digit = raw.replace(/\D/g, '').slice(-1)
    const next  = value.padEnd(6, ' ').split('')
    next[i]     = digit || ' '
    const joined = next.join('').replace(/\s/g, '')
    onChange(joined)
    if (digit) focusNext(i)
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    onChange(pasted)
    e.preventDefault()
    inputs.current[Math.min(pasted.length, 5)]?.focus()
  }

  return (
    <div className="flex gap-2 justify-center" onPaste={handlePaste}>
      {[...Array(6)].map((_, i) => (
        <input
          key={i}
          ref={el => { inputs.current[i] = el }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[i] ?? ''}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKey(i, e)}
          className="w-11 h-12 text-center text-lg font-mono font-semibold border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition"
        />
      ))}
    </div>
  )
}

type View = 'login' | 'register' | 'forgot' | 'otp'

export default function LoginPage() {
  const { signInWithEmail, signInWithGoogle, signInWithApple, sendPasswordResetOtp, verifyPasswordResetOtp } = useAuthContext()

  const [view, setView]         = useState<View>('login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [otpCode, setOtpCode]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const goto = (v: View) => { setView(v); setError(null); setSuccessMsg(null) }

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await signInWithEmail(email, password)
    if (error) setError('E-mail ou senha inválidos.')
    setLoading(false)
  }

  // Step 1 of OTP reset: send code
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await sendPasswordResetOtp(email)
    setLoading(false)
    if (error) {
      setError('Não foi possível enviar o código. Verifique o e-mail informado.')
    } else {
      setOtpCode('')
      goto('otp')
    }
  }

  // Step 2 of OTP reset: verify code → AuthContext sets recoveryMode → NovaSenhaPage
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (otpCode.length < 6) { setError('Digite os 6 dígitos do código.'); return }
    setError(null)
    setLoading(true)
    const { error } = await verifyPasswordResetOtp(email, otpCode)
    setLoading(false)
    if (error) setError('Código inválido ou expirado. Tente novamente.')
    // On success: App.tsx re-renders with recoveryMode=true → NovaSenhaPage
  }

  const SocialButton = ({ onClick, icon, label }: { onClick: () => void; icon: React.ReactNode; label: string }) => (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-center gap-3 w-full border border-gray-200 rounded-lg py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition"
    >
      {icon}
      {label}
    </button>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">

        {/* Logo + back to home */}
        <div className="flex items-center justify-between mb-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Stethoscope size={16} weight="bold" className="text-white" />
            </div>
            <span className="text-base font-bold text-gray-900">Consultin</span>
          </Link>
          <Link to="/" className="text-xs text-gray-400 hover:text-blue-600 flex items-center gap-1 transition">
            <ArrowLeft size={13} />
            Início
          </Link>
        </div>

        {/* ── LOGIN ─────────────────────────────────────────── */}
        {view === 'login' && (
          <>
            <h1 className="text-lg font-semibold text-gray-800 mb-1">Entrar</h1>
            <p className="text-sm text-gray-400 mb-6">Acesse sua conta</p>

            <div className="flex flex-col gap-2 mb-5">
              <SocialButton onClick={signInWithGoogle} icon={<GoogleIcon />} label="Continuar com Google" />
              <SocialButton onClick={signInWithApple} icon={<AppleIcon />} label="Continuar com Apple" />
            </div>

            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400">ou</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            <form onSubmit={handleEmailLogin} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  placeholder="seu@email.com"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-gray-700">Senha</label>
                  <button type="button" onClick={() => goto('forgot')}
                    className="text-xs text-blue-600 hover:underline">
                    Esqueceu?
                  </button>
                </div>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                  placeholder="••••••••"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button type="submit" disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2.5 text-sm font-medium transition disabled:opacity-50">
                {loading ? 'Entrando...' : 'Entrar'}
              </button>
            </form>

            <p className="text-center text-xs text-gray-400 mt-5">
              Não tem conta?{' '}
              <button onClick={() => goto('register')} className="text-blue-600 hover:underline">
                Cadastre-se
              </button>
            </p>
            <p className="text-center text-xs text-gray-400 mt-2">
              É uma clínica?{' '}
              <Link to="/cadastro-clinica" className="text-blue-600 hover:underline font-medium">
                Solicite seu acesso
              </Link>
            </p>
          </>
        )}

        {/* ── FORGOT — step 1: enter email ──────────────────── */}
        {view === 'forgot' && (
          <>
            <h1 className="text-lg font-semibold text-gray-800 mb-1">Recuperar acesso</h1>
            <p className="text-sm text-gray-400 mb-6">
              Enviaremos um código de 6 dígitos para o seu e-mail
            </p>
            <form onSubmit={handleSendOtp} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  placeholder="seu@email.com"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button type="submit" disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2.5 text-sm font-medium transition disabled:opacity-50">
                {loading ? 'Enviando...' : 'Enviar código'}
              </button>
            </form>
            <button onClick={() => goto('login')}
              className="flex items-center justify-center gap-1 text-xs text-blue-600 hover:underline mt-4 w-full">
              <ArrowLeft size={12} />
              Voltar para login
            </button>
          </>
        )}

        {/* ── OTP — step 2: enter 6-digit code ─────────────── */}
        {view === 'otp' && (
          <>
            <h1 className="text-lg font-semibold text-gray-800 mb-1">Digite o código</h1>
            <p className="text-sm text-gray-400 mb-2">
              Enviamos um código de 6 dígitos para
            </p>
            <p className="text-sm font-medium text-gray-700 mb-6 truncate">{email}</p>

            <form onSubmit={handleVerifyOtp} className="space-y-5">
              <OtpInput value={otpCode} onChange={setOtpCode} />
              {error && <p className="text-xs text-red-500 text-center">{error}</p>}
              {successMsg && <p className="text-xs text-green-600 text-center">{successMsg}</p>}
              <button type="submit" disabled={loading || otpCode.length < 6}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2.5 text-sm font-medium transition disabled:opacity-50">
                {loading ? 'Verificando...' : 'Confirmar código'}
              </button>
            </form>

            <div className="flex items-center justify-between mt-4">
              <button onClick={() => goto('forgot')}
                className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                <ArrowLeft size={12} />
                Trocar e-mail
              </button>
              <button
                onClick={async () => {
                  setLoading(true)
                  await sendPasswordResetOtp(email)
                  setLoading(false)
                  setSuccessMsg('Código reenviado!')
                  setTimeout(() => setSuccessMsg(null), 4000)
                }}
                disabled={loading}
                className="text-xs text-blue-600 hover:underline disabled:opacity-50">
                Reenviar código
              </button>
            </div>
          </>
        )}

        {/* ── REGISTER ───────────────────────────────────── */}
        {view === 'register' && (
          <>
            <h1 className="text-lg font-semibold text-gray-800 mb-1">Criar conta</h1>
            <p className="text-sm text-gray-400 mb-5">
              Profissionais são convidados pela clínica
            </p>
            <div className="flex flex-col gap-2 mb-5">
              <SocialButton onClick={signInWithGoogle} icon={<GoogleIcon />} label="Cadastrar com Google" />
              <SocialButton onClick={signInWithApple} icon={<AppleIcon />} label="Cadastrar com Apple" />
            </div>
            <p className="text-xs text-gray-400 text-center mb-2">
              Ou{' '}
              <Link to="/cadastro-clinica" className="text-blue-600 hover:underline font-medium">
                cadastre sua clínica
              </Link>
              {' '}para ter acesso completo
            </p>
            <p className="text-xs text-gray-400 text-center">
              Já tem conta?{' '}
              <button onClick={() => goto('login')} className="text-blue-600 hover:underline">Entrar</button>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
