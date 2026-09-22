import { createClient } from '@supabase/supabase-js'
import { createRetryingFetch } from '@/lib/retry-fetch'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const isBrowser = typeof window !== 'undefined'
const isConfigured = Boolean(supabaseUrl && supabaseAnonKey)

if (!isConfigured) {
  console.error('Supabase deployment configuration is missing: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
}

const clientUrl = isBrowser
  ? new URL('/supabase-proxy', window.location.origin).toString().replace(/\/$/, '')
  : (supabaseUrl ?? 'https://invalid.supabase.local')

export const supabase = createClient(clientUrl, supabaseAnonKey ?? 'missing-anon-key', {
  global: {
    fetch: createRetryingFetch(fetch),
  },
})
