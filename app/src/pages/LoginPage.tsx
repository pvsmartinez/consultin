import { AuthScreen } from '@pvsmartinez/shared'
import { Stethoscope, ArrowLeft } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { supabase } from '../services/supabase'

const ConsultinLogo = () => (
  <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
    <div style={{
      width: 36,
      height: 36,
      borderRadius: 8,
      background: '#2563eb',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <Stethoscope size={18} weight="bold" color="white" />
    </div>
  </Link>
)

const CONSULTIN_THEME = {
  pageBg: '#eff6ff',
  cardBg: '#ffffff',
  cardBorder: '#e5e7eb',
  cardRadius: '16px',
  cardShadow: '0 4px 24px rgba(0,0,0,0.08)',
  inputBg: '#ffffff',
  inputBorder: '#d1d5db',
  inputBorderFocus: '#3b82f6',
  inputText: '#111827',
  inputPlaceholder: '#9ca3af',
  inputRadius: '8px',
  primaryBg: '#2563eb',
  primaryText: '#ffffff',
  primaryHoverBg: '#1d4ed8',
  primaryRadius: '8px',
  socialBg: '#ffffff',
  socialBorder: '#d1d5db',
  socialText: '#374151',
  socialHoverBg: '#f9fafb',
  socialRadius: '8px',
  textTitle: '#111827',
  textBody: '#374151',
  textMuted: '#6b7280',
  textLink: '#2563eb',
  textLinkHover: '#1d4ed8',
  divider: '#e5e7eb',
  dividerText: '#9ca3af',
  error: '#ef4444',
  success: '#22c55e',
}

export default function LoginPage() {
  return (
    <AuthScreen
      supabase={supabase}
      brand={{
        logo: <ConsultinLogo />,
        name: 'Consultin',
        subtitle: 'Acesse sua conta',
      }}
      theme={CONSULTIN_THEME}
      features={{
        google: true,
        apple: true,
        signUp: false,
        forgotPassword: true,
        forgotPasswordOtpType: 'recovery',
      }}
      redirectTo={window.location.origin}
      footer={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: 'var(--ui-text-muted)', margin: 0 }}>
            É uma clínica?{' '}
            <Link to="/cadastro-clinica" style={{ color: 'var(--ui-info-text)', fontWeight: 500, textDecoration: 'none' }}>
              Solicite seu acesso
            </Link>
          </p>
          <Link
            to="/"
            style={{ fontSize: 12, color: 'var(--ui-text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'center', textDecoration: 'none' }}
          >
            <ArrowLeft size={12} />
            Início
          </Link>
        </div>
      }
    />
  )
}
