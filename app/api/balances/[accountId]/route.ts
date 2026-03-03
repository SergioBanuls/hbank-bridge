/**
 * API Route Handler for fetching account token balances
 *
 * Fetches balances from ValidationCloud Hedera Mirror Node
 * Securely handles API key on the server side
 */

import { NextResponse } from 'next/server'

const VALIDATION_CLOUD_BASE_URL =
    process.env.VALIDATION_CLOUD_BASE_URL ||
    'https://mainnet.hedera.validationcloud.io/v1'
const VALIDATION_CLOUD_API_KEY = process.env.VALIDATION_CLOUD_API_KEY

interface TokenBalanceItem {
    tokenId: string
    balance: string
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ accountId: string }> }
) {
    const { accountId } = await params

    if (!accountId) {
        return NextResponse.json(
            { error: 'Account ID is required' },
            { status: 400 }
        )
    }

    if (!VALIDATION_CLOUD_API_KEY) {
        console.error('VALIDATION_CLOUD_API_KEY is not configured')
        return NextResponse.json(
            { error: 'API configuration error' },
            { status: 500 }
        )
    }

    try {
        const baseUrlWithKey = VALIDATION_CLOUD_API_KEY
            ? `${VALIDATION_CLOUD_BASE_URL}/${VALIDATION_CLOUD_API_KEY}`
            : VALIDATION_CLOUD_BASE_URL

        const url = `${baseUrlWithKey}/api/v1/accounts/${accountId}?limit=100&transactions=false`
        console.log('Fetching balances for:', accountId)
        const response = await fetch(url)

        if (!response.ok) {
            if (response.status === 404) {
                return NextResponse.json(
                    { error: 'Account not found' },
                    { status: 404 }
                )
            }
            throw new Error(`Mirror Node API error: ${response.status}`)
        }

        const data = await response.json()

        // Unify HBAR balance and token balances into single array
        const balances: TokenBalanceItem[] = []

        // Add HBAR balance (use 'HBAR' as tokenId for matching later)
        if (data.balance?.balance) {
            balances.push({
                tokenId: 'HBAR',
                balance: data.balance.balance.toString(),
            })
        }

        // Add token balances, filtering out zero balances
        const tokenList = data.balance?.tokens || []
        tokenList.forEach((token: any) => {
            const balance = parseInt(token.balance)
            if (token.token_id && balance > 0) {
                balances.push({
                    tokenId: token.token_id,
                    balance: token.balance.toString(),
                })
            }
        })

        // Get all associated tokens from tokenRelationships (includes tokens with 0 balance)
        const associatedTokens =
            data.balance?.tokens?.map((token: any) => token.token_id) || []

        return NextResponse.json({
            balances,
            associatedTokens, // All tokens associated, regardless of balance
        })
    } catch (error) {
        console.error('Error fetching balances:', error)
        return NextResponse.json(
            { error: 'Failed to fetch balances' },
            { status: 500 }
        )
    }
}
