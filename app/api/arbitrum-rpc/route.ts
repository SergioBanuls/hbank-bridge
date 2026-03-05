/**
 * Arbitrum RPC Proxy
 *
 * Proxies JSON-RPC requests to Arbitrum to avoid CORS and protect RPC keys.
 * Validates methods and eth_call targets.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getArbitrumRpcUrls } from '@/lib/bridge/arbitrumRpc'

const ALLOWED_METHODS = new Set([
    'eth_call',
    'eth_blockNumber',
    'eth_getBalance',
    'eth_estimateGas',
    'eth_gasPrice',
    'eth_maxPriorityFeePerGas',
    'eth_getTransactionReceipt',
    'eth_getTransactionByHash',
    'eth_getTransactionCount',
    'eth_chainId',
    'eth_getCode',
    'eth_feeHistory',
    'eth_sendRawTransaction',
])

const ALLOWED_CONTRACTS = new Set([
    '0xaf88d065e77c8cc2239327c5edb3a432268e5831', // USDC
    '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', // WETH
    '0x15072adcf5ad648422d28985ee2fe91595fa7a7e', // Bridge V3
])

const securityHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
}

interface JsonRpcRequest {
    jsonrpc: string
    method: string
    params?: unknown[]
    id: number | string | null
}

function isValidJsonRpcRequest(body: unknown): body is JsonRpcRequest {
    if (!body || typeof body !== 'object') return false
    const req = body as Record<string, unknown>
    if (typeof req.method !== 'string' || req.method.length === 0) return false
    if (req.jsonrpc !== '2.0') return false
    if (req.params !== undefined && !Array.isArray(req.params)) return false
    return true
}

export async function POST(request: NextRequest) {
    try {
        let body: unknown
        try {
            body = await request.json()
        } catch {
            return NextResponse.json(
                { jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null },
                { status: 400, headers: securityHeaders }
            )
        }

        if (!isValidJsonRpcRequest(body)) {
            return NextResponse.json(
                { jsonrpc: '2.0', error: { code: -32600, message: 'Invalid Request' }, id: null },
                { status: 400, headers: securityHeaders }
            )
        }

        if (!ALLOWED_METHODS.has(body.method)) {
            return NextResponse.json(
                { jsonrpc: '2.0', error: { code: -32601, message: `Method not allowed: ${body.method}` }, id: body.id ?? null },
                { status: 403, headers: securityHeaders }
            )
        }

        if (body.method === 'eth_call' && body.params && body.params.length > 0) {
            const callParams = body.params[0] as { to?: string } | undefined
            const to = callParams?.to?.toLowerCase()
            if (!to || !ALLOWED_CONTRACTS.has(to)) {
                return NextResponse.json(
                    { jsonrpc: '2.0', error: { code: -32602, message: 'Contract not allowed' }, id: body.id ?? null },
                    { status: 403, headers: securityHeaders }
                )
            }
        }

        const rpcUrls = getArbitrumRpcUrls()
        let lastError: string = 'All RPC endpoints failed'

        for (const rpcUrl of rpcUrls) {
            try {
                const response = await fetch(rpcUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                    signal: AbortSignal.timeout(10000),
                })

                if (!response.ok) {
                    lastError = `RPC ${rpcUrl} returned ${response.status}`
                    continue
                }

                const data = await response.json()
                if (data.error) {
                    lastError = data.error.message || 'RPC error'
                    continue
                }

                return NextResponse.json(data, { headers: securityHeaders })
            } catch {
                lastError = `RPC ${rpcUrl} unreachable`
                continue
            }
        }

        return NextResponse.json(
            { jsonrpc: '2.0', error: { code: -32603, message: lastError }, id: body.id ?? null },
            { status: 502, headers: securityHeaders }
        )
    } catch {
        return NextResponse.json(
            { jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null },
            { status: 500, headers: securityHeaders }
        )
    }
}
