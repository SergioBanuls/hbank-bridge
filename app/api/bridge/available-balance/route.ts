/**
 * Bridge Available Balance API (Arbitrum side)
 *
 * Returns available USDC liquidity in the Arbitrum bridge contract.
 * GET /api/bridge/available-balance
 */

import { NextResponse } from 'next/server'
import { getArbitrumProvider } from '@/lib/bridge/arbitrumRpc'

const BRIDGE_V3_ARBITRUM = '0xCFDA1CFf2b9f570817866434bBf60213764F0E61'
const ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
const SAFETY_MARGIN_USDC = BigInt(1_000_000) // 1 USDC
const CACHE_TTL_MS = 10_000 // 10 seconds
const LZ_SCAN_API = 'https://api-mainnet.layerzero-scan.com'
const HEDERA_LZ_EID = 30316
const ARBITRUM_LZ_EID = 30110

const ERC20_ABI = ['function balanceOf(address account) view returns (uint256)']

const securityHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Cache-Control': 'public, max-age=30',
}

let cachedBalance: {
    availableBalanceRaw: bigint
    contractBalanceRaw: bigint
    pendingAmountRaw: bigint
    pendingCount: number
    timestamp: number
} | null = null

function formatUsdc(amount: bigint): string {
    return (Number(amount) / 1_000_000).toFixed(2)
}

async function fetchPendingLzTransactions(): Promise<{ pendingAmount: bigint; pendingCount: number }> {
    try {
        const response = await fetch(
            `${LZ_SCAN_API}/v1/messages?dstEid=${ARBITRUM_LZ_EID}&srcEid=${HEDERA_LZ_EID}&status=INFLIGHT,CONFIRMING&limit=100`,
            { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(5000) }
        )

        if (!response.ok) return { pendingAmount: BigInt(0), pendingCount: 0 }

        const data = await response.json()
        const messages = data.data || data.messages || []

        let pendingAmount = BigInt(0)
        let pendingCount = 0

        for (const msg of messages) {
            const dstAddress = msg.dstUaAddress || msg.dstAddress || ''
            if (dstAddress.toLowerCase() !== BRIDGE_V3_ARBITRUM.toLowerCase()) continue

            const amountStr = msg.amountSD || msg.amount || '0'
            const amount = BigInt(amountStr)
            if (amount > BigInt(0)) {
                pendingAmount += amount
                pendingCount++
            }
        }

        return { pendingAmount, pendingCount }
    } catch {
        return { pendingAmount: BigInt(0), pendingCount: 0 }
    }
}

async function fetchContractBalance(): Promise<bigint> {
    const { ethers } = await import('ethers')
    const provider = await getArbitrumProvider()
    const usdcContract = new ethers.Contract(ARBITRUM_USDC, ERC20_ABI, provider)
    const balance = await usdcContract.balanceOf(BRIDGE_V3_ARBITRUM)
    return BigInt(balance.toString())
}

export async function GET() {
    try {
        const now = Date.now()

        if (cachedBalance && now - cachedBalance.timestamp < CACHE_TTL_MS) {
            return NextResponse.json({
                success: true,
                availableBalance: formatUsdc(cachedBalance.availableBalanceRaw),
                availableBalanceRaw: cachedBalance.availableBalanceRaw.toString(),
                contractBalance: formatUsdc(cachedBalance.contractBalanceRaw),
                pendingAmount: formatUsdc(cachedBalance.pendingAmountRaw),
                pendingCount: cachedBalance.pendingCount,
                bridgeContract: BRIDGE_V3_ARBITRUM,
                timestamp: cachedBalance.timestamp,
                cached: true,
            }, { headers: securityHeaders })
        }

        const [contractBalanceRaw, { pendingAmount: pendingAmountRaw, pendingCount }] = await Promise.all([
            fetchContractBalance(),
            fetchPendingLzTransactions(),
        ])

        const totalReserved = pendingAmountRaw + SAFETY_MARGIN_USDC
        const availableBalanceRaw = contractBalanceRaw > totalReserved
            ? contractBalanceRaw - totalReserved
            : BigInt(0)

        cachedBalance = { availableBalanceRaw, contractBalanceRaw, pendingAmountRaw, pendingCount, timestamp: now }

        return NextResponse.json({
            success: true,
            availableBalance: formatUsdc(availableBalanceRaw),
            availableBalanceRaw: availableBalanceRaw.toString(),
            contractBalance: formatUsdc(contractBalanceRaw),
            pendingAmount: formatUsdc(pendingAmountRaw),
            pendingCount,
            bridgeContract: BRIDGE_V3_ARBITRUM,
            timestamp: now,
            cached: false,
        }, { headers: securityHeaders })
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to fetch balance'
        console.error('[Bridge Balance] Error:', errorMessage)

        if (cachedBalance) {
            return NextResponse.json({
                success: true,
                availableBalance: formatUsdc(cachedBalance.availableBalanceRaw),
                availableBalanceRaw: cachedBalance.availableBalanceRaw.toString(),
                contractBalance: formatUsdc(cachedBalance.contractBalanceRaw),
                pendingAmount: formatUsdc(cachedBalance.pendingAmountRaw),
                pendingCount: cachedBalance.pendingCount,
                bridgeContract: BRIDGE_V3_ARBITRUM,
                timestamp: cachedBalance.timestamp,
                cached: true,
                stale: true,
            }, { headers: securityHeaders })
        }

        return NextResponse.json(
            { success: false, error: errorMessage },
            { status: 500, headers: securityHeaders }
        )
    }
}
