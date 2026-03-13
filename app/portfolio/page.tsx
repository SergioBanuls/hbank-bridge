'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { useConnectionContext } from '@/contexts/ConnectionContext'
import { useTokenBalances } from '@/hooks/useTokenBalances'
import { useTokens } from '@/hooks/useTokens'
import { useTokenPricesContext } from '@/contexts/TokenPricesProvider'
import { useEVMBalances } from '@/hooks/useEVMBalances'
import { accountIdToEvmAddress } from '@/lib/bridge/bridgeConstants'
import { LoginDialog } from '@/components/auth/LoginDialog'
import { Wallet, Copy, Check } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { Token } from '@/types/token'
import { TokenImage } from './components/TokenImage'

// ─── Constants ───

const NETWORK_CONFIG = {
    hedera: { label: 'Hedera', icon: '/hedera-logo.png', bgColor: 'bg-neutral-100' },
    arbitrum: { label: 'Arbitrum', icon: '/arbitrum-logo.png', bgColor: 'bg-blue-500' },
} as const

// Truncate to N decimals without rounding
function truncDec(value: number, decimals: number = 2): string {
    const factor = Math.pow(10, decimals)
    return (Math.floor(value * factor) / factor).toFixed(decimals)
}

// Format USD value with appropriate precision (truncated, not rounded)
function formatUsd(value: number): string {
    if (value === 0) return '$0.00'
    if (value < 0.01) return '<$0.01'
    if (value >= 1_000_000) return `$${truncDec(value / 1_000_000)}M`
    if (value >= 1_000) {
        const truncated = Math.floor(value * 100) / 100
        return `$${truncated.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }
    return `$${truncDec(value)}`
}

// Format token balance with sensible decimals (truncated, not rounded)
function formatBalance(value: number): string {
    if (value === 0) return '0'
    if (value < 0.0001) return '<0.0001'
    if (value < 1) return truncDec(value, 4)
    if (value < 1000) return truncDec(value)
    const truncated = Math.floor(value * 100) / 100
    return truncated.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface HederaAsset {
    token: Token
    balanceKey: string
    balance: number
    price: number
    valueUsd: number
}

const NETWORK_TABS = ['hedera', 'arbitrum'] as const
type NetworkTab = (typeof NETWORK_TABS)[number]

export default function PortfolioPage() {
    const { isConnected, custodialAccountId, custodialEvmAddress, loading } = useConnectionContext()
    const [loginOpen, setLoginOpen] = useState(false)

    // Use the real KMS-derived EVM address for Arbitrum balance fetching
    const evmAddress = custodialEvmAddress
        || (custodialAccountId
            ? (() => { try { return accountIdToEvmAddress(custodialAccountId) } catch { return null } })()
            : null)

    const { balances, loading: balancesLoading } = useTokenBalances(custodialAccountId)
    const { data: tokens, isLoading: tokensLoading } = useTokens()
    const { prices, isLoading: pricesLoading } = useTokenPricesContext()
    const { eth, usdc, usdt0, ethPriceUsd, isLoading: evmLoading } = useEVMBalances(evmAddress)
    const isHederaLoading = balancesLoading || tokensLoading || pricesLoading

    // Build sorted Hedera asset list
    const hederaAssets = useMemo<HederaAsset[]>(() => {
        if (!tokens || !prices) return []

        const assets: HederaAsset[] = []

        for (const token of tokens) {
            const balanceKey = token.address === '' ? 'HBAR' : token.address
            const rawBalance = balances[balanceKey]
            if (!rawBalance) continue

            const rawValue = parseFloat(rawBalance)
            if (rawValue <= 0) continue

            // Balances from API are in smallest units, convert to human-readable
            const balance = rawValue / Math.pow(10, token.decimals)

            const priceKey = token.address === '' ? 'HBAR' : token.address
            const price = prices[priceKey] ?? 0
            const valueUsd = balance * price

            assets.push({ token, balanceKey, balance, price, valueUsd })
        }

        // HBAR first, then sort by USD value descending
        assets.sort((a, b) => {
            if (a.token.address === '') return -1
            if (b.token.address === '') return 1
            return b.valueUsd - a.valueUsd
        })

        return assets
    }, [tokens, prices, balances])

    // Compute EVM values
    const evmEthValue = parseFloat(eth) * ethPriceUsd
    const evmUsdcValue = parseFloat(usdc)
    const evmUsdt0Value = parseFloat(usdt0) // $1.00 stablecoin
    const evmTotalValue = evmEthValue + evmUsdcValue + evmUsdt0Value

    const hederaTotalValue = hederaAssets.reduce((sum, a) => sum + a.valueUsd, 0)
    const totalValue = hederaTotalValue + evmTotalValue

    const isAnyLoading = isHederaLoading || evmLoading
    const [activeTab, setActiveTab] = useState<NetworkTab>('hedera')

    // Allocation segments for the bar chart (Hedera + Arbitrum only)
    const allocationSegments = useMemo(() => {
        const segments = [
            { network: 'hedera' as const, value: hederaTotalValue, bgColor: NETWORK_CONFIG.hedera.bgColor, label: NETWORK_CONFIG.hedera.label },
            { network: 'arbitrum' as const, value: evmTotalValue, bgColor: NETWORK_CONFIG.arbitrum.bgColor, label: NETWORK_CONFIG.arbitrum.label },
        ]
        const total = segments.reduce((s, seg) => s + seg.value, 0)
        return segments.map(seg => ({
            ...seg,
            percentage: total > 0 ? (seg.value / total) * 100 : 0,
        }))
    }, [hederaTotalValue, evmTotalValue])

    // Network values for tab display
    const networkValues: Record<NetworkTab, number> = {
        hedera: hederaTotalValue,
        arbitrum: evmTotalValue,
    }

    return (
        <div className="flex justify-center mt-28 w-full">
            <div className="max-w-6xl w-full px-4 space-y-6 pb-12">

                {/* ─── Hero Balance Section ─── */}
                <div className="bg-neutral-900 rounded-3xl p-6 sm:p-8">
                    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
                        {/* Left: Total value */}
                        <div className="space-y-1">
                            <p className="text-sm text-neutral-500 tracking-wide uppercase">Total Portfolio Value</p>
                            {isAnyLoading && !isConnected ? (
                                <Skeleton className="h-12 w-56" />
                            ) : (
                                <h1 className="text-5xl font-bold text-white tracking-tight font-mono tabular-nums">
                                    {isConnected ? formatUsd(totalValue) : '$0.00'}
                                </h1>
                            )}
                            {isConnected && isAnyLoading && (
                                <div className="flex items-center gap-2 mt-1">
                                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                                    <span className="text-xs text-neutral-500">Updating balances...</span>
                                </div>
                            )}
                        </div>

                        {/* Right: Network value pills */}
                        <div className="flex flex-wrap gap-2">
                            {NETWORK_TABS.map((network) => (
                                <NetworkValuePill
                                    key={network}
                                    network={network}
                                    value={networkValues[network]}
                                    percentage={allocationSegments.find(s => s.network === network)?.percentage ?? 0}
                                    isConnected={isConnected}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                {/* ─── Addresses ─── */}
                {isConnected && (custodialAccountId || custodialEvmAddress) && (
                    <div className="bg-neutral-900 rounded-3xl p-6">
                        <div className="flex flex-col sm:flex-row gap-4">
                            {custodialAccountId && (
                                <AddressCard
                                    label="Hedera"
                                    icon="/hedera-logo.png"
                                    address={custodialAccountId}
                                />
                            )}
                            {custodialEvmAddress && (
                                <AddressCard
                                    label="EVM (Arbitrum)"
                                    icon="/arbitrum-logo.png"
                                    address={custodialEvmAddress}
                                />
                            )}
                        </div>
                    </div>
                )}

                {/* ─── Network Allocation Bar ─── */}
                {isConnected && totalValue > 0 && (
                    <NetworkAllocationBar segments={allocationSegments} />
                )}

                {/* ─── Portfolio Card with Tabs ─── */}
                <div className="bg-neutral-900 rounded-3xl overflow-hidden">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-6 pt-6 pb-4">
                        <h2 className="text-xl font-bold text-white">My Portfolio</h2>
                        <div className="flex flex-wrap gap-1.5">
                            {NETWORK_TABS.map((tab) => {
                                const config = NETWORK_CONFIG[tab]
                                return (
                                    <button
                                        key={tab}
                                        onClick={() => setActiveTab(tab)}
                                        className={cn(
                                            'flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm transition-colors',
                                            activeTab === tab
                                                ? 'bg-neutral-100 text-neutral-900'
                                                : 'text-white/90 hover:text-white hover:bg-neutral-700/50'
                                        )}
                                    >
                                        <Image src={config.icon} alt={config.label} width={16} height={16} className="rounded-full" />
                                        <span>{config.label}</span>
                                        {isConnected && (
                                            <span className={cn(
                                                'text-xs font-mono tabular-nums',
                                                activeTab === tab ? 'text-neutral-600' : 'text-neutral-500'
                                            )}>
                                                {formatUsd(networkValues[tab])}
                                            </span>
                                        )}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* Content */}
                    <div className="px-6 pb-6">
                        {!isConnected ? (
                            <div className="flex flex-col items-center justify-center py-12">
                                <button
                                    onClick={() => setLoginOpen(true)}
                                    disabled={loading}
                                    className="flex items-center font-semibold text-lg justify-center gap-2 w-full max-w-xs py-2 px-5 rounded-full bg-neutral-100 text-neutral-900 hover:bg-neutral-300 transition-all disabled:opacity-50 disabled:cursor-wait"
                                >
                                    {loading ? 'Connecting...' : 'Login'}
                                </button>
                                <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
                            </div>
                        ) : activeTab === 'hedera' ? (
                            isHederaLoading && hederaAssets.length === 0 ? (
                                <div className="space-y-1">
                                    {[...Array(3)].map((_, i) => <TokenRowSkeleton key={i} />)}
                                </div>
                            ) : hederaAssets.length === 0 ? (
                                <EmptyState message="No tokens with balance found" />
                            ) : (
                                <div className="space-y-1">
                                    {hederaAssets.map((asset) => (
                                        <TokenRow
                                            key={asset.balanceKey}
                                            icon={asset.token.icon}
                                            name={asset.token.name}
                                            symbol={asset.token.symbol}
                                            balance={formatBalance(asset.balance)}
                                            valueUsd={formatUsd(asset.valueUsd)}
                                            price={asset.price > 0 ? formatUsd(asset.price) : '—'}
                                            portfolioPercent={totalValue > 0 ? (asset.valueUsd / totalValue) * 100 : undefined}
                                        />
                                    ))}
                                </div>
                            )
                        ) : activeTab === 'arbitrum' ? (
                            <>
                                {evmLoading ? (
                                        <div className="space-y-1">
                                            <TokenRowSkeleton />
                                            <TokenRowSkeleton />
                                        </div>
                                    ) : (
                                        <div className="space-y-1">
                                            <TokenRow
                                                icon="/EthLogo.png"
                                                name="Ethereum"
                                                symbol="ETH"
                                                balance={formatBalance(parseFloat(eth))}
                                                valueUsd={formatUsd(evmEthValue)}
                                                price={ethPriceUsd > 0 ? formatUsd(ethPriceUsd) : '—'}
                                                portfolioPercent={totalValue > 0 ? (evmEthValue / totalValue) * 100 : undefined}
                                            />
                                            <TokenRow
                                                icon="https://dwk1opv266jxs.cloudfront.net/icons/tokens/0.0.456858.png"
                                                name="USD Coin"
                                                symbol="USDC"
                                                balance={formatBalance(parseFloat(usdc))}
                                                valueUsd={formatUsd(evmUsdcValue)}
                                                price="$1.00"
                                                portfolioPercent={totalValue > 0 ? (evmUsdcValue / totalValue) * 100 : undefined}
                                            />
                                            <TokenRow
                                                icon="https://assets.coingecko.com/coins/images/325/small/Tether.png"
                                                name="Tether (OFT)"
                                                symbol="USD₮0"
                                                balance={formatBalance(parseFloat(usdt0))}
                                                valueUsd={formatUsd(evmUsdt0Value)}
                                                price="$1.00"
                                                portfolioPercent={totalValue > 0 ? (evmUsdt0Value / totalValue) * 100 : undefined}
                                            />
                                        </div>
                                    )}
                                </>
                        ) : null}
                    </div>
                </div>

            </div>
        </div>
    )
}

/* ─── Sub-components ─── */

function NetworkValuePill({
    network,
    value,
    percentage,
    isConnected,
}: {
    network: NetworkTab
    value: number
    percentage: number
    isConnected: boolean
}) {
    const config = NETWORK_CONFIG[network]
    return (
        <div className="flex items-center gap-2.5 bg-neutral-800/60 rounded-2xl px-4 py-2.5">
            <Image src={config.icon} alt={config.label} width={20} height={20} className="rounded-full" />
            <div>
                <p className="text-sm font-medium text-white font-mono tabular-nums">
                    {isConnected ? formatUsd(value) : '$0.00'}
                </p>
                <p className="text-xs text-neutral-500">{config.label} {isConnected && percentage > 0 ? `· ${percentage.toFixed(1)}%` : ''}</p>
            </div>
        </div>
    )
}

function NetworkAllocationBar({
    segments,
}: {
    segments: { network: string; value: number; percentage: number; bgColor: string; label: string }[]
}) {
    const activeSegments = segments.filter(s => s.percentage > 0)
    if (activeSegments.length === 0) return null

    return (
        <div className="bg-neutral-900 rounded-3xl p-6">
            {/* Bar */}
            <div className="h-3 rounded-full overflow-hidden flex bg-neutral-800">
                {activeSegments.map((seg) => (
                    <div
                        key={seg.network}
                        className={cn('h-full first:rounded-l-full last:rounded-r-full', seg.bgColor)}
                        style={{ width: `${Math.max(seg.percentage, 2)}%` }}
                    />
                ))}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4">
                {segments.map((seg) => (
                    <div key={seg.network} className="flex items-center gap-2">
                        <div className={cn('w-2.5 h-2.5 rounded-full', seg.bgColor)} />
                        <span className="text-sm text-neutral-400">{seg.label}</span>
                        <span className="text-sm font-mono tabular-nums text-white">{formatUsd(seg.value)}</span>
                        <span className="text-xs text-neutral-600 font-mono tabular-nums">
                            {seg.percentage > 0 ? `${seg.percentage.toFixed(1)}%` : '—'}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    )
}

function TokenRow({
    icon,
    fallbackIcon,
    name,
    symbol,
    balance,
    valueUsd,
    price,
    portfolioPercent,
}: {
    icon: string | null
    fallbackIcon?: React.ReactNode
    name: string
    symbol: string
    balance: string
    valueUsd: string
    price: string
    portfolioPercent?: number
}) {
    return (
        <div className="flex items-center justify-between px-4 py-3.5 rounded-2xl hover:bg-white/3 transition-colors">
            {/* 1. Token image */}
            <div className="flex items-center gap-3 min-w-0">
                {icon ? (
                    <TokenImage src={icon} alt={symbol} size={40} />
                ) : (
                    <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center shrink-0 overflow-hidden">
                        {fallbackIcon ?? <span className="text-xs font-bold text-neutral-400">{symbol.slice(0, 2)}</span>}
                    </div>
                )}

                {/* 2. Token symbol with market price below */}
                <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate" title={name}>
                        {symbol}
                    </p>
                    <p className="text-xs text-neutral-500 font-mono tabular-nums">{price}</p>
                </div>
            </div>

            {/* 3. Amount of tokens with USD value and % below */}
            <div className="text-right shrink-0 ml-4">
                <p className="text-sm font-medium text-white font-mono tabular-nums">
                    {balance} {symbol}
                </p>
                <p className="text-xs text-neutral-500 font-mono tabular-nums">
                    {valueUsd}
                    {portfolioPercent !== undefined && portfolioPercent > 0 && (
                        <span className="text-neutral-600 ml-1.5">· {portfolioPercent.toFixed(1)}%</span>
                    )}
                </p>
            </div>
        </div>
    )
}


function TokenRowSkeleton() {
    return (
        <div className="flex items-center justify-between px-4 py-3.5">
            <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-full" />
                <div className="space-y-2">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-3 w-16" />
                </div>
            </div>
            <div className="text-right space-y-2">
                <Skeleton className="h-3.5 w-20 ml-auto" />
                <Skeleton className="h-3 w-14 ml-auto" />
            </div>
        </div>
    )
}

function AddressCard({ label, icon, address }: { label: string; icon: string; address: string }) {
    const [copied, setCopied] = useState(false)

    const handleCopy = () => {
        navigator.clipboard.writeText(address)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const isLong = address.startsWith('0x')
    const displayAddress = isLong
        ? `${address.slice(0, 6)}...${address.slice(-4)}`
        : address

    return (
        <div className="flex-1 flex items-center gap-3 bg-neutral-800/60 rounded-2xl px-4 py-3 min-w-0">
            <Image src={icon} alt={label} width={20} height={20} className="rounded-full shrink-0" />
            <div className="min-w-0 flex-1">
                <p className="text-xs text-neutral-500">{label}</p>
                <p className="text-sm text-white font-mono truncate" title={address}>
                    {displayAddress}
                </p>
            </div>
            <button
                onClick={handleCopy}
                className="text-neutral-500 hover:text-white transition-colors shrink-0"
                title="Copy address"
            >
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
        </div>
    )
}

function EmptyState({ message, icon }: { message: string; icon?: React.ReactNode }) {
    return (
        <div className="flex flex-col items-center justify-center py-16 px-6">
            <div className="w-14 h-14 rounded-full bg-neutral-800 flex items-center justify-center mb-4">
                {icon ?? <Wallet className="w-6 h-6 text-neutral-600" />}
            </div>
            <p className="text-sm text-neutral-500 text-center max-w-xs">{message}</p>
        </div>
    )
}

