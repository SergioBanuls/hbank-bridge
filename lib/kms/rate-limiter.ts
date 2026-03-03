/**
 * Rate Limiter for KMS Signing Operations
 *
 * Enforces per-user rate limits on custodial signing operations.
 */

import { supabaseAdmin, TABLES } from '@/lib/supabase'
import { getAuthenticatedUser, getClientIP } from '@/lib/supabase-auth'
import type { KMSTransactionType } from '@/types/kms'

const MAX_TX_PER_HOUR = parseInt(process.env.CUSTODIAL_MAX_TX_PER_HOUR || '10', 10)
const MAX_TX_PER_DAY = parseInt(process.env.CUSTODIAL_MAX_TX_PER_DAY || '50', 10)

export interface SigningContext {
  userId: string
  accountId: string
  kmsKeyId: string
  publicKeyHex: string
  ip: string | null
}

/**
 * Validate a signing request: auth, account lookup, rate limits.
 * Returns the signing context or throws an error.
 */
export async function validateSigningRequest(
  request: Request
): Promise<SigningContext> {
  // 1. Authenticate
  const user = await getAuthenticatedUser(request)
  if (!user) {
    throw new AuthError('Unauthorized', 401)
  }

  const db = supabaseAdmin()

  // 2. Get custodial account
  const { data: account } = await db
    .from(TABLES.CUSTODIAL_ACCOUNTS)
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!account || account.status !== 'active') {
    throw new AuthError('No active custodial account', 400)
  }

  // 3. Check rate limits
  const { data: rateLimit } = await db
    .from(TABLES.KMS_RATE_LIMITS)
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (rateLimit) {
    const now = new Date()
    const lastReset1h = new Date(rateLimit.last_reset_1h || now.toISOString())
    const lastReset24h = new Date(rateLimit.last_reset_24h || now.toISOString())

    // Reset hourly counter if > 1 hour
    let count1h = rateLimit.signing_count_1h ?? 0
    if (now.getTime() - lastReset1h.getTime() > 3600000) {
      count1h = 0
      await db
        .from(TABLES.KMS_RATE_LIMITS)
        .update({ signing_count_1h: 0, last_reset_1h: now.toISOString() })
        .eq('user_id', user.id)
    }

    // Reset daily counter if > 24 hours
    let count24h = rateLimit.signing_count_24h ?? 0
    if (now.getTime() - lastReset24h.getTime() > 86400000) {
      count24h = 0
      await db
        .from(TABLES.KMS_RATE_LIMITS)
        .update({ signing_count_24h: 0, last_reset_24h: now.toISOString() })
        .eq('user_id', user.id)
    }

    if (count1h >= MAX_TX_PER_HOUR) {
      throw new AuthError(`Rate limit exceeded: max ${MAX_TX_PER_HOUR} transactions per hour`, 429)
    }
    if (count24h >= MAX_TX_PER_DAY) {
      throw new AuthError(`Rate limit exceeded: max ${MAX_TX_PER_DAY} transactions per day`, 429)
    }
  }

  return {
    userId: user.id,
    accountId: account.hedera_account_id,
    kmsKeyId: account.kms_key_id,
    publicKeyHex: account.public_key_hex,
    ip: getClientIP(request),
  }
}

/**
 * Record a signing operation in the audit log and increment rate limit counters.
 */
export async function recordSigningOperation(
  ctx: SigningContext,
  txType: KMSTransactionType,
  txParams: Record<string, unknown>,
  result: { transactionId?: string; error?: string }
) {
  const db = supabaseAdmin()

  // Audit log
  await db.from(TABLES.KMS_SIGNING_AUDIT).insert({
    user_id: ctx.userId,
    transaction_type: txType,
    transaction_id: result.transactionId || null,
    transaction_params: txParams as any,
    kms_key_id: ctx.kmsKeyId,
    ip_address: ctx.ip,
    status: result.error ? 'failed' : 'success',
    error_message: result.error || null,
  })

  // Increment rate limit counters (only on success) via RPC
  if (!result.error) {
    await db.rpc('increment_rate_limits', { p_user_id: ctx.userId })
  }
}

/**
 * Custom error class with HTTP status code.
 */
export class AuthError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}
