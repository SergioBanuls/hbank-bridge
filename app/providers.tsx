/**
 * Client-side Providers Configuration
 *
 * Wraps the application with TanStack Query for intelligent caching,
 * deduplication, and background refetching.
 * Also initializes the token prices cache on app load.
 */

'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState } from 'react'
import { TokenPricesProvider } from '@/contexts/TokenPricesProvider'

export function Providers({ children }: { children: React.ReactNode }) {
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        staleTime: 30 * 1000, // 30s - data considered fresh
                        gcTime: 5 * 60 * 1000, // 5min - cache time after unused
                        refetchOnWindowFocus: false,
                        refetchOnReconnect: false,
                        retry: 2,
                        retryDelay: (attemptIndex) =>
                            Math.min(1000 * 2 ** attemptIndex, 30000),
                    },
                },
            })
    )

    return (
        <QueryClientProvider client={queryClient}>
            <TokenPricesProvider>{children}</TokenPricesProvider>
            {/* DevTools only shown in development */}
            <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
    )
}
