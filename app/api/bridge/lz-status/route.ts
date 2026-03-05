/**
 * LayerZero Status API
 *
 * Queries LayerZero Scan for cross-chain message status by source tx hash.
 * Used for Arbitrum → Hedera bridge tracking.
 *
 * GET /api/bridge/lz-status?txHash=0x...
 */

import { NextRequest, NextResponse } from 'next/server'

const LZ_SCAN_API = 'https://api-mainnet.layerzero-scan.com'

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
}

export async function GET(request: NextRequest) {
  const txHash = request.nextUrl.searchParams.get('txHash')

  if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return NextResponse.json(
      { success: false, error: 'Missing or invalid txHash parameter' },
      { status: 400, headers: securityHeaders }
    )
  }

  try {
    const response = await fetch(`${LZ_SCAN_API}/tx/${txHash}`, {
      headers: { 'Accept': 'application/json' },
    })

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { success: true, status: 'NOT_FOUND' },
          { headers: securityHeaders }
        )
      }
      throw new Error(`LayerZero Scan error: ${response.status}`)
    }

    const data = await response.json()

    if (!data.messages || data.messages.length === 0) {
      return NextResponse.json(
        { success: true, status: 'NOT_FOUND' },
        { headers: securityHeaders }
      )
    }

    const message = data.messages[0]

    return NextResponse.json({
      success: true,
      status: message.status || 'UNKNOWN',
      dstTxHash: message.dstTxHash || null,
    }, { headers: securityHeaders })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to check LZ status'
    console.error('[LZ Status] Error:', msg)
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500, headers: securityHeaders }
    )
  }
}
