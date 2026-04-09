/**
 * WhatsAppOtpPanel
 *
 * Renders an alternative login option: "Entrar com código via WhatsApp".
 * Shown below the main AuthScreen on the login page.
 *
 * Flow:
 *   1. User types email → POST /whatsapp-otp { action: 'send', email }
 *      - If phone found → show 6-digit code input + countdown timer
 *      - If no phone   → show friendly message, fall back to email
 *   2. User types code → POST /whatsapp-otp { action: 'verify', email, code }
 *      → returns { token, email }
 *      → supabase.auth.verifyOtp({ email, token, type: 'magiclink' })
 *      → triggers AuthContext session change → user is logged in
 */

import React, { useRef, useState, useEffect } from 'react'
import { WhatsappLogo } from '@phosphor-icons/react'
import { supabase } from '../../services/supabase'

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-otp`
const ANON_KEY     = import.meta.env.VITE_SUPABASE_ANON_KEY as string

type Step = 'email' | 'code' | 'done'

export default function WhatsAppOtpPanel() {
  const [expanded,    setExpanded]    = useState(false)
  const [step,        setStep]        = useState<Step>('email')
  const [email,       setEmail]       = useState('')
  const [maskedPhone, setMaskedPhone] = useState('')
  const [code,        setCode]        = useState('')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [countdown,   setCountdown]   = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  function startCountdown(seconds = 300) {
    setCountdown(seconds)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(timerRef.current!); return 0 }
        return prev - 1
      })
    }, 1000)
  }

  function formatCountdown(s: number) {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${String(sec).padStart(2, '0')}`
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setError('')

    try {
      const res  = await fetch(FUNCTION_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
        body:    JSON.stringify({ action: 'send', email: email.trim() }),
      })
      const data = await res.json()

      if (!res.ok || !data.sent) {
        if (data.reason === 'no_phone') {
          setError('Não encontramos um número de WhatsApp vinculado a este email. Use o login por email abaixo.')
        } else if (data.reason === 'rate_limited') {
          setError('Muitas tentativas. Aguarde alguns minutos.')
        } else {
          setError('Não foi possível enviar o código. Tente novamente.')
        }
        return
      }

      setMaskedPhone(data.maskedPhone ?? '')
      setStep('code')
      startCountdown(300)
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (code.length !== 6) return
    setLoading(true)
    setError('')

    try {
      const res  = await fetch(FUNCTION_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
        body:    JSON.stringify({ action: 'verify', email: email.trim(), code: code.trim() }),
      })
      const data = await res.json()

      if (!res.ok || !data.token) {
        if (res.status === 401) {
          setError('Código incorreto ou expirado. Tente novamente.')
        } else {
          setError('Erro ao verificar. Tente novamente.')
        }
        return
      }

      // Verify the magiclink token to create a Supabase session
      const { error: authError } = await supabase.auth.verifyOtp({
        email: data.email,
        token: data.token,
        type:  'magiclink',
      })

      if (authError) {
        console.error('[WhatsAppOtp] verifyOtp error:', authError)
        setError('Falha ao criar sessão. Tente entrar por email.')
        return
      }

      setStep('done')
      if (timerRef.current) clearInterval(timerRef.current)
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  function handleResend() {
    setCode('')
    setError('')
    setStep('email')
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div style={{ marginTop: 8 }}>
      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          style={{
            width:           '100%',
            padding:         '10px 16px',
            borderRadius:    8,
            border:          '1px solid #d1d5db',
            background:      '#ffffff',
            color:           '#374151',
            fontSize:        14,
            fontWeight:      500,
            cursor:          'pointer',
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'center',
            gap:             8,
          }}
        >
          <WhatsappLogo size={18} color="#22c55e" weight="fill" />
          Entrar com código via WhatsApp
        </button>
      ) : (
        <div style={{
          border:       '1px solid #d1d5db',
          borderRadius: 12,
          padding:      20,
          background:   '#ffffff',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <WhatsappLogo size={20} color="#22c55e" weight="fill" />
            <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
              Entrar via WhatsApp
            </span>
          </div>

          {step === 'email' && (
            <form onSubmit={handleSend} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input
                type="email"
                placeholder="Seu email de cadastro"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                style={inputStyle}
              />
              {error && <p style={errorStyle}>{error}</p>}
              <button type="submit" disabled={loading} style={btnStyle}>
                {loading ? 'Enviando…' : 'Enviar código'}
              </button>
              <button type="button" onClick={() => setExpanded(false)} style={cancelStyle}>
                Cancelar
              </button>
            </form>
          )}

          {step === 'code' && (
            <form onSubmit={handleVerify} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 13, color: '#374151', margin: 0 }}>
                Código enviado para <strong>{maskedPhone}</strong>
              </p>
              <input
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                autoFocus
                style={{ ...inputStyle, textAlign: 'center', fontSize: 22, letterSpacing: 8 }}
              />
              {countdown > 0 ? (
                <p style={{ fontSize: 12, color: '#6b7280', textAlign: 'center', margin: 0 }}>
                  Expira em {formatCountdown(countdown)}
                </p>
              ) : (
                <p style={{ fontSize: 12, color: '#ef4444', textAlign: 'center', margin: 0 }}>
                  Código expirado.{' '}
                  <button type="button" onClick={handleResend} style={{ color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12 }}>
                    Reenviar
                  </button>
                </p>
              )}
              {error && <p style={errorStyle}>{error}</p>}
              <button type="submit" disabled={loading || code.length !== 6} style={btnStyle}>
                {loading ? 'Verificando…' : 'Entrar'}
              </button>
              <button type="button" onClick={handleResend} style={cancelStyle}>
                Usar outro email
              </button>
            </form>
          )}

          {step === 'done' && (
            <p style={{ fontSize: 14, color: '#16a34a', textAlign: 'center', margin: 0 }}>
              ✅ Entrando…
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Inline styles ─────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width:        '100%',
  padding:      '10px 12px',
  borderRadius: 8,
  border:       '1px solid #d1d5db',
  fontSize:     14,
  color:        '#111827',
  outline:      'none',
  boxSizing:    'border-box',
}

const btnStyle: React.CSSProperties = {
  width:           '100%',
  padding:         '10px 16px',
  borderRadius:    8,
  border:          'none',
  background:      '#2563eb',
  color:           '#ffffff',
  fontSize:        14,
  fontWeight:      600,
  cursor:          'pointer',
}

const cancelStyle: React.CSSProperties = {
  background:  'none',
  border:      'none',
  color:       '#6b7280',
  fontSize:    13,
  cursor:      'pointer',
  textAlign:   'center',
  padding:     0,
}

const errorStyle: React.CSSProperties = {
  fontSize: 13,
  color:    '#ef4444',
  margin:   0,
}
