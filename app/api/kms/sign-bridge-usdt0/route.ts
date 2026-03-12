/**
 * POST /api/kms/sign-bridge-usdt0
 *
 * Signs and executes a USDT0 bridge (Hedera -> Arbitrum) via OFT.send().
 * First executes HTS approval to OFT contract, then calls OFT.send().
 */

import { NextRequest, NextResponse } from 'next/server'
import { validateSigningRequest, recordSigningOperation, AuthError } from '@/lib/kms/rate-limiter'
import { signAndExecuteUsdt0Approval, signAndExecuteUsdt0Bridge } from '@/lib/kms/transaction-signer'
import type { SignBridgeUsdt0Request } from '@/types/kms'

export async function POST(request: NextRequest) {
  let ctx

  try {
    // 1. Validate auth, account, and rate limits
    ctx = await validateSigningRequest(request)

    // 2. Parse and validate request body
    const body: SignBridgeUsdt0Request = await request.json()

    if (!body.amount || !body.receiverAddress || body.lzFeeHbar === undefined) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters: amount, receiverAddress, lzFeeHbar' },
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

    // 3. Execute HTS approval for OFT contract
    await signAndExecuteUsdt0Approval(
      body.amount,
      ctx.accountId,
      ctx.kmsKeyId,
      ctx.publicKeyHex
    )

    // 4. Execute OFT.send() bridge transaction
    const transactionId = await signAndExecuteUsdt0Bridge(
      body,
      ctx.accountId,
      ctx.kmsKeyId,
      ctx.publicKeyHex
    )

    // 5. Record audit
    await recordSigningOperation(ctx, 'bridge_usdt0', {
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
    console.error('Error in sign-bridge-usdt0:', error)

    if (ctx) {
      await recordSigningOperation(ctx, 'bridge_usdt0', {}, { error: error.message }).catch(() => {})
    }

    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      )
    }

    const msg = error.message || 'USDT0 bridge failed'
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
