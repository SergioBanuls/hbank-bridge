/**
 * Get Arbitrum Balances API
 *
 * Returns ETH and USDC balances for a given address on Arbitrum.
 * GET /api/bridge/arbitrum-balance?address=0x...
 */

import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { getArbitrumProvider } from '@/lib/bridge/arbitrumRpc'

const ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
const ERC20_ABI = ['function balanceOf(address account) view returns (uint256)']

const securityHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const address = searchParams.get('address')

        if (!address) {
            return NextResponse.json(
                { success: false, error: 'Missing address parameter' },
                { status: 400, headers: securityHeaders }
            )
        }

        if (!ethers.utils.isAddress(address)) {
            return NextResponse.json(
                { success: false, error: 'Invalid address' },
                { status: 400, headers: securityHeaders }
            )
        }

        const provider = await getArbitrumProvider()

        const [ethBalance, usdcBalance] = await Promise.all([
            provider.getBalance(address),
            (async () => {
                const usdcContract = new ethers.Contract(ARBITRUM_USDC, ERC20_ABI, provider)
                return usdcContract.balanceOf(address)
            })(),
        ])

        return NextResponse.json({
            success: true,
            usdcBalance: usdcBalance.toString(),
            ethBalance: ethBalance.toString(),
        }, { headers: securityHeaders })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to fetch balance'
        console.error('[Arbitrum Balance] Error:', message)
        return NextResponse.json(
            { success: false, error: message },
            { status: 500, headers: securityHeaders }
        )
    }
}
