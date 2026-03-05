/**
 * Bridge V3 Reverse Quote API (Arbitrum -> Hedera)
 *
 * Calls the Arbitrum bridge contract's quote() to get LayerZero fees.
 *
 * POST /api/bridge/quote-v3-reverse
 * Body: { amount: "100", receiver: "0x..." }
 * Returns: { success: true, nativeFeeWei: "...", nativeFeeEth: "..." }
 */

import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { getArbitrumProvider } from '@/lib/bridge/arbitrumRpc'

const BRIDGE_V3_ARBITRUM = process.env.NEXT_PUBLIC_BRIDGE_ARBITRUM_ADDRESS || '0xCFDA1CFf2b9f570817866434bBf60213764F0E61'

const BRIDGE_V3_ABI = [
    'function quote(string calldata symbol, uint256 amount, address receiver, uint32 targetChainId) view returns (uint256 nativeFee)',
]

const HEDERA_EID = 30316

const securityHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
}

export async function POST(request: NextRequest) {
    try {
        if (!BRIDGE_V3_ARBITRUM) {
            return NextResponse.json(
                { success: false, error: 'Bridge V3 Arbitrum not configured' },
                { status: 503, headers: securityHeaders }
            )
        }

        let body: { amount: string; receiver: string }
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

        const provider = await getArbitrumProvider()
        const contract = new ethers.Contract(BRIDGE_V3_ARBITRUM, BRIDGE_V3_ABI, provider)

        const nativeFee = await contract.quote('USDC', amountRaw, body.receiver, HEDERA_EID)
        const nativeFeeEth = ethers.utils.formatEther(nativeFee)

        return NextResponse.json({
            success: true,
            nativeFeeWei: nativeFee.toString(),
            nativeFeeEth,
        }, { headers: securityHeaders })
    } catch (error) {
        const err = error as { message?: string; reason?: string }
        const message = err.message || 'Failed to get quote'
        console.error('[Bridge V3 Reverse Quote] Error:', message)

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
