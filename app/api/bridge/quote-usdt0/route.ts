/**
 * USDT0 Bridge Quote API (bidirectional)
 *
 * Calls OFT.quoteSend() on the source chain to get LayerZero messaging fee.
 *
 * POST /api/bridge/quote-usdt0
 * Body: { amount: "100", receiver: "0x...", direction: "hedera_to_arbitrum"|"arbitrum_to_hedera", requestGasDrop?: boolean }
 * Returns: { success: true, nativeFee: "...", nativeFeeFormatted: "..." }
 */

import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { OFT_ABI, USDT0_HEDERA, USDT0_ARBITRUM, USDT0_LZ_CONFIG, buildSendParam } from '@/lib/bridge/usdt0Constants'
import { getArbitrumProvider } from '@/lib/bridge/arbitrumRpc'

const HEDERA_RPC = process.env.HEDERA_RPC_URL || 'https://mainnet.hashio.io/api'

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
}

export async function POST(request: NextRequest) {
  try {
    let body: {
      amount: string
      receiver: string
      direction: 'hedera_to_arbitrum' | 'arbitrum_to_hedera'
      requestGasDrop?: boolean
    }

    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON' },
        { status: 400, headers: securityHeaders }
      )
    }

    if (!body.amount || !body.receiver || !body.direction) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: amount, receiver, direction' },
        { status: 400, headers: securityHeaders }
      )
    }

    if (!ethers.utils.isAddress(body.receiver)) {
      return NextResponse.json(
        { success: false, error: 'Invalid receiver address' },
        { status: 400, headers: securityHeaders }
      )
    }

    const amountFloat = parseFloat(body.amount)
    if (isNaN(amountFloat) || amountFloat <= 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid amount' },
        { status: 400, headers: securityHeaders }
      )
    }

    const amountRaw = Math.floor(amountFloat * 1_000_000) // 6 decimals
    const requestGasDrop = body.requestGasDrop || false
    const isHederaToArb = body.direction === 'hedera_to_arbitrum'

    // Build SendParam
    const dstEid = isHederaToArb ? USDT0_LZ_CONFIG.ARBITRUM_EID : USDT0_LZ_CONFIG.HEDERA_EID
    const sendParam = buildSendParam(dstEid, body.receiver, amountRaw, requestGasDrop)

    // Encode quoteSend call
    const iface = new ethers.utils.Interface(OFT_ABI)
    const calldata = iface.encodeFunctionData('quoteSend', [
      [
        sendParam.dstEid,
        sendParam.to,
        sendParam.amountLD,
        sendParam.minAmountLD,
        sendParam.extraOptions,
        sendParam.composeMsg,
        sendParam.oftCmd,
      ],
      false, // payInLzToken
    ])

    // Determine which OFT contract to use and get provider
    let oftAddress: string
    let provider: ethers.providers.JsonRpcProvider

    if (isHederaToArb) {
      oftAddress = USDT0_HEDERA.OFT_ADDRESS
      provider = new ethers.providers.JsonRpcProvider(
        { url: HEDERA_RPC, skipFetchSetup: true },
        295
      )
    } else {
      oftAddress = USDT0_ARBITRUM.OFT_ADDRESS
      provider = await getArbitrumProvider()
    }

    // Call quoteSend via ethers provider
    const oftContract = new ethers.Contract(oftAddress, OFT_ABI, provider)
    const messagingFee = await oftContract.quoteSend(
      [
        sendParam.dstEid,
        sendParam.to,
        sendParam.amountLD,
        sendParam.minAmountLD,
        sendParam.extraOptions,
        sendParam.composeMsg,
        sendParam.oftCmd,
      ],
      false
    )
    const nativeFee = messagingFee.nativeFee || messagingFee[0]

    // Format fee based on direction
    let nativeFeeFormatted: string
    if (isHederaToArb) {
      // Hedera OFT quoteSend returns nativeFee in tinybars (10^-8 HBAR)
      nativeFeeFormatted = `${(Number(nativeFee) / 1e8).toFixed(4)} HBAR`
    } else {
      // Arbitrum: fee in wei (18 decimals)
      nativeFeeFormatted = `${ethers.utils.formatEther(nativeFee)} ETH`
    }

    return NextResponse.json({
      success: true,
      nativeFee: nativeFee.toString(),
      nativeFeeFormatted,
      direction: body.direction,
    }, { headers: securityHeaders })
  } catch (error) {
    const err = error as { message?: string; reason?: string }
    const message = err.message || 'Failed to get USD₮0 quote'
    console.error('[USDT0 Quote] Error:', message)

    if (message.includes('could not detect network')) {
      return NextResponse.json(
        { success: false, error: 'RPC connection failed' },
        { status: 503, headers: securityHeaders }
      )
    }

    return NextResponse.json(
      { success: false, error: message },
      { status: 500, headers: securityHeaders }
    )
  }
}
