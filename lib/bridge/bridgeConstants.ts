/**
 * Bridge Constants for Hedera <-> Arbitrum Bridge
 *
 * Configuration for the HBank bridge including contract addresses,
 * token addresses, LayerZero endpoint IDs, gas and fee configuration.
 */

// ============ Network Configuration ============

export const HEDERA_CONFIG = {
    CHAIN_ID: 295,
    NETWORK: 'mainnet',
    USDC_TOKEN_ID: '0.0.456858',
    USDC_ADDRESS: '0x000000000000000000000000000000000006f89a' as `0x${string}`,
    MIRROR_NODE_URL: 'https://mainnet-public.mirrornode.hedera.com',
} as const

export const ARBITRUM_CONFIG = {
    CHAIN_ID: 42161,
    NETWORK: 'arbitrum-one',
    USDC_ADDRESS: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as `0x${string}`,
    WETH_ADDRESS: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' as `0x${string}`,
    BRIDGE_CONTRACT: '0xCFDA1CFf2b9f570817866434bBf60213764F0E61' as `0x${string}`,
    RPC_URL: 'https://arb1.arbitrum.io/rpc',
} as const

// ============ LayerZero Configuration ============

export const LAYER_ZERO_CONFIG = {
    HEDERA_MAINNET_EID: 30316,
    ARBITRUM_ONE_EID: 30110,
    HEDERA_MAINNET_ENDPOINT: '0x3A73033C0b1407574C76BdBAc67f126f6b4a9AA9' as `0x${string}`,
    ARBITRUM_ONE_ENDPOINT: '0x1a44076050125825900e736c501f859c50fE728c' as `0x${string}`,
} as const

// ============ Bridge V3 Configuration ============

export const BRIDGE_V3_CONFIG = {
    HEDERA: {
        CONTRACT_ID: process.env.NEXT_PUBLIC_BRIDGE_HEDERA_CONTRACT_ID || '0.0.10295928',
        ADDRESS: (process.env.NEXT_PUBLIC_BRIDGE_HEDERA_ADDRESS || '0x00000000000000000000000000000000009d1a78') as `0x${string}`,
    },
    ARBITRUM: {
        ADDRESS: (process.env.NEXT_PUBLIC_BRIDGE_ARBITRUM_ADDRESS || '0xCFDA1CFf2b9f570817866434bBf60213764F0E61') as `0x${string}`,
    },
    GAS_DROP_AMOUNT: 0.0007, // ETH (~$2 at $3000/ETH)
    LZ_RECEIVE_GAS: 140_000,
} as const

// ============ Fee Configuration ============

export const BRIDGE_FEES = {
    FEE_BASIS_POINTS: 30, // 0.3%
    MAX_FEE_BASIS_POINTS: 100, // 1%
} as const

// ============ Gas Configuration ============

export const GAS_CONFIG = {
    HEDERA_DEPOSIT_GAS_LIMIT: 500_000,
    ARBITRUM_RECEIVE_GAS_LIMIT: 140_000,
    ARBITRUM_WITHDRAW_GAS_LIMIT: 200_000,
} as const

// ============ HBAR Fee Estimates ============

export const ESTIMATED_LZ_FEE_NO_GAS_HBAR = 0.8
export const ESTIMATED_LZ_FEE_WITH_GAS_HBAR = 25
export const MAX_LZ_FEE_WITH_GAS_HBAR = 30
export const HEDERA_TX_FEE_MARGIN_HBAR = 0.5

export function getEstimatedHbarRequirement(hasGasDrop: boolean): { min: number; max: number } {
    if (hasGasDrop) {
        return { min: 25.5, max: 30.5 }
    }
    return { min: 1.3, max: 2.0 }
}

// ============ Minimum Bridge Amounts ============

export const MIN_SPOT_BRIDGE_NO_GAS_USD = 1

// ============ Types ============

export type BridgeStatus =
    | 'idle'
    | 'checking_balance'
    | 'approving'
    | 'quoting'
    | 'bridging'
    | 'waiting_lz'
    | 'confirming'
    | 'success'
    | 'error'

export type BridgeDirection = 'hedera_to_arbitrum' | 'arbitrum_to_hedera'

export interface BridgeTransaction {
    id: string
    direction: BridgeDirection
    amountUsdc: number
    status: BridgeStatus
    hederaTxHash?: string
    arbitrumTxHash?: string
    lzGuid?: string
    createdAt: number
    completedAt?: number
    error?: string
}

// ============ Utility Functions ============

export function hederaTokenIdToAddress(tokenId: string): `0x${string}` {
    const parts = tokenId.split('.')
    if (parts.length !== 3) {
        throw new Error(`Invalid Hedera token ID: ${tokenId}`)
    }
    const num = parseInt(parts[2], 10)
    return `0x${num.toString(16).padStart(40, '0')}` as `0x${string}`
}

export function getTargetChainId(direction: BridgeDirection): number {
    return direction === 'hedera_to_arbitrum'
        ? LAYER_ZERO_CONFIG.ARBITRUM_ONE_EID
        : LAYER_ZERO_CONFIG.HEDERA_MAINNET_EID
}

export function formatUsdc(amount: bigint | number): string {
    const value = typeof amount === 'bigint' ? Number(amount) : amount
    return (value / 1_000_000).toFixed(2)
}

export function parseUsdc(amount: string | number): bigint {
    const value = typeof amount === 'string' ? parseFloat(amount) : amount
    return BigInt(Math.floor(value * 1_000_000))
}

export function calculateAmountAfterFee(amount: number): {
    amountAfterFee: number
    feeAmount: number
} {
    const feeAmount = (amount * BRIDGE_FEES.FEE_BASIS_POINTS) / 10000
    return {
        amountAfterFee: amount - feeAmount,
        feeAmount,
    }
}

export function estimateBridgeCost(
    direction: BridgeDirection,
    amountUsdc: number,
): {
    bridgeFee: number
    lzFee: number
    totalCost: number
    amountReceived: number
} {
    const bridgeFee = (amountUsdc * BRIDGE_FEES.FEE_BASIS_POINTS) / 10000
    const lzFee = direction === 'hedera_to_arbitrum' ? 0.5 : 1.0
    const totalCost = bridgeFee + lzFee
    const amountReceived = amountUsdc - bridgeFee

    return { bridgeFee, lzFee, totalCost, amountReceived }
}

export function accountIdToEvmAddress(accountId: string): `0x${string}` {
    const parts = accountId.split('.')
    if (parts.length !== 3) {
        throw new Error(`Invalid Hedera account ID: ${accountId}`)
    }
    const num = parseInt(parts[2], 10)
    return `0x${num.toString(16).padStart(40, '0')}` as `0x${string}`
}
