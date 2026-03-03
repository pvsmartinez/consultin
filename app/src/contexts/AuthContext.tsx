import { createContext, useContext, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../services/supabase'
import { primaryRole, mergedPermissions } from '../types'
import type { UserProfile, UserRole } from '../types'

interface AuthContextValue {
  session: Session | null
  profile: UserProfile | null
  role: UserRole | null
  isSuperAdmin: boolean
  loading: boolean
  recoveryMode: boolean
  clearRecoveryMode: () => void
  signInWithEmail: (email: string, password: string) => Promise<{ error: string | null }>
  signInWithGoogle: () => Promise<void>
  signInWithApple: () => Promise<void>
  signOut: () => Promise<void>
  hasPermission: (key: string) => boolean
  refreshProfile: () => Promise<void>
  // OTP password reset: send code → verify code → NovaSenhaPage takes over
  sendPasswordResetOtp: (email: string) => Promise<{ error: string | null }>
  verifyPasswordResetOtp: (email: string, token: string) => Promise<{ error: string | null }>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const PROFILE_CACHE_KEY = 'consultin_profile_cache'
// Bump this version whenever the UserProfile shape changes (new fields, renamed fields).
// Stale caches with older versions are discarded automatically on load.
const PROFILE_CACHE_VERSION = 2

function getCachedProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { version?: number; profile?: UserProfile }
    // Invalidate if version mismatch or missing
    if (parsed.version !== PROFILE_CACHE_VERSION) { localStorage.removeItem(PROFILE_CACHE_KEY); return null }
    const p = parsed.profile
    if (!p) return null
    // Legacy guard: roles must be an array
    if (!Array.isArray(p.roles)) { localStorage.removeItem(PROFILE_CACHE_KEY); return null }
    return p
  } catch { return null }
}

function setCachedProfile(p: UserProfile | null) {
  try {
    if (p) localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ version: PROFILE_CACHE_VERSION, profile: p }))
    else localStorage.removeItem(PROFILE_CACHE_KEY)
  } catch { /* ignore */ }
}

async function fetchProfile(userId: string): Promise<UserProfile | null> {
  const doFetch = () => supabase
    .from('user_profiles')
    .select('id, clinic_id, roles, name, is_super_admin, avatar_url, permission_overrides, notification_phone, notif_new_appointment, notif_cancellation, notif_no_show, notif_payment_overdue')
    .eq('id', userId)
    .single()
    .then(({ data }) => {
      if (!data) return null
      // Cast to unknown first so new DB columns (added in migration 0031) don't
      // cause compile errors when database.ts hasn't been regenerated yet.
      const d = data as unknown as Record<string, unknown>
      return {
        id:                  d.id as string,
        clinicId:            d.clinic_id as string | null,
        roles:               d.roles as UserRole[],
        name:                d.name as string,
        isSuperAdmin:        (d.is_super_admin as boolean) ?? false,
        avatarUrl:           (d.avatar_url as string | null) ?? null,
        permissionOverrides: (d.permission_overrides as Record<string, boolean>) ?? {},
        notificationPhone:   (d.notification_phone as string | null) ?? null,
        notifNewAppointment: (d.notif_new_appointment as boolean) ?? false,
        notifCancellation:   (d.notif_cancellation as boolean) ?? false,
        notifNoShow:         (d.notif_no_show as boolean) ?? false,
        notifPaymentOverdue: (d.notif_payment_overdue as boolean) ?? false,
      } as UserProfile
    })

  // Try up to 3 times with 8s timeout each, in case of transient network delay
  for (let attempt = 0; attempt < 3; attempt++) {
    const timeout = new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error('fetchProfile timeout')), 8000)
    )
    try {
      const result = await Promise.race([doFetch(), timeout])
      if (result !== null) return result
    } catch (e) {
      if (attempt === 2) throw e
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
    }
  }
  return null
}

