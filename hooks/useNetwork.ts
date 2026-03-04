/**
 * Hook to get current network configuration
 */

'use client'

import { useState, useEffect } from 'react'

export type NetworkType = 'testnet' | 'mainnet'

export interface NetworkConfig {
    network: NetworkType
    apiUrl: string
}

export function useNetwork(): NetworkConfig {
    const [network, setNetwork] = useState<NetworkType>(
        (process.env.NEXT_PUBLIC_HEDERA_NETWORK as NetworkType) || 'testnet'
    )

    useEffect(() => {
        // Use environment variable as default
        const envNetwork = process.env.NEXT_PUBLIC_HEDERA_NETWORK as NetworkType
        if (envNetwork) {
            setNetwork(envNetwork)
        }

        // Check localStorage for user override
        const saved = localStorage.getItem('hedera_network')
        if (saved === 'mainnet' || saved === 'testnet') {
            setNetwork(saved)
        }
    }, [])

    return {
        network,
        apiUrl:
            network === 'testnet'
                ? 'https://testnet.mirrornode.hedera.com'
                : '/api/mirror', // Use API endpoints for mainnet
    }
}
