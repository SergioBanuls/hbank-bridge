/**
 * POST /api/kms/create-account
 *
 * Creates a KMS key and Hedera account for an authenticated custodial user.
 * Each user can only have one custodial account.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, getClientIP } from '@/lib/supabase-auth'
import { supabaseAdmin, TABLES } from '@/lib/supabase'
import { createSigningKey } from '@/lib/kms/kms-client'
import { createHederaAccountWithKMSKey } from '@/lib/kms/hedera-account'
import { deriveEvmAddress } from '@/lib/kms/evm-utils'

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const db = supabaseAdmin()

    // 2. Check if user already has a custodial account
    const { data: existing } = await db
      .from(TABLES.CUSTODIAL_ACCOUNTS)
      .select('hedera_account_id')
      .eq('user_id', user.id)
      .single()

    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Custodial account already exists' },
        { status: 409 }
      )
    }

    // 3. Create KMS key
    console.log(`Creating KMS key for user ${user.id}...`)
    const kmsKey = await createSigningKey(user.id)

    // 4. Create Hedera account with KMS public key
    console.log(`Creating Hedera account with KMS key ${kmsKey.keyId}...`)
    const { accountId: hederaAccountId, transactionId } = await createHederaAccountWithKMSKey(kmsKey.publicKeyHex)

    // 5. Derive EVM address from public key
    const evmAddress = deriveEvmAddress(kmsKey.publicKeyHex)

    // 6. Store in database
    const { error: insertError } = await db
      .from(TABLES.CUSTODIAL_ACCOUNTS)
      .insert({
        user_id: user.id,
        hedera_account_id: hederaAccountId,
        kms_key_id: kmsKey.keyId,
        kms_key_arn: kmsKey.keyArn,
        public_key_hex: kmsKey.publicKeyHex,
        evm_address: evmAddress,
        status: 'active',
      })

    if (insertError) {
      console.error('Failed to store custodial account:', insertError)
      throw new Error('Failed to store custodial account')
    }

    // 6. Initialize rate limits
    await db.from(TABLES.KMS_RATE_LIMITS).insert({
      user_id: user.id,
    })

    // 7. Audit log
    await db.from(TABLES.KMS_SIGNING_AUDIT).insert({
      user_id: user.id,
      transaction_type: 'account_create',
      transaction_id: transactionId,
      transaction_params: { hedera_account_id: hederaAccountId } as any,
      kms_key_id: kmsKey.keyId,
      ip_address: getClientIP(request),
      status: 'success',
    })

    return NextResponse.json({
      success: true,
      hederaAccountId,
      publicKeyHex: kmsKey.publicKeyHex,
    })
  } catch (error: any) {
    console.error('Error creating custodial account:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create account' },
      { status: 500 }
    )
  }
}
