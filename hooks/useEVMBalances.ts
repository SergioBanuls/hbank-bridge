'use client'

import { useState, useEffect, useCallback } from 'react'
import { ethers } from 'ethers'

interface EVMBalances {
    eth: string
    usdc: string
    usdt0: string
    ethPriceUsd: number
    isLoading: boolean
}

const REFRESH_INTERVAL = 30_000

async function fetchEthPrice(): Promise<number> {
    try {
        const res = await fetch(
            'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
        )
        if (!res.ok) return 0
        const data = await res.json()
        return data?.ethereum?.usd ?? 0
    } catch {
        return 0
    }
}

export function useEVMBalances(evmAddress: string | null): EVMBalances {
    const [eth, setEth] = useState('0')
    const [usdc, setUsdc] = useState('0')
    const [usdt0, setUsdt0] = useState('0')
    const [ethPriceUsd, setEthPriceUsd] = useState(0)
    const [isLoading, setIsLoading] = useState(false)

    const fetchBalances = useCallback(async (showLoading = true) => {
        if (!evmAddress) {
            setEth('0')
            setUsdc('0')
            setUsdt0('0')
            return
        }

        if (showLoading) setIsLoading(true)

        try {
            const [balanceRes, price] = await Promise.all([
                fetch(`/api/bridge/arbitrum-balance?address=${evmAddress}`),
                fetchEthPrice(),
            ])

            if (balanceRes.ok) {
                const data = await balanceRes.json()
                if (data.success) {
                    setEth(ethers.utils.formatEther(data.ethBalance))
                    setUsdc((parseInt(data.usdcBalance) / 1e6).toFixed(6))
                    setUsdt0((parseInt(data.usdt0Balance || '0') / 1e6).toFixed(6))
                }
            }

            if (price > 0) setEthPriceUsd(price)
        } catch (err) {
            console.error('[useEVMBalances] Failed to fetch:', err)
        } finally {
            if (showLoading) setIsLoading(false)
        }
    }, [evmAddress])

    useEffect(() => {
        fetchBalances(true)
    }, [fetchBalances])

    useEffect(() => {
        if (!evmAddress) return
        const interval = setInterval(() => fetchBalances(false), REFRESH_INTERVAL)
        return () => clearInterval(interval)
    }, [evmAddress, fetchBalances])

    return { eth, usdc, usdt0, ethPriceUsd, isLoading }
}
