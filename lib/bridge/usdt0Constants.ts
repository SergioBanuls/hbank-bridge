/**
 * USDT0 Constants for Hedera <-> Arbitrum via LayerZero OFT
 *
 * USDT0 uses the OFT (Omnichain Fungible Token) standard.
 * Unlike the USDC bridge (custom Bridge V3 OApp), we interact
 * directly with USDT0's own OFT contracts. No liquidity needed.
 */

import { ethers } from 'ethers'
import { LAYER_ZERO_CONFIG } from './bridgeConstants'

// ============ USDT0 Token Addresses ============

export const USDT0_HEDERA = {
  TOKEN_ADDRESS: '0x00000000000000000000000000000000009Ce723' as `0x${string}`,
  TOKEN_ID: '0.0.10282787',
  OFT_ADDRESS: '0xe3119e23fC2371d1E6b01775ba312035425A53d6' as `0x${string}`,
  DECIMALS: 6,
} as const

export const USDT0_ARBITRUM = {
  TOKEN_ADDRESS: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9' as `0x${string}`,
  OFT_ADDRESS: '0x14E4A1B13bf7F943c8ff7C51fb60FA964A298D92' as `0x${string}`,
  DECIMALS: 6,
} as const

// ============ OFT ABI (LayerZero V2 IOFT interface) ============

export const OFT_ABI = [
  // quoteSend: estimate messaging fee
  'function quoteSend((uint32 dstEid, bytes32 to, uint256 amountLD, uint256 minAmountLD, bytes extraOptions, bytes composeMsg, bytes oftCmd) _sendParam, bool _payInLzToken) view returns ((uint256 nativeFee, uint256 lzTokenFee))',
  // send: execute cross-chain transfer
  'function send((uint32 dstEid, bytes32 to, uint256 amountLD, uint256 minAmountLD, bytes extraOptions, bytes composeMsg, bytes oftCmd) _sendParam, (uint256 nativeFee, uint256 lzTokenFee) _fee, address _refundAddress) payable returns ((bytes32 guid, uint64 nonce, (uint256 nativeFee, uint256 lzTokenFee) fee), (uint256 amountSentLD, uint256 amountReceivedLD))',
] as const

// Re-export EIDs from bridgeConstants for convenience
export const USDT0_LZ_CONFIG = {
  HEDERA_EID: LAYER_ZERO_CONFIG.HEDERA_MAINNET_EID,   // 30316
  ARBITRUM_EID: LAYER_ZERO_CONFIG.ARBITRUM_ONE_EID,    // 30110
} as const

// ============ Gas Configuration ============

export const USDT0_GAS_CONFIG = {
  HEDERA_OFT_SEND_GAS: 800_000,
  ARBITRUM_OFT_SEND_GAS: 300_000,
  ARBITRUM_APPROVE_GAS: 100_000,
} as const

// ============ Gas Drop Configuration ============
// LayerZero V2 extraOptions encoding for native gas drop on destination
// Type 3 options: executorLzReceiveOption (gas, value)
// See: https://docs.layerzero.network/v2/developers/evm/gas-settings/options

export const USDT0_GAS_DROP = {
  AMOUNT_WEI: '700000000000000', // 0.0007 ETH (~$2 at $3000/ETH), same as USDC bridge
} as const

/**
 * Build extraOptions bytes for LayerZero V2 gas drop.
 * Format: 0x0003 (type3) + encoded options
 * executorLzReceiveOption: optionType=3, gas=200000, value=gasDrop
 */
export function buildGasDropOptions(): string {
  const gasLimit = 200_000
  const nativeDropAmount = BigInt(USDT0_GAS_DROP.AMOUNT_WEI)

  // Standard LayerZero V2 extraOptions encoding:
  // 0x0003 01 0021 03 [16-byte gas] [16-byte value]
  const options = ethers.utils.solidityPack(
    ['uint16', 'uint8', 'uint16', 'uint8', 'uint128', 'uint128'],
    [3, 1, 33, 3, gasLimit, nativeDropAmount]
  )

  return options
}

/**
 * Build a SendParam struct for OFT.quoteSend() / OFT.send()
 */
export function buildSendParam(
  dstEid: number,
  receiverAddress: string,
  amountRaw: number,
  requestGasDrop: boolean = false
) {
  // Pad address to bytes32
  const to = ethers.utils.hexZeroPad(receiverAddress, 32)

  // 0.5% slippage safety net
  const minAmount = Math.floor(amountRaw * 0.995)

  return {
    dstEid,
    to,
    amountLD: amountRaw,
    minAmountLD: minAmount,
    extraOptions: requestGasDrop ? buildGasDropOptions() : '0x',
    composeMsg: '0x',
    oftCmd: '0x',
  }
}
