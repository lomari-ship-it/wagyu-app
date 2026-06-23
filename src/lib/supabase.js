import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Missing Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export const OWNERS = ['J.A Delport', 'J.H.T Delport', 'D.B Delport']

export const NAMLITS_OWNERS = ['Kalahari Wagyu', 'Kitai Abattoir', 'J.A Delport', 'J.H.T Delport', 'D.B Delport']
