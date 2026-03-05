/**
 * Bridge V3 Quote API (Hedera -> Arbitrum)
 *
 * Calls the bridge contract's quote/quoteWithGasDrop to get LayerZero fees.
 *
 * POST /api/bridge/quote-v3
 * Body: { amount: "100", receiver: "0x...", requestGasDrop?: boolean }
 * Returns: { success: true, nativeFeeWei: "...", nativeFeeHbar: "..." }
 */

import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'

const HEDERA_RPC = process.env.HEDERA_RPC_URL || 'https://mainnet.hashio.io/api'
const BRIDGE_V3_ADDRESS = process.env.NEXT_PUBLIC_BRIDGE_HEDERA_ADDRESS || '0x00000000000000000000000000000000009d1a78'

const BRIDGE_V3_ABI = [
    'function quote(string calldata symbol, uint256 amount, address receiver, uint32 targetChainId) view returns (uint256 nativeFee)',
    'function quoteWithGasDrop(string calldata symbol, uint256 amount, address receiver, uint32 targetChainId, bool requestGasDrop) view returns (uint256 nativeFee)',
]

const ARBITRUM_EID = 30110

const securityHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
}

export async function POST(request: NextRequest) {
    try {
        if (!BRIDGE_V3_ADDRESS) {
            return NextResponse.json(
                { success: false, error: 'Bridge V3 not configured' },
                { status: 503, headers: securityHeaders }
            )
        }

        let body: { amount: string; receiver: string; requestGasDrop?: boolean }
        try {
            body = await request.json()
        } catch {
            return NextResponse.json(
                { success: false, error: 'Invalid JSON' },
                { status: 400, headers: securityHeaders }
            )
        }

        if (!body.amount || !body.receiver) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields: amount, receiver' },
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
        const amountRaw = Math.floor(amountFloat * 1_000_000)
        const requestGasDrop = body.requestGasDrop || false

        const iface = new ethers.utils.Interface(BRIDGE_V3_ABI)
        const calldata = requestGasDrop
            ? iface.encodeFunctionData('quoteWithGasDrop', ['USDC', amountRaw, body.receiver, ARBITRUM_EID, true])
            : iface.encodeFunctionData('quote', ['USDC', amountRaw, body.receiver, ARBITRUM_EID])

        const rpcResponse = await fetch(HEDERA_RPC, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'eth_call',
                params: [{ to: BRIDGE_V3_ADDRESS, data: calldata }, 'latest'],
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

        const decoded = requestGasDrop
            ? iface.decodeFunctionResult('quoteWithGasDrop', rpcResult.result)
            : iface.decodeFunctionResult('quote', rpcResult.result)

        const nativeFee = decoded.nativeFee || decoded[0]

        // Convert tinybar to HBAR (8 decimals)
        const nativeFeeHbar = (Number(nativeFee) / 1e8).toFixed(6)

        return NextResponse.json({
            success: true,
            nativeFeeWei: nativeFee.toString(),
            nativeFeeHbar,
        }, { headers: securityHeaders })
    } catch (error) {
        const err = error as { message?: string; reason?: string }
        const message = err.message || 'Failed to get quote'
        console.error('[Bridge V3 Quote] Error:', message)

        if (message.includes('could not detect network')) {
            return NextResponse.json(
                { success: false, error: 'RPC connection failed' },
                { status: 503, headers: securityHeaders }
            )
        }

        if (err.reason) {
            return NextResponse.json(
                { success: false, error: `Contract error: ${err.reason}` },
                { status: 400, headers: securityHeaders }
            )
        }

        return NextResponse.json(
            { success: false, error: message },
            { status: 500, headers: securityHeaders }
        )
    }
}
