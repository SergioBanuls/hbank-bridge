import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
    reactStrictMode: false,
    // Keep compiled routes in memory longer to avoid recompilation-triggered HMR reloads
    devIndicators: false,
    onDemandEntries: {
        maxInactiveAge: 1000 * 60 * 60, // 1 hour (default: 15s)
        pagesBufferLength: 100,          // Keep more pages in memory (default: 5)
    },
    images: {
        unoptimized: true,
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'dwk1opv266jxs.cloudfront.net',
                pathname: '/icons/**',
            },
            {
                protocol: 'https',
                hostname: 'www.saucerswap.finance',
                pathname: '/images/**',
            },
        ],
    },
    serverExternalPackages: ['@hashgraph/sdk', '@supabase/supabase-js', 'pino', 'thread-stream'],
}

export default nextConfig
