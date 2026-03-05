/**
 * Bridge Quote Fetcher
 *
 * Fetches bridge quotes from the V3 contract API.
 * Transaction building is handled server-side by lib/kms/transaction-signer.ts.
 */

export interface BridgeQuoteResult {
    success: boolean
    nativeFeeWei: string
    nativeFeeHbar: string
    error?: string
}

/**
 * Fetch bridge quote from V3 contract via API
 */
export async function fetchBridgeQuoteV3(
    amount: string,
    receiver: string,
    requestGasDrop: boolean = false
): Promise<BridgeQuoteResult> {
    try {
        const response = await fetch('/api/bridge/quote-v3', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, receiver, requestGasDrop }),
        })

        const data = await response.json()

        if (!response.ok || !data.success) {
            return {
                success: false,
                nativeFeeWei: '0',
                nativeFeeHbar: '0',
                error: data.error || 'Failed to get quote',
            }
        }

        return {
            success: true,
            nativeFeeWei: data.nativeFeeWei,
            nativeFeeHbar: data.nativeFeeHbar,
        }
    } catch (error) {
        console.error('[BridgeTxV3] Error fetching bridge quote:', error)
        return {
            success: false,
            nativeFeeWei: '0',
            nativeFeeHbar: '0',
            error: 'Network error while fetching quote',
        }
    }
}