// True when Supabase has stored a session in localStorage (user was previously logged in).
// We detect it synchronously so we can skip the loading state on page reload.
function hasCachedSession(): boolean {
  try {
    return Object.keys(localStorage).some(k => k.startsWith('sb-') && k.endsWith('-auth-token'))
  } catch { return false }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  // Seed profile from cache so UI renders instantly on reload
  const [profile, setProfile] = useState<UserProfile | null>(getCachedProfile)
  // If we have both a cached session AND a cached profile, skip the loading state entirely.
  // This prevents the "Carregando…" flash on every page reload for logged-in users.
  const [loading, setLoading] = useState(() => !(getCachedProfile() !== null && hasCachedSession()))
  // True when Supabase fires PASSWORD_RECOVERY — forces NovaSenhaPage regardless of route
  const [recoveryMode, setRecoveryMode] = useState(false)

  useEffect(() => {
    let settled = false

    const settle = () => {
      settled = true
      clearTimeout(timeout)
    }

    // Safety net: if auth never resolves (token refresh hang, network issue),
    // clear state and show login after 12s. Do NOT await signOut — it can hang too.
    const timeout = setTimeout(() => {
      if (settled) return
      console.warn('Auth timed out — clearing session')
      supabase.auth.signOut().catch(() => { /* ignore */ })
      setSession(null)
      setProfile(null)
      setCachedProfile(null)
      setLoading(false)
      settle()
    }, 12000)

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      settle()
      setSession(session)

      // Intercept password-reset flow — show change-password screen immediately
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true)
        setLoading(false)
        return
      }

      if (!session) {
        setProfile(null)
        setCachedProfile(null)
        setLoading(false)
        return
      }

      // Use cached profile to render instantly, then refresh from DB in background
      const cached = getCachedProfile()
      if (cached && cached.id === session.user.id) {
        setProfile(cached)
        setLoading(false)
      }

      try {
        const p = await fetchProfile(session.user.id)
        setProfile(p)
        setCachedProfile(p)
      } catch (e) {
        console.error('fetchProfile error:', e)
        if (!cached) { setProfile(null); setCachedProfile(null) }
      } finally {
        setLoading(false) // no-op if already false
      }
    })

    return () => { settle(); subscription.unsubscribe() }
  }, [])

  const signInWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  const signInWithGoogle = () =>
    supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } }).then(() => undefined)

  const signInWithApple = () =>
    supabase.auth.signInWithOAuth({ provider: 'apple', options: { redirectTo: window.location.origin } }).then(() => undefined)

  const signOut = async () => {
    // Clear local state immediately — never wait for network (can hang silently)
    setSession(null)
    setProfile(null)
    setCachedProfile(null)
    supabase.auth.signOut().catch(() => { /* ignore */ })
  }
  const clearRecoveryMode = () => setRecoveryMode(false)

  // Step 1: send 6-digit OTP to the user's email
  const sendPasswordResetOtp = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    })
    return { error: error?.message ?? null }
  }

  // Step 2: verify code → sets recoveryMode so App renders NovaSenhaPage
  const verifyPasswordResetOtp = async (email: string, token: string) => {
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
    if (!error) setRecoveryMode(true)
    return { error: error?.message ?? null }
  }

  const hasPermission = (key: string): boolean => {
    if (!profile) return false
    return mergedPermissions(profile.roles, profile.permissionOverrides)[key] ?? false
  }

  const refreshProfile = async () => {
    try {
      // getUser() validates the token server-side (unlike getSession which is cached)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const p = await fetchProfile(user.id)
      setProfile(p)
      setCachedProfile(p)
    } catch (e) {
      console.error('refreshProfile error:', e)
    }
  }

  return (
    <AuthContext.Provider value={{
      session, profile, role: profile ? primaryRole(profile.roles) : null, loading,
      isSuperAdmin: profile?.isSuperAdmin ?? false,
      recoveryMode, clearRecoveryMode,
      signInWithEmail, signInWithGoogle, signInWithApple, signOut, hasPermission,
      refreshProfile,
      sendPasswordResetOtp, verifyPasswordResetOtp,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext must be used inside <AuthProvider>')
  return ctx
}
