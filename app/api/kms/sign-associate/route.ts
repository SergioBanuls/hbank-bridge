/**
 * POST /api/kms/sign-associate
 *
 * Signs and executes a token association transaction via KMS.
 */

import { NextRequest, NextResponse } from 'next/server'
import { validateSigningRequest, recordSigningOperation, AuthError } from '@/lib/kms/rate-limiter'
import { signAndExecuteAssociation } from '@/lib/kms/transaction-signer'
import type { SignAssociateRequest } from '@/types/kms'

export async function POST(request: NextRequest) {
  let ctx

  try {
    // 1. Validate auth, account, and rate limits
    ctx = await validateSigningRequest(request)

    // 2. Parse request body
    const body: SignAssociateRequest = await request.json()

    if (!body.tokenId) {
      return NextResponse.json(
        { success: false, error: 'Missing tokenId' },
        { status: 400 }
      )
    }

    // Validate token ID format (0.0.X)
    if (!/^0\.0\.\d+$/.test(body.tokenId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid token ID format' },
        { status: 400 }
      )
    }

    // 3. Sign and execute
    const transactionId = await signAndExecuteAssociation(
      body,
      ctx.accountId,
      ctx.kmsKeyId,
      ctx.publicKeyHex
    )

    // 4. Record success
    await recordSigningOperation(ctx, 'token_association', {
      tokenId: body.tokenId,
    }, { transactionId }).catch(err => console.warn('Failed to record association audit:', err))

    return NextResponse.json({
      success: true,
      transactionId,
    })
  } catch (error: any) {
    console.error('Error in sign-associate:', error)

    if (ctx) {
      await recordSigningOperation(ctx, 'token_association', {}, { error: error.message }).catch(() => {})
    }

    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      )
    }

    // Handle "already associated" gracefully
    if (error.message?.includes('TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT')) {
      return NextResponse.json({
        success: true,
        transactionId: null,
        alreadyAssociated: true,
      })
    }

    return NextResponse.json(
      { success: false, error: error.message || 'Association failed' },
      { status: 500 }
    )
  }
}
