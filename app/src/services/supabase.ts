import { createSupabaseClient } from '@pvsmartinez/shared'
import type { Database } from '../types/database'

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createSupabaseClient<Database>(supabaseUrl, supabaseAnonKey)

