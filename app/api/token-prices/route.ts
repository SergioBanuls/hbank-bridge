/**
 * API Route Handler for fetching all token prices
 *
 * Returns all token prices from SaucerSwap API for caching
 * For testnet, returns mock prices
 */

import { NextResponse } from 'next/server'

const SAUCERSWAP_API_URL = 'https://api.saucerswap.finance/tokens/known'
const API_KEY = process.env.SAUCERSWAP_API_KEY
const HEDERA_NETWORK = process.env.NEXT_PUBLIC_HEDERA_NETWORK || 'testnet'

// Mock prices for testnet tokens
const TESTNET_PRICES: Record<string, number> = {
    HBAR: 0.1,
    '0.0.429274': 1.0, // USDC
    '0.0.456858': 1.0, // USDC mainnet equivalent
    '0.0.731861': 0.05, // SAUCE
}

export async function GET() {
    try {
        // For testnet, return mock prices
        if (HEDERA_NETWORK === 'testnet') {
            return NextResponse.json(TESTNET_PRICES, {
                headers: {
                    'Cache-Control':
                        'public, s-maxage=60, stale-while-revalidate=120',
                },
            })
        }

        // For mainnet, fetch from SaucerSwap
        if (!API_KEY) {
            console.error('SAUCERSWAP_API_KEY not configured')
            return NextResponse.json(
                { error: 'API key not configured' },
                { status: 500 }
            )
        }

        const response = await fetch(SAUCERSWAP_API_URL, {
            headers: { 'x-api-key': API_KEY },
            next: { revalidate: 60 }, // Cache for 60 seconds
        })

        if (!response.ok) {
            console.error(`SaucerSwap API error: ${response.status}`)
            return NextResponse.json(
                { error: 'Failed to fetch prices from SaucerSwap' },
                { status: response.status }
            )
        }

        const tokens = await response.json()

        // Transform to a simple map of tokenId -> price
        const priceMap: Record<string, number> = {}

        // Add HBAR first (it might not be in the list with empty string key)
        const hbarToken = tokens.find(
            (t: any) => t.symbol === 'HBAR' || t.id === 'HBAR'
        )
        if (hbarToken?.priceUsd) {
            priceMap['HBAR'] = hbarToken.priceUsd
            priceMap[''] = hbarToken.priceUsd // Also map empty string for HBAR
        }

        // Add all other tokens
        tokens.forEach((token: any) => {
            if (token.id && token.priceUsd) {
                priceMap[token.id] = token.priceUsd
            }
        })

        return NextResponse.json(priceMap, {
            headers: {
                'Cache-Control':
                    'public, s-maxage=60, stale-while-revalidate=120',
            },
        })
    } catch (error) {
        console.error('Error fetching token prices:', error)
        return NextResponse.json(
            { error: 'Failed to fetch token prices' },
            { status: 500 }
        )
    }
}
