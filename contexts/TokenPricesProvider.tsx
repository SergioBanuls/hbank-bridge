/**
 * Token Prices Provider
 *
 * Initializes and maintains the token prices cache.
 * Fetches all prices on mount and keeps them updated every minute.
 * This ensures prices are always available instantly when needed.
 */

'use client'

import { createContext, useContext, useMemo, ReactNode } from 'react'
import { useTokenPrices } from '@/hooks/useTokenPrice'

interface TokenPricesContextValue {
    prices: Record<string, number> | undefined
    isLoading: boolean
    error: Error | null
}

const TokenPricesContext = createContext<TokenPricesContextValue>({
    prices: undefined,
    isLoading: true,
    error: null,
})

export function TokenPricesProvider({ children }: { children: ReactNode }) {
    const { data: prices, isLoading, error } = useTokenPrices()

    const value = useMemo(() => ({
        prices,
        isLoading,
        error: error as Error | null,
    }), [prices, isLoading, error])

    return (
        <TokenPricesContext.Provider value={value}>
            {children}
        </TokenPricesContext.Provider>
    )
}

/**
 * Hook to access the token prices context
 * This gives components access to loading state and error info if needed
 */
export function useTokenPricesContext() {
    return useContext(TokenPricesContext)
}
