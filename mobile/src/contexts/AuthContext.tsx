import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../services/supabase'

export interface UserProfile {
  id: string
  clinicId: string | null
  name: string
  roles: string[]
  isSuperAdmin: boolean
  avatarUrl: string | null
}

interface AuthContextValue {
  session: Session | null
  profile: UserProfile | null
  loading: boolean
  signOut: () => Promise<void>
}

const PROFILE_CACHE_KEY = 'consultin_mobile_profile_v1'

function rowToProfile(d: Record<string, unknown>): UserProfile {
  return {
    id:          d.id as string,
    clinicId:    (d.clinic_id as string | null) ?? null,
    name:        d.name as string,
    roles:       (d.roles as string[]) ?? [],
    isSuperAdmin:(d.is_super_admin as boolean) ?? false,
    avatarUrl:   (d.avatar_url as string | null) ?? null,
  }
}

async function fetchProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, clinic_id, roles, name, is_super_admin, avatar_url')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return rowToProfile(data as unknown as Record<string, unknown>)
}

const AuthCtx = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  // Load cached profile on mount so UI doesn't flash blank on app resume
  useEffect(() => {
    AsyncStorage.getItem(PROFILE_CACHE_KEY).then(raw => {
      if (raw) {
        try { setProfile(JSON.parse(raw) as UserProfile) } catch { /* stale cache */ }
      }
    })
  }, [])

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_, s) => {
      setSession(s)

      if (s?.user) {
        try {
          const p = await fetchProfile(s.user.id)
          setProfile(p)
          if (p) await AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(p))
          else await AsyncStorage.removeItem(PROFILE_CACHE_KEY)
        } catch (e) {
          console.error('[AuthContext] fetchProfile error', e)
        }
      } else {
        setProfile(null)
        await AsyncStorage.removeItem(PROFILE_CACHE_KEY)
      }

      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut({ scope: 'local' })
    setProfile(null)
    await AsyncStorage.removeItem(PROFILE_CACHE_KEY)
  }, [])

  return (
    <AuthCtx.Provider value={{ session, profile, loading, signOut }}>
      {children}
    </AuthCtx.Provider>
  )
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuthContext must be inside <AuthProvider>')
  return ctx
}
