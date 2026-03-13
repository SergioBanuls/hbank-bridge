/**
 * Bridge Transaction Tracking API
 *
 * Tracks bridge status: Hedera Mirror Node -> LayerZero Scan -> Arbitrum balance
 *
 * POST /api/bridge/track
 * Body: { transactionId, destinationAddress, initialArbitrumBalance }
 */

import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { getArbitrumProvider } from '@/lib/bridge/arbitrumRpc'

const MIRROR_NODE_URL = process.env.HEDERA_MIRROR_NODE_URL || 'https://mainnet-public.mirrornode.hedera.com'
const LZ_SCAN_API = 'https://api-mainnet.layerzero-scan.com'
const ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
const ARBITRUM_USDT0 = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9'
const ERC20_ABI = ['function balanceOf(address account) view returns (uint256)']

const securityHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
}

type BridgeTrackStatus = 'pending' | 'hedera_confirmed' | 'lz_inflight' | 'lz_delivered' | 'delivered' | 'failed'

interface HederaStatus {
    confirmed: boolean
    consensusTimestamp?: string
    result?: string
    transactionHash?: string
    errorMessage?: string
}

interface LayerZeroStatus {
    status?: 'INFLIGHT' | 'DELIVERED' | 'FAILED' | 'CONFIRMING'
    srcTxHash?: string
    dstTxHash?: string
    guid?: string
}

interface ArbitrumStatus {
    delivered: boolean
    newBalance?: string
}

function normalizeTransactionId(txId: string): string {
    if (txId.includes('@')) {
        const [account, timestamp] = txId.split('@')
        const [seconds, nanos] = timestamp.split('.')
        return `${account}-${seconds}-${nanos}`
    }
    return txId
}

function base64ToHex(base64: string): string {
    try {
        const standardBase64 = base64.replace(/-/g, '+').replace(/_/g, '/')
        const bytes = Buffer.from(standardBase64, 'base64')
        const truncatedBytes = bytes.slice(0, 32)
        return '0x' + truncatedBytes.toString('hex')
    } catch {
        return base64
    }
}

async function checkHederaTransaction(transactionId: string): Promise<HederaStatus> {
    const normalizedId = normalizeTransactionId(transactionId)
    const mirrorUrl = `${MIRROR_NODE_URL}/api/v1/transactions/${normalizedId}`

    try {
        const response = await fetch(mirrorUrl, {
            headers: { 'Accept': 'application/json' },
        })

        if (!response.ok) {
            if (response.status === 404) return { confirmed: false }
            throw new Error(`Mirror Node error: ${response.status}`)
        }

        const data = await response.json()
        if (!data.transactions || data.transactions.length === 0) {
            return { confirmed: false }
        }

        const tx = data.transactions[0]
        const isSuccess = tx.result === 'SUCCESS'
        const transactionHash = tx.transaction_hash ? base64ToHex(tx.transaction_hash) : undefined

        return {
            confirmed: true,
            consensusTimestamp: tx.consensus_timestamp,
            result: tx.result,
            transactionHash,
            errorMessage: isSuccess ? undefined : tx.result,
        }
    } catch (error) {
        console.error('[Bridge Track] Hedera check error:', error)
        return { confirmed: false }
    }
}

async function checkLayerZeroStatus(txHash: string): Promise<LayerZeroStatus> {
    try {
        const response = await fetch(`${LZ_SCAN_API}/tx/${txHash}`, {
            headers: { 'Accept': 'application/json' },
        })

        if (!response.ok) {
            if (response.status === 404) return {}
            throw new Error(`LayerZero Scan error: ${response.status}`)
        }

        const data = await response.json()
        if (!data.messages || data.messages.length === 0) return {}

        const message = data.messages[0]
        return {
            status: message.status,
            srcTxHash: message.srcTxHash,
            dstTxHash: message.dstTxHash,
            guid: message.guid,
        }
    } catch (error) {
        console.error('[Bridge Track] LayerZero check error:', error)
        return {}
    }
}

async function checkArbitrumBalance(address: string, initialBalance: bigint, token: 'usdc' | 'usdt0' = 'usdc'): Promise<ArbitrumStatus> {
    try {
        const tokenAddress = token === 'usdt0' ? ARBITRUM_USDT0 : ARBITRUM_USDC
        const provider = await getArbitrumProvider()
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider)
        const balance = await tokenContract.balanceOf(address)
        const currentBalance = BigInt(balance.toString())

        return {
            delivered: currentBalance > initialBalance,
            newBalance: currentBalance.toString(),
        }
    } catch (error) {
        console.error('[Bridge Track] Arbitrum check error:', error)
        return { delivered: false }
    }
}

function determineOverallStatus(
    hedera: HederaStatus,
    layerZero: LayerZeroStatus,
    arbitrum: ArbitrumStatus
): BridgeTrackStatus {
    if (hedera.confirmed && hedera.result !== 'SUCCESS') return 'failed'
    if (layerZero.status === 'FAILED') return 'failed'
    if (arbitrum.delivered) return 'delivered'
    if (layerZero.status === 'DELIVERED') return 'lz_delivered'
    if (layerZero.status === 'INFLIGHT' || layerZero.status === 'CONFIRMING') return 'lz_inflight'
    if (hedera.confirmed && hedera.result === 'SUCCESS') return 'hedera_confirmed'
    return 'pending'
}

export async function POST(request: NextRequest) {
    try {
        let body: { transactionId: string; destinationAddress: string; initialArbitrumBalance: string; token?: 'usdc' | 'usdt0' }
        try {
            body = await request.json()
        } catch {
            return NextResponse.json(
                { success: false, error: 'Invalid JSON' },
                { status: 400, headers: securityHeaders }
            )
        }

        if (!body.transactionId || !body.destinationAddress || !body.initialArbitrumBalance) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields: transactionId, destinationAddress, initialArbitrumBalance' },
                { status: 400, headers: securityHeaders }
            )
        }

        const token = body.token === 'usdt0' ? 'usdt0' : 'usdc'

        if (!ethers.utils.isAddress(body.destinationAddress)) {
            return NextResponse.json(
                { success: false, error: 'Invalid destination address' },
                { status: 400, headers: securityHeaders }
            )
        }

        let initialBalance: bigint
        try {
            initialBalance = BigInt(body.initialArbitrumBalance)
        } catch {
            return NextResponse.json(
                { success: false, error: 'Invalid initialArbitrumBalance' },
                { status: 400, headers: securityHeaders }
            )
        }

        const [hedera, arbitrum] = await Promise.all([
            checkHederaTransaction(body.transactionId),
            checkArbitrumBalance(body.destinationAddress, initialBalance, token),
        ])

        let layerZero: LayerZeroStatus = {}
        if (hedera.confirmed && hedera.transactionHash) {
            layerZero = await checkLayerZeroStatus(hedera.transactionHash)
        }

        const status = determineOverallStatus(hedera, layerZero, arbitrum)

        return NextResponse.json({
            success: true,
            status,
            hedera,
            layerZero,
            arbitrum,
        }, { headers: securityHeaders })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to track transaction'
        console.error('[Bridge Track] Error:', message)
        return NextResponse.json(
            { success: false, error: message },
            { status: 500, headers: securityHeaders }
        )
    }
}
