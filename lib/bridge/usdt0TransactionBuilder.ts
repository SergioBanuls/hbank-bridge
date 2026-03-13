/**
 * USDT0 Bridge Quote Fetcher
 *
 * Fetches OFT quoteSend() results from the USDT0 quote API.
 * Transaction building is handled server-side by the KMS endpoints.
 */

export interface Usdt0QuoteResult {
  success: boolean
  nativeFee: string        // Raw fee in smallest unit (tinybar or wei)
  nativeFeeFormatted: string // Human-readable (HBAR or ETH)
  direction: 'hedera_to_arbitrum' | 'arbitrum_to_hedera'
  error?: string
}

/**
 * Fetch USDT0 bridge quote via OFT quoteSend()
 */
export async function fetchUsdt0Quote(
  amount: string,
  receiver: string,
  direction: 'hedera_to_arbitrum' | 'arbitrum_to_hedera',
  requestGasDrop: boolean = false
): Promise<Usdt0QuoteResult> {
  try {
    const response = await fetch('/api/bridge/quote-usdt0', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, receiver, direction, requestGasDrop }),
    })

    const data = await response.json()

    if (!response.ok || !data.success) {
      return {
        success: false,
        nativeFee: '0',
        nativeFeeFormatted: '0',
        direction,
        error: data.error || 'Failed to get USD₮0 quote',
      }
    }

    return {
      success: true,
      nativeFee: data.nativeFee,
      nativeFeeFormatted: data.nativeFeeFormatted,
      direction,
    }
  } catch (error) {
    console.error('[USDT0 Quote] Error:', error)
    return {
      success: false,
      nativeFee: '0',
      nativeFeeFormatted: '0',
      direction,
      error: 'Network error while fetching USD₮0 quote',
    }
  }
}
