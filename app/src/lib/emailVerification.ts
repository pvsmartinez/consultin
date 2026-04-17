import type { Session } from '@supabase/supabase-js'
import { publicSupabase, supabase } from '../services/supabase'

export const EMAIL_VERIFICATION_PATH = '/email-verificado'

export function isEmailVerificationPending(session: Session | null): boolean {
  if (!session?.user?.email) return false
  if (session.user.app_metadata?.provider !== 'email') return false
  return !session.user.user_metadata?.email_verified_at
}

export async function sendEmailVerificationLink(email: string) {
  const redirectOrigin = typeof window !== 'undefined'
    ? window.location.origin
    : 'https://app.consultin.com.br'

  return publicSupabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${redirectOrigin}${EMAIL_VERIFICATION_PATH}`,
    },
  })
}

export async function markEmailAsVerified(session: Session) {
  const nextMetadata = {
    ...(session.user.user_metadata ?? {}),
    email_verified_at: new Date().toISOString(),
  }

  return supabase.auth.updateUser({ data: nextMetadata })
}