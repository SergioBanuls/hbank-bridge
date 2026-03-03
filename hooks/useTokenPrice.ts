/**
 * Hook for accessing cached token prices
 *
 * Uses TanStack Query to fetch and cache ALL token prices at once.
 * Prices are fetched from SaucerSwap API and cached in memory.
 * Auto-updates every 1 minute.
 *
 * This is much more efficient than individual price queries:
 * - Single API call for all tokens
 * - No rate limiting issues
 * - Instant price lookup from cache
 * - Background updates every minute
 */

'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'

/**
 * Fetches all token prices from our API endpoint
 */
async function fetchAllTokenPrices(): Promise<Record<string, number>> {
    const response = await fetch('/api/token-prices')

    if (!response.ok) {
        throw new Error('Failed to fetch token prices')
    }

    return response.json()
}

/**
 * Hook that fetches and caches all token prices
 * ⚠️ ONLY call this in TokenPricesProvider - NOT in individual components!
 */
export function useTokenPrices() {
    return useQuery({
        queryKey: ['tokenPrices'],
        queryFn: fetchAllTokenPrices,
        staleTime: 60 * 1000, // 1 minute
        gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
        refetchInterval: 60 * 1000, // Refetch every 1 minute
        refetchOnWindowFocus: false, // Don't refetch on focus to avoid extra calls
        refetchOnReconnect: true, // Refetch when reconnecting
        refetchOnMount: false, // Don't refetch if data exists
        retry: 3,
        retryDelay: (attemptIndex) =>
            Math.min(1000 * Math.pow(2, attemptIndex), 10000),
    })
}

/**
 * Hook to get a specific token's price from the cached prices
 * This ONLY reads from cache, never triggers a fetch
 *
 * @param tokenId - The token ID (e.g., '0.0.456858', 'HBAR', or '' for HBAR)
 * @param fallbackPrice - Price to return if not found in cache
 * @returns Current price in USD
 */
export function useTokenPrice(
    tokenId: string | null,
    fallbackPrice: number = 0
): number {
    const queryClient = useQueryClient()

    // Only read from cache, never fetch
    const prices = queryClient.getQueryData<Record<string, number>>([
        'tokenPrices',
    ])

    if (!prices) {
        return fallbackPrice
    }

    // Handle HBAR special cases - empty string or null means HBAR
    if (!tokenId || tokenId === '') {
        // Priority: 'HBAR' key, then empty string key, then fallback
        return prices['HBAR'] ?? prices[''] ?? fallbackPrice
    }

    // For all other tokens, use their ID directly
    return prices[tokenId] ?? fallbackPrice
}
