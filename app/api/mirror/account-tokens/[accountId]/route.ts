/**
 * Account Tokens API Endpoint
 *
 * Fetches token associations for an account from Validation Cloud Mirror Node.
 * Used to check if tokens are associated with an account.
 */

import { NextRequest, NextResponse } from 'next/server'

const VALIDATION_CLOUD_BASE_URL =
    process.env.VALIDATION_CLOUD_BASE_URL ||
    'https://mainnet.hedera.validationcloud.io/v1'
const VALIDATION_CLOUD_API_KEY = process.env.VALIDATION_CLOUD_API_KEY

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ accountId: string }> }
) {
    try {
        const { accountId } = await params

        if (!accountId) {
            return NextResponse.json(
                { error: 'Missing required parameter: accountId' },
                { status: 400 }
            )
        }

        const baseUrlWithKey = VALIDATION_CLOUD_API_KEY
            ? `${VALIDATION_CLOUD_BASE_URL}/${VALIDATION_CLOUD_API_KEY}`
            : VALIDATION_CLOUD_BASE_URL

        const url = `${baseUrlWithKey}/api/v1/accounts/${accountId}/tokens`

        const response = await fetch(url)

        if (!response.ok) {
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
        console.error('❌ Error in account-tokens API:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
