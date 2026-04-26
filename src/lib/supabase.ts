import { createClient } from '@supabase/supabase-js'

const isBrowser = typeof window !== 'undefined'
const supabaseUrl = isBrowser ? '/api/db' : import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // TODO: 后续可替换成更友好的 UI 引导
  console.warn('Supabase env is missing. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '')
