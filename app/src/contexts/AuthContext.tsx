import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../services/supabase'
import { QK } from '../lib/queryKeys'
import { primaryRole, mergedPermissions } from '../types'
import { gtagEvent } from '../lib/gtag'
import type { UserProfile, UserRole } from '../types'
import { mapClinic, mapProfessional } from '../utils/mappers'

interface AuthContextValue {
  session: Session | null
  profile: UserProfile | null
  role: UserRole | null
  isSuperAdmin: boolean
  loading: boolean
  recoveryMode: boolean
  clearRecoveryMode: () => void
  signOut: () => Promise<void>
  hasPermission: (key: string) => boolean
  refreshProfile: () => Promise<void>
  switchClinicContext: (clinicId: string) => Promise<void>
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

function profileFromRow(d: Record<string, unknown>): UserProfile {
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
}

async function fetchProfile(userId: string): Promise<UserProfile | null> {
  const doFetch = () => supabase
    .from('user_profiles')
    .select('id, clinic_id, roles, name, is_super_admin, avatar_url, permission_overrides, notification_phone, notif_new_appointment, notif_cancellation, notif_no_show, notif_payment_overdue')
    .eq('id', userId)
    .single()
    .then(({ data }) => {
      if (!data) return null
      const d = data as unknown as Record<string, unknown>
      return profileFromRow(d)
    })

  // null = no profile row yet (valid, don't retry). Only retry on thrown errors / timeout.
  for (let attempt = 0; attempt < 2; attempt++) {
    const timeout = new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error('fetchProfile timeout')), 3000)
    )
    try {
      return await Promise.race([doFetch(), timeout])
    } catch (e) {
      if (attempt === 1) return null   // give up; caller uses cached profile
      await new Promise(r => setTimeout(r, 500))
    }
  }
  return null
}

/**
 * Single RPC call that returns profile + clinic + professionals in one round trip.
 * Seeds the React Query cache so data pages open from cache with zero additional fetches.
 */
