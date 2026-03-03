/**
 * Transaction Status API Endpoint
 *
 * Fetches transaction details from Validation Cloud Mirror Node.
 * Used by transaction monitor to check transaction status.
 */

import { NextRequest, NextResponse } from 'next/server'

const VALIDATION_CLOUD_BASE_URL =
    process.env.VALIDATION_CLOUD_BASE_URL ||
    'https://mainnet.hedera.validationcloud.io/v1'
const VALIDATION_CLOUD_API_KEY = process.env.VALIDATION_CLOUD_API_KEY

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ transactionId: string }> }
) {
    try {
        const { transactionId } = await params

        if (!transactionId) {
            return NextResponse.json(
                { error: 'Missing required parameter: transactionId' },
                { status: 400 }
            )
        }

        // Normalize transaction ID format
        // Convert @ to - for Mirror Node API
        // "0.0.1234@1234567890.123456789" -> "0.0.1234-1234567890-123456789"
        let normalizedId = transactionId
        if (transactionId.includes('@')) {
            const [accountId, timestamp] = transactionId.split('@')
            const [seconds, nanos] = timestamp.split('.')
            normalizedId = `${accountId}-${seconds}-${nanos}`
        }

        const baseUrlWithKey = VALIDATION_CLOUD_API_KEY
            ? `${VALIDATION_CLOUD_BASE_URL}/${VALIDATION_CLOUD_API_KEY}`
            : VALIDATION_CLOUD_BASE_URL

        const url = `${baseUrlWithKey}/api/v1/transactions/${normalizedId}`

        const response = await fetch(url)

        if (!response.ok) {
            if (response.status === 404) {
                // Transaction not yet in Mirror Node
                return NextResponse.json({ transactions: [] }, { status: 200 })
            }

            const errorText = await response.text()
            console.error(
                '❌ Validation Cloud error:',
                response.status,
                errorText
            )
            return NextResponse.json(
                { error: `Mirror Node API error: ${response.statusText}` },
                { status: response.status }
            )
        }

        const data = await response.json()

        return NextResponse.json(data)
    } catch (error) {
        console.error('❌ Error in transaction API:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
