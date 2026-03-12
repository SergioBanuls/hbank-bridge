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

    // Determine which OFT contract and RPC to use
    let rpcUrl: string
    let oftAddress: string

    if (isHederaToArb) {
      rpcUrl = HEDERA_RPC
      oftAddress = USDT0_HEDERA.OFT_ADDRESS
    } else {
      rpcUrl = process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc'
      oftAddress = USDT0_ARBITRUM.OFT_ADDRESS
    }

    // Call via JSON-RPC
    const rpcResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_call',
        params: [{ to: oftAddress, data: calldata }, 'latest'],
        id: 1,
      }),
    })

    if (!rpcResponse.ok) {
      throw new Error(`RPC request failed: ${rpcResponse.status}`)
    }

    const rpcResult = await rpcResponse.json()
    if (rpcResult.error) {
      throw new Error(rpcResult.error.message || 'RPC error')
    }

    // Decode result: returns MessagingFee (nativeFee, lzTokenFee)
    const decoded = iface.decodeFunctionResult('quoteSend', rpcResult.result)
    const nativeFee = decoded[0].nativeFee || decoded[0][0]

    // Format fee based on direction
    let nativeFeeFormatted: string
    if (isHederaToArb) {
      // Hedera EVM returns weibar (18 decimals), convert to HBAR
      // weibar / 1e10 = tinybar, tinybar / 1e8 = HBAR => weibar / 1e18 = HBAR
      nativeFeeFormatted = `${(Number(nativeFee) / 1e18).toFixed(4)} HBAR`
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
    const message = err.message || 'Failed to get USDT0 quote'
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
