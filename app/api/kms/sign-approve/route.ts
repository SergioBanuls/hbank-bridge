/**
 * POST /api/kms/sign-approve
 *
 * Signs and executes a token allowance approval via KMS.
 */

import { NextRequest, NextResponse } from 'next/server'
import { validateSigningRequest, recordSigningOperation, AuthError } from '@/lib/kms/rate-limiter'
import { signAndExecuteApproval } from '@/lib/kms/transaction-signer'
import type { SignApproveRequest } from '@/types/kms'

export async function POST(request: NextRequest) {
  let ctx

  try {
    // 1. Validate auth, account, and rate limits
    ctx = await validateSigningRequest(request)

    // 2. Parse request body
    const body: SignApproveRequest = await request.json()

    if (!body.tokenId || !body.amount || !body.spenderAccountId) {
      return NextResponse.json(
        { success: false, error: 'Missing required approval parameters' },
        { status: 400 }
      )
    }

    // Validate formats
    if (!/^0\.0\.\d+$/.test(body.tokenId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid token ID format' },
        { status: 400 }
      )
    }
    if (!/^0\.0\.\d+$/.test(body.spenderAccountId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid spender account ID format' },
        { status: 400 }
      )
    }

    // 3. Sign and execute
    const transactionId = await signAndExecuteApproval(
      body,
      ctx.accountId,
      ctx.kmsKeyId,
      ctx.publicKeyHex
    )

    // 4. Record success
    await recordSigningOperation(ctx, 'token_approval', {
      tokenId: body.tokenId,
      amount: body.amount,
      spender: body.spenderAccountId,
    }, { transactionId })

    return NextResponse.json({
      success: true,
      transactionId,
    })
  } catch (error: any) {
    console.error('Error in sign-approve:', error)

    if (ctx) {
      await recordSigningOperation(ctx, 'token_approval', {}, { error: error.message }).catch(() => {})
    }

    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      )
    }

    return NextResponse.json(
      { success: false, error: error.message || 'Approval failed' },
      { status: 500 }
    )
  }
}
