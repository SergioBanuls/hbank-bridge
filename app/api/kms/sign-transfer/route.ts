/**
 * POST /api/kms/sign-transfer
 *
 * Signs and executes an HBAR or HTS token transfer via KMS.
 */

import { NextRequest, NextResponse } from 'next/server'
import { validateSigningRequest, recordSigningOperation, AuthError } from '@/lib/kms/rate-limiter'
import { signAndExecuteTransfer } from '@/lib/kms/transaction-signer'
import type { SignTransferRequest } from '@/types/kms'

export async function POST(request: NextRequest) {
  let ctx

  try {
    // 1. Validate auth, account, and rate limits
    ctx = await validateSigningRequest(request)

    // 2. Parse request body
    const body: SignTransferRequest = await request.json()

    if (!body.recipientAccountId || !body.amount) {
      return NextResponse.json(
        { success: false, error: 'Missing required transfer parameters' },
        { status: 400 }
      )
    }

    // Validate recipient format
    if (!/^0\.0\.\d+$/.test(body.recipientAccountId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid recipient account ID format' },
        { status: 400 }
      )
    }

    // Validate token ID format if provided
    if (body.tokenId && !/^0\.0\.\d+$/.test(body.tokenId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid token ID format' },
        { status: 400 }
      )
    }

    // Token transfers require decimals
    if (body.tokenId && body.decimals === undefined) {
      return NextResponse.json(
        { success: false, error: 'Decimals required for token transfers' },
        { status: 400 }
      )
    }

    // 3. Sign and execute
    const transactionId = await signAndExecuteTransfer(
      body,
      ctx.accountId,
      ctx.kmsKeyId,
      ctx.publicKeyHex
    )

    // 4. Record success
    await recordSigningOperation(ctx, 'transfer', {
      recipientAccountId: body.recipientAccountId,
      amount: body.amount,
      tokenId: body.tokenId,
    }, { transactionId }).catch(err => console.warn('Failed to record transfer audit:', err))

    return NextResponse.json({
      success: true,
      transactionId,
    })
  } catch (error: any) {
    console.error('Error in sign-transfer:', error)

    if (ctx) {
      await recordSigningOperation(ctx, 'transfer', {}, { error: error.message }).catch(() => {})
    }

    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      )
    }

    return NextResponse.json(
      { success: false, error: error.message || 'Transfer failed' },
      { status: 500 }
    )
  }
}
