/**
 * Bridge Available Balance Hedera API
 *
 * Returns available USDC liquidity in the Hedera bridge contract.
 * GET /api/bridge/available-balance-hedera
 */

import { NextResponse } from 'next/server'

const BRIDGE_V3_HEDERA_CONTRACT_ID = process.env.NEXT_PUBLIC_BRIDGE_HEDERA_CONTRACT_ID || '0.0.10295928'
const HEDERA_USDC_TOKEN_ID = '0.0.456858'
const SAFETY_MARGIN_USDC = BigInt(1_000_000) // 1 USDC
const CACHE_TTL_MS = 10_000
const LZ_SCAN_API = 'https://api-mainnet.layerzero-scan.com'
const HEDERA_LZ_EID = 30316
const ARBITRUM_LZ_EID = 30110
const MIRROR_NODE_URL = process.env.HEDERA_MIRROR_NODE_URL || 'https://mainnet-public.mirrornode.hedera.com'

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

function contractIdToEvmAddress(contractId: string): string {
    const parts = contractId.split('.')
    if (parts.length !== 3) throw new Error(`Invalid Hedera contract ID: ${contractId}`)
    const num = parseInt(parts[2], 10)
    return `0x${num.toString(16).padStart(40, '0')}`
}

async function fetchPendingLzTransactions(): Promise<{ pendingAmount: bigint; pendingCount: number }> {
    try {
        const response = await fetch(
            `${LZ_SCAN_API}/v1/messages?dstEid=${HEDERA_LZ_EID}&srcEid=${ARBITRUM_LZ_EID}&status=INFLIGHT,CONFIRMING&limit=100`,
            { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(5000) }
        )

        if (!response.ok) return { pendingAmount: BigInt(0), pendingCount: 0 }

        const data = await response.json()
        const messages = data.data || data.messages || []
        const bridgeEvmAddress = contractIdToEvmAddress(BRIDGE_V3_HEDERA_CONTRACT_ID).toLowerCase()

        let pendingAmount = BigInt(0)
        let pendingCount = 0

        for (const msg of messages) {
            const dstAddress = msg.dstUaAddress || msg.dstAddress || ''
            if (dstAddress.toLowerCase() !== bridgeEvmAddress) continue

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
    const response = await fetch(
        `${MIRROR_NODE_URL}/api/v1/accounts/${BRIDGE_V3_HEDERA_CONTRACT_ID}/tokens`,
        { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(10000) }
    )

    if (!response.ok) throw new Error(`Mirror Node API error: ${response.status}`)

    const data = await response.json()
    const tokens = data.tokens || []
    const usdcToken = tokens.find(
        (t: { token_id: string; balance: number }) => t.token_id === HEDERA_USDC_TOKEN_ID
    )

    return usdcToken ? BigInt(usdcToken.balance || 0) : BigInt(0)
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
                bridgeContract: BRIDGE_V3_HEDERA_CONTRACT_ID,
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
            bridgeContract: BRIDGE_V3_HEDERA_CONTRACT_ID,
            timestamp: now,
            cached: false,
        }, { headers: securityHeaders })
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to fetch balance'
        console.error('[Bridge Balance Hedera] Error:', errorMessage)

        if (cachedBalance) {
            return NextResponse.json({
                success: true,
                availableBalance: formatUsdc(cachedBalance.availableBalanceRaw),
                availableBalanceRaw: cachedBalance.availableBalanceRaw.toString(),
                contractBalance: formatUsdc(cachedBalance.contractBalanceRaw),
                pendingAmount: formatUsdc(cachedBalance.pendingAmountRaw),
                pendingCount: cachedBalance.pendingCount,
                bridgeContract: BRIDGE_V3_HEDERA_CONTRACT_ID,
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
