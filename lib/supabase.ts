/**
 * Supabase Client Configuration
 * 
 * Provides both client-side and server-side Supabase clients
 * for interacting with the database.
 */

import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase.types'

// Ensure environment variables are set
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL is missing')
  throw new Error('NEXT_PUBLIC_SUPABASE_URL is required')
}

if (!supabaseAnonKey) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_ANON_KEY is missing')
  throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is required')
}

console.log('✅ Supabase URL:', supabaseUrl)
console.log('✅ Supabase Anon Key:', supabaseAnonKey.substring(0, 20) + '...')

/**
 * Client-side Supabase client (non-auth, for public queries)
 * Uses anon key for public access with RLS policies
 */
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
  },
})

/**
 * Auth-aware client-side Supabase client
 * Persists sessions for custodial auth (email/OAuth)
 */
export const supabaseAuth = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

/**
 * Server-side Supabase client
 * Uses service role key for admin access (bypasses RLS)
 * Should only be used in API routes or server components
 */
export const supabaseAdmin = () => {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. Required for admin operations.'
    )
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

/**
 * Type-safe table references
 */
export const TABLES = {
  CUSTODIAL_ACCOUNTS: 'custodial_accounts',
  KMS_SIGNING_AUDIT: 'kms_signing_audit',
  KMS_RATE_LIMITS: 'kms_rate_limits',
} as const