async function fetchStartupData(userId: string, qc: QueryClient): Promise<UserProfile | null> {
  const doFetch = async () => {
    const { data, error } = await (supabase as unknown as { rpc: (fn: string) => Promise<{ data: unknown; error: unknown }> }).rpc('get_startup_data')
    if (error) throw error
    const payload = data as { profile: Record<string, unknown> | null; clinic: Record<string, unknown> | null; professionals: Record<string, unknown>[] }
    if (!payload?.profile) return null

    const profile = profileFromRow(payload.profile)

    // Seed React Query cache so hooks find data immediately
    if (profile.clinicId) {
      if (payload.clinic) {
        qc.setQueryData(QK.clinic.detail(profile.clinicId), mapClinic(payload.clinic))
      }
      const professionals = (payload.professionals ?? []).map(mapProfessional)
      qc.setQueryData(QK.professionals.list(profile.clinicId), professionals)

      // Pre-seed the current user's own professional records so AppointmentsPage
      // can render without waiting for an additional useMyProfessionalRecords query.
      // This eliminates the cascade: startup → prof-records → appointments.
      const clinicName = payload.clinic ? (mapClinic(payload.clinic) as { name: string }).name : null
      const myProfRecords = professionals
        .filter(p => p.userId === userId)
        .map(p => ({ id: p.id, clinicId: p.clinicId, clinicName }))
      // Only seed when we have a result — empty means "still unknown" (email-only legacy records)
      if (myProfRecords.length > 0) {
        qc.setQueryData(QK.professionals.my(userId), myProfRecords)
      }
    }

    return profile
  }

  // null = no profile row yet (valid state — new user). Return immediately.
  // Only retry on thrown errors (network error, timeout). Max 2 attempts, 3s each.
  // No fallback to fetchProfile — if the RPC is unreachable the caller uses the
  // cached profile and we avoid blocking the UI for an extra 6+ seconds.
  for (let attempt = 0; attempt < 2; attempt++) {
    const timeout = new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error('fetchStartupData timeout')), 3000)
    )
    try {
      return await Promise.race([doFetch(), timeout])
    } catch (e) {
      if (attempt === 1) return null   // give up; caller falls back to cached profile
      await new Promise(r => setTimeout(r, 500))
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
  const qc = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  // Seed profile from cache so UI renders instantly on reload
  const [profile, setProfile] = useState<UserProfile | null>(getCachedProfile)
  // If we have both a cached session AND a cached profile, skip the loading state entirely.
  // This prevents the "Carregando…" flash on every page reload for logged-in users.
  const [loading, setLoading] = useState(() => !(getCachedProfile() !== null && hasCachedSession()))
  // True when Supabase fires PASSWORD_RECOVERY — forces NovaSenhaPage regardless of route
  const [recoveryMode, setRecoveryMode] = useState(false)

  // Guard: prevent concurrent fetchStartupData calls in React Strict Mode (double-effect)
  // and on rapid re-subscriptions. Persists across Strict Mode re-runs (same component ref).
  const startupFetchInProgressRef = useRef(false)

  useEffect(() => {
    let settled = false

    const settle = () => {
      settled = true
      clearTimeout(timeout)
    }

    // Safety net: if auth never resolves (token refresh hang, network issue),
    // clear state and show login after 5s. Do NOT await signOut — it can hang too.
    const timeout = setTimeout(() => {
      if (settled) return
      console.warn('Auth timed out — clearing session')
      supabase.auth.signOut().catch(() => { /* ignore */ })
      setSession(null)
      setProfile(null)
      setCachedProfile(null)
      setLoading(false)
      settle()
    }, 5000)

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

      // TOKEN_REFRESHED / USER_UPDATED: JWT rotated but profile is unchanged.
      // Just keep the session fresh — no need to re-seed the React Query cache
      // with another round-trip to the DB.
      if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        setLoading(false)
        return
      }

      if (event === 'SIGNED_IN') {
        gtagEvent('login', { method: session.user.app_metadata?.provider ?? 'email' })
      }

      // Prevent concurrent startup fetches (React Strict Mode runs effects twice).
      if (startupFetchInProgressRef.current) {
        setLoading(false)
        return
      }
      startupFetchInProgressRef.current = true

      // Use cached profile to render instantly, then refresh from DB in background
      const cached = getCachedProfile()
      if (cached && cached.id === session.user.id) {
        setProfile(cached)
        setLoading(false)
      }

      try {
        const p = await fetchStartupData(session.user.id, qc)
        // fetchStartupData returns null on DB failure — fall back to cached profile
        setProfile(p ?? cached)
        if (p) setCachedProfile(p)
        else if (!cached) setCachedProfile(null)
      } catch (e) {
        console.error('fetchStartupData error:', e)
        if (!cached) { setProfile(null); setCachedProfile(null) }
      } finally {
        startupFetchInProgressRef.current = false
        setLoading(false) // no-op if already false
      }
    })

    return () => { settle(); subscription.unsubscribe() }
  }, [])

  const signOut = async () => {
    // Clear local state immediately — never wait for network (can hang silently)
    setSession(null)
    setProfile(null)
    setCachedProfile(null)
    supabase.auth.signOut().catch(() => { /* ignore */ })
  }
  const clearRecoveryMode = () => setRecoveryMode(false)

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

  const switchClinicContext = async (clinicId: string) => {
    if (!session?.user.id || !profile || clinicId === profile.clinicId) return

    const { data, error } = await supabase.rpc('switch_patient_clinic', {
      target_clinic_id: clinicId,
    })
    if (error) throw error
    if (!data) throw new Error('Perfil não retornado ao trocar de clínica')

    const next = profileFromRow(data as unknown as Record<string, unknown>)
    setProfile(next)
    setCachedProfile(next)
    qc.clear()
    qc.setQueryData(QK.patients.clinics(session.user.id, next.clinicId), undefined)
  }

  return (
    <AuthContext.Provider value={{
      session, profile, role: profile ? primaryRole(profile.roles) : null, loading,
      isSuperAdmin: profile?.isSuperAdmin ?? false,
      recoveryMode, clearRecoveryMode,
      signOut, hasPermission,
      refreshProfile,
      switchClinicContext,
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
