/**
 * Key Rotation Endpoint
 *
 * Rotates the user's KMS signing key with Arbitrum balance safety check.
 *
 * Flow:
 * 1. Auth + rate limit
 * 2. Check Arbitrum balances (ETH + USDC) — block if funds exist
 * 3. Create new KMS key
 * 4. Update Hedera account key via AccountUpdateTransaction (signed with old key)
 * 5. Update database records
 * 6. Disable old KMS key
 * 7. Record audit log
 *
 * POST /api/kms/rotate-key
 */

import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { validateSigningRequest, recordSigningOperation, AuthError } from '@/lib/kms/rate-limiter'
import { createSigningKey, getPublicKeyHex, disableKMSKey } from '@/lib/kms/kms-client'
import { signAndExecuteAccountUpdate } from '@/lib/kms/transaction-signer'
import { deriveEvmAddress } from '@/lib/kms/evm-utils'
import { supabaseAdmin } from '@/lib/supabase'
import { ARBITRUM_CONFIG } from '@/lib/bridge/bridgeConstants'

const ERC20_BALANCE_ABI = ['function balanceOf(address) view returns (uint256)']

export async function POST(request: NextRequest) {
  let ctx

  try {
    // 1. Auth + rate limit
    ctx = await validateSigningRequest(request)

    // 2. Check Arbitrum balances before rotating
    const evmAddress = deriveEvmAddress(ctx.publicKeyHex)
    const provider = new ethers.providers.JsonRpcProvider(ARBITRUM_CONFIG.RPC_URL)

    const [ethBalance, usdcBalance] = await Promise.all([
      provider.getBalance(evmAddress),
      new ethers.Contract(ARBITRUM_CONFIG.USDC_ADDRESS, ERC20_BALANCE_ABI, provider)
        .balanceOf(evmAddress),
    ])

    const ethFormatted = ethers.utils.formatEther(ethBalance)
    const usdcFormatted = ethers.utils.formatUnits(usdcBalance, 6)

    // If funds on Arbitrum, warn user
    if (ethBalance.gt(0) || usdcBalance.gt(0)) {
      return NextResponse.json({
        warning: true,
        message: 'Funds detected on Arbitrum. Bridge them to Hedera before rotating your key.',
        balances: { eth: ethFormatted, usdc: usdcFormatted },
      })
    }

    // 3. Store old key info for audit
    const oldKmsKeyId = ctx.kmsKeyId
    const oldEvmAddress = evmAddress

    // 4. Create new KMS key
    const newKeyResult = await createSigningKey(ctx.userId)
    const newPublicKeyHex = await getPublicKeyHex(newKeyResult.keyId)
    const newEvmAddress = deriveEvmAddress(newPublicKeyHex)

    // 5. Update Hedera account key (signed with OLD key)
    const txId = await signAndExecuteAccountUpdate(
      oldKmsKeyId,
      ctx.accountId,
      ctx.publicKeyHex,
      newPublicKeyHex,
    )

    // 6. Update custodial_accounts in database
    const admin = supabaseAdmin()
    const { error: updateError } = await admin
      .from('custodial_accounts')
      .update({
        kms_key_id: newKeyResult.keyId,
        kms_key_arn: newKeyResult.keyArn,
        public_key_hex: newPublicKeyHex,
        evm_address: newEvmAddress,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', ctx.userId)

    if (updateError) {
      throw new Error(`Failed to update custodial account: ${updateError.message}`)
    }

    // 7. Disable old KMS key
    await disableKMSKey(oldKmsKeyId)

    // 8. Record audit log
    await recordSigningOperation(ctx, 'key_rotation', {
      old_kms_key_id: oldKmsKeyId,
      new_kms_key_id: newKeyResult.keyId,
      old_evm_address: oldEvmAddress,
      new_evm_address: newEvmAddress,
    }, { transactionId: txId })

    return NextResponse.json({
      success: true,
      newEvmAddress,
      hederaAccountId: ctx.accountId,
      transactionId: txId,
    })
  } catch (error: unknown) {
    const err = error as Error

    console.error('[rotate-key] Error:', err)

    if (ctx) {
      await recordSigningOperation(ctx, 'key_rotation', {}, { error: err.message }).catch(() => {})
    }

    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      )
    }

    return NextResponse.json(
      { success: false, error: err.message || 'Key rotation failed' },
      { status: 500 },
    )
  }
}
