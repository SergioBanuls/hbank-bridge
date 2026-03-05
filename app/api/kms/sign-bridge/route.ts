/**
 * POST /api/kms/sign-bridge
 *
 * Builds, signs (via KMS), and executes a bridge transaction server-side.
 * First executes HTS approval (10x amount), then the bridge contract call.
 */

import { NextRequest, NextResponse } from 'next/server'
import { validateSigningRequest, recordSigningOperation, AuthError } from '@/lib/kms/rate-limiter'
import { signAndExecuteBridgeApproval, signAndExecuteBridge } from '@/lib/kms/transaction-signer'
import type { SignBridgeRequest } from '@/types/kms'

export async function POST(request: NextRequest) {
  let ctx

  try {
    // 1. Validate auth, account, and rate limits
    ctx = await validateSigningRequest(request)

    // 2. Parse and validate request body
    const body: SignBridgeRequest = await request.json()

    if (!body.amount || !body.receiverAddress || body.lzFeeHbar === undefined) {
      return NextResponse.json(
        { success: false, error: 'Missing required bridge parameters: amount, receiverAddress, lzFeeHbar' },
        { status: 400 }
      )
    }

    const amountFloat = parseFloat(body.amount)
    if (isNaN(amountFloat) || amountFloat <= 0) {
      return NextResponse.json(
        { success: false, error: 'Amount must be a positive number' },
        { status: 400 }
      )
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(body.receiverAddress)) {
      return NextResponse.json(
        { success: false, error: 'Invalid receiver address' },
        { status: 400 }
      )
    }

    // 3. Execute HTS approval for bridge contract
    await signAndExecuteBridgeApproval(
      body.amount,
      ctx.accountId,
      ctx.kmsKeyId,
      ctx.publicKeyHex
    )

    // 4. Execute bridge transaction
    const transactionId = await signAndExecuteBridge(
      body,
      ctx.accountId,
      ctx.kmsKeyId,
      ctx.publicKeyHex
    )

    // 5. Record success
    await recordSigningOperation(ctx, 'bridge', {
      amount: body.amount,
      receiverAddress: body.receiverAddress,
      requestGasDrop: body.requestGasDrop,
      lzFeeHbar: body.lzFeeHbar,
    }, { transactionId })

    return NextResponse.json({
      success: true,
      transactionId,
    })
  } catch (error: any) {
    console.error('Error in sign-bridge:', error)

    if (ctx) {
      await recordSigningOperation(ctx, 'bridge', {}, { error: error.message }).catch(() => {})
    }

    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      )
    }

    const msg = error.message || 'Bridge failed'
    if (msg.includes('INSUFFICIENT_PAYER_BALANCE')) {
      return NextResponse.json(
        { success: false, error: 'Insufficient HBAR to pay bridge fees. Send HBAR to your Hedera account first.' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    )
  }
}
