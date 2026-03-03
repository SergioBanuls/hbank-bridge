/**
 * GET /api/kms/account-info
 *
 * Returns custodial account information for the authenticated user.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/supabase-auth'
import { supabaseAdmin, TABLES } from '@/lib/supabase'
import { deriveEvmAddress } from '@/lib/kms/evm-utils'

export async function GET(request: NextRequest) {
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

    // 2. Get custodial account
    const { data: account } = await db
      .from(TABLES.CUSTODIAL_ACCOUNTS)
      .select('id, hedera_account_id, public_key_hex, evm_address, status, created_at')
      .eq('user_id', user.id)
      .single()

    if (!account) {
      return NextResponse.json({
        success: true,
        account: null,
      })
    }

    // Derive and persist EVM address if missing (backfill for pre-existing accounts)
    let evmAddress = account.evm_address
    if (!evmAddress && account.public_key_hex) {
      evmAddress = deriveEvmAddress(account.public_key_hex)
      await db
        .from(TABLES.CUSTODIAL_ACCOUNTS)
        .update({ evm_address: evmAddress })
        .eq('id', account.id)
    }

    return NextResponse.json({
      success: true,
      account: {
        hederaAccountId: account.hedera_account_id,
        publicKeyHex: account.public_key_hex,
        evmAddress,
        status: account.status,
        createdAt: account.created_at,
      },
    })
  } catch (error: any) {
    console.error('Error getting account info:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to get account info' },
      { status: 500 }
    )
  }
}
