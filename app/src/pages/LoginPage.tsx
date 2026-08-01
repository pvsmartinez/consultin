import { AuthScreen } from '@pvsmartinez/shared'
import { ArrowLeft } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { buildAttributedPath } from '../lib/publicAttribution'
import { supabase } from '../services/supabase'
import { Seo } from '../components/seo/Seo'
import WhatsAppOtpPanel from '../components/auth/WhatsAppOtpPanel'
import { CONSULTIN_AUTH_BRAND, CONSULTIN_AUTH_THEME } from '../lib/authUi'

export default function LoginPage() {
  const signupPath = buildAttributedPath('/cadastro-clinica')

  return (
    <>
      <Seo
        title="Login | Consultin"
        description="Acesse sua conta no Consultin para gerenciar agenda, pacientes, financeiro e operação da clínica."
        canonicalPath="/login"
        noindex
      />
      <AuthScreen
        supabase={supabase}
        brand={CONSULTIN_AUTH_BRAND}
        theme={CONSULTIN_AUTH_THEME}
        features={{
          google: true,
          apple: true,
          signUp: false,
          forgotPassword: true,
          forgotPasswordOtpType: 'recovery',
        }}
        redirectTo={window.location.origin}
        footer={
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'center' }}>
            <WhatsAppOtpPanel />
            <p style={{ fontSize: 12, color: 'var(--ui-text-muted)', margin: 0 }}>
              É uma clínica?{' '}
              <Link to={signupPath} style={{ color: 'var(--ui-info-text)', fontWeight: 500, textDecoration: 'none' }}>
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
    </>
  )
}
