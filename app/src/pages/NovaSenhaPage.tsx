import { PasswordSetupScreen } from '@pvsmartinez/shared'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { useAuthContext } from '../contexts/AuthContext'
import { CONSULTIN_AUTH_BRAND, CONSULTIN_AUTH_THEME } from '../lib/authUi'

export default function NovaSenhaPage() {
  const { clearRecoveryMode, refreshProfile } = useAuthContext()
  const navigate = useNavigate()

  // Detect if this is from an invite link (first access) or a password reset
  const isInvite = typeof window !== 'undefined' && window.location.hash.includes('type=invite')

  return (
    <PasswordSetupScreen
      supabase={supabase}
      brand={CONSULTIN_AUTH_BRAND}
      theme={CONSULTIN_AUTH_THEME}
      mode={isInvite ? 'invite' : 'recovery'}
      onSuccess={async () => {
        await refreshProfile()
        window.setTimeout(() => clearRecoveryMode(), 2500)
      }}
      onBackToLogin={async () => {
        await supabase.auth.signOut()
        clearRecoveryMode()
        navigate('/login', { replace: true })
      }}
    />
  )
}
