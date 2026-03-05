/**
 * Get USDC Allowance on Arbitrum API
 *
 * Returns USDC allowance for a given owner and spender on Arbitrum.
 * GET /api/bridge/arbitrum-allowance?owner=0x...&spender=0x...
 */

import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { getArbitrumProvider } from '@/lib/bridge/arbitrumRpc'

const ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
const ERC20_ABI = ['function allowance(address owner, address spender) view returns (uint256)']

const securityHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const owner = searchParams.get('owner')
        const spender = searchParams.get('spender')

        if (!owner || !spender) {
            return NextResponse.json(
                { success: false, error: 'Missing owner or spender parameter' },
                { status: 400, headers: securityHeaders }
            )
        }

        if (!ethers.utils.isAddress(owner) || !ethers.utils.isAddress(spender)) {
            return NextResponse.json(
                { success: false, error: 'Invalid address' },
                { status: 400, headers: securityHeaders }
            )
        }

        const provider = await getArbitrumProvider()
        const usdcContract = new ethers.Contract(ARBITRUM_USDC, ERC20_ABI, provider)
        const allowance = await usdcContract.allowance(owner, spender)

        return NextResponse.json({
            success: true,
            allowance: allowance.toString(),
        }, { headers: securityHeaders })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to fetch allowance'
        console.error('[Arbitrum Allowance] Error:', message)
        return NextResponse.json(
            { success: false, error: message },
            { status: 500, headers: securityHeaders }
        )
    }
}
