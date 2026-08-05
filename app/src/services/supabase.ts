import { createSupabaseClient } from '@pvsmartinez/shared'
import type { Database } from '../types/database'

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createSupabaseClient<Database>(supabaseUrl, supabaseAnonKey)

/**
 * Anonymous client for public (unauthenticated) endpoints.
 *
 * `storageKey` must differ from the main client's. GoTrue derives its cross-tab lock
 * name from the storage key, so two clients sharing the default key contend for the
 * same lock — which stalled `get_startup_data()` past the 5s auth timeout on startup
 * even though the request itself answered in ~70ms. It is also what produced the
 * "Multiple GoTrueClient instances detected in the same browser context" warning.
 */
export const publicSupabase = createSupabaseClient<Database>(supabaseUrl, supabaseAnonKey, {
	clientOptions: {
		auth: {
			persistSession: false,
			autoRefreshToken: false,
			detectSessionInUrl: false,
			storageKey: 'consultin-public-anon',
		},
	},
})

