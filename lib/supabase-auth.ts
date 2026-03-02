/**
 * Server-Side Supabase Auth Helpers
 *
 * Validates JWT tokens from Authorization headers and retrieves
 * authenticated user information for API routes.
 */

import { createClient, User } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * Extract and validate the authenticated user from a request's Authorization header.
 *
 * @param request - Incoming request with Bearer token
 * @returns Authenticated user or null if invalid/missing token
 */
export async function getAuthenticatedUser(
  request: Request
): Promise<User | null> {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }

  const token = authHeader.slice(7)

  // Create a Supabase client using the user's JWT
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) {
    return null
  }

  return user
}

/**
 * Get the client IP from a request (for audit logging).
 */
export function getClientIP(request: Request): string | null {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    null
  )
}
