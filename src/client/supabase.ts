import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl: string = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey: string = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'placeholder'

// Main client — DB, Auth, Realtime on user's own Supabase project
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

// Edge function client — functions are hosted on the platform project
const functionsUrl: string = process.env.EXPO_PUBLIC_FUNCTIONS_URL || supabaseUrl
const functionsAnonKey: string = process.env.EXPO_PUBLIC_FUNCTIONS_ANON_KEY || supabaseAnonKey

export const fnClient = createClient(functionsUrl, functionsAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
})
