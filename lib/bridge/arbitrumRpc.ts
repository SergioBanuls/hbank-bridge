/**
 * Arbitrum RPC provider with fallback.
 *
 * Tries the configured ARBITRUM_RPC_URL first, then falls back to
 * public endpoints if it fails.
 */

import { ethers } from 'ethers'

const FALLBACK_RPCS = [
    'https://arbitrum-one-rpc.publicnode.com',
    'https://arb1.arbitrum.io/rpc',
]

export function getArbitrumRpcUrls(): string[] {
    const configured = process.env.ARBITRUM_RPC_URL
    if (configured) return [configured, ...FALLBACK_RPCS]
    return FALLBACK_RPCS
}

export async function getArbitrumProvider(): Promise<ethers.providers.JsonRpcProvider> {
    const urls = getArbitrumRpcUrls()

    for (const url of urls) {
        try {
            const provider = new ethers.providers.JsonRpcProvider(
                { url, skipFetchSetup: true },
                42161,
            )
            // Quick health check
            await provider.getBlockNumber()
            return provider
        } catch {
            continue
        }
    }

    throw new Error('All Arbitrum RPC endpoints failed')
}
