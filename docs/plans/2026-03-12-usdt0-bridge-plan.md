# USDT0 Bridge Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add USDT0 bridging (Hedera <-> Arbitrum) via direct LayerZero OFT interaction, with transfer and portfolio support.

**Architecture:** Direct integration with USDT0 OFT contracts on both chains. No custom bridge contracts needed. Backend KMS signing handles both Hedera (ContractExecuteTransaction with raw ABI calldata) and Arbitrum (KMSSigner via ethers.js). Frontend adds USDT0 as a selectable token alongside USDC.

**Tech Stack:** Next.js 15, ethers.js 5, @hashgraph/sdk, AWS KMS, LayerZero OFT V2

---

## Task 1: Create USDT0 Constants and OFT ABI

**Files:**
- Create: `lib/bridge/usdt0Constants.ts`

**Step 1: Create the constants file**

```typescript
/**
 * USDT0 Constants for Hedera <-> Arbitrum via LayerZero OFT
 *
 * USDT0 uses the OFT (Omnichain Fungible Token) standard.
 * Unlike the USDC bridge (custom Bridge V3 OApp), we interact
 * directly with USDT0's own OFT contracts. No liquidity needed.
 */

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
 * executorLzReceiveOption: optionType=1, gas=200000, value=gasDrop
 */
export function buildGasDropOptions(): string {
  // Type 3 header (2 bytes): 0x0003
  // Worker ID (1 byte): 0x01 (executor)
  // Option length (2 bytes): 0x0031 (49 bytes for gas+value)
  // Option type (1 byte): 0x03 (lzNativeDrop)
  // Gas amount (16 bytes): 200000 = 0x30d40
  // Native drop amount (16 bytes): 700000000000000 = 0x27ca57357c000
  // Native drop address (20 bytes): 0x00...00 (will be filled by receiver)

  // Actually, for a simpler approach, use the standard encoding:
  // Type 3 options with executorLzReceiveOption(gas, value)
  const { ethers } = require('ethers')

  // Standard LayerZero V2 extraOptions encoding:
  // 0x0003 + optionType(1) + data
  // For gas + native drop: option type 3 = lzReceive with gas and value
  const gasLimit = 200_000
  const nativeDropAmount = BigInt(USDT0_GAS_DROP.AMOUNT_WEI)

  // Encode as: 0x0003 01 0011 03 [16-byte gas] [16-byte value]
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
  const { ethers } = require('ethers')

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
```

**Step 2: Verify the file compiles**

Run: `cd /Users/sergiobanuls/Documents/PERSONAL/hbank-bridge && npx tsc --noEmit lib/bridge/usdt0Constants.ts 2>&1 | head -20`

If there are import issues, fix them. The file may need adjustment for ethers import patterns used in this project.

**Step 3: Commit**

```bash
git add lib/bridge/usdt0Constants.ts
git commit -m "feat: add USDT0 constants, OFT ABI, and SendParam builder"
```

---

## Task 2: Create USDT0 Quote Transaction Builder (Client-Side)

**Files:**
- Create: `lib/bridge/usdt0TransactionBuilder.ts`

**Step 1: Create the client-side quote fetcher**

Follow the exact same pattern as `lib/bridge/bridgeTransactionBuilder.ts`:

```typescript
/**
 * USDT0 Bridge Quote Fetcher
 *
 * Fetches OFT quoteSend() results from the USDT0 quote API.
 * Transaction building is handled server-side by the KMS endpoints.
 */

export interface Usdt0QuoteResult {
  success: boolean
  nativeFee: string        // Raw fee in smallest unit (tinybar or wei)
  nativeFeeFormatted: string // Human-readable (HBAR or ETH)
  direction: 'hedera_to_arbitrum' | 'arbitrum_to_hedera'
  error?: string
}

/**
 * Fetch USDT0 bridge quote via OFT quoteSend()
 */
export async function fetchUsdt0Quote(
  amount: string,
  receiver: string,
  direction: 'hedera_to_arbitrum' | 'arbitrum_to_hedera',
  requestGasDrop: boolean = false
): Promise<Usdt0QuoteResult> {
  try {
    const response = await fetch('/api/bridge/quote-usdt0', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, receiver, direction, requestGasDrop }),
    })

    const data = await response.json()

    if (!response.ok || !data.success) {
      return {
        success: false,
        nativeFee: '0',
        nativeFeeFormatted: '0',
        direction,
        error: data.error || 'Failed to get USDT0 quote',
      }
    }

    return {
      success: true,
      nativeFee: data.nativeFee,
      nativeFeeFormatted: data.nativeFeeFormatted,
      direction,
    }
  } catch (error) {
    console.error('[USDT0 Quote] Error:', error)
    return {
      success: false,
      nativeFee: '0',
      nativeFeeFormatted: '0',
      direction,
      error: 'Network error while fetching USDT0 quote',
    }
  }
}
```

**Step 2: Commit**

```bash
git add lib/bridge/usdt0TransactionBuilder.ts
git commit -m "feat: add USDT0 client-side quote fetcher"
```

---

## Task 3: Create USDT0 Quote API Endpoint

**Files:**
- Create: `app/api/bridge/quote-usdt0/route.ts`

**Step 1: Create the quote endpoint**

Follow the pattern of `app/api/bridge/quote-v3/route.ts` but call OFT.quoteSend() instead:

```typescript
/**
 * USDT0 Bridge Quote API (bidirectional)
 *
 * Calls OFT.quoteSend() on the source chain to get LayerZero messaging fee.
 *
 * POST /api/bridge/quote-usdt0
 * Body: { amount: "100", receiver: "0x...", direction: "hedera_to_arbitrum"|"arbitrum_to_hedera", requestGasDrop?: boolean }
 * Returns: { success: true, nativeFee: "...", nativeFeeFormatted: "..." }
 */

import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { OFT_ABI, USDT0_HEDERA, USDT0_ARBITRUM, USDT0_LZ_CONFIG, buildSendParam } from '@/lib/bridge/usdt0Constants'

const HEDERA_RPC = process.env.HEDERA_RPC_URL || 'https://mainnet.hashio.io/api'

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
}

export async function POST(request: NextRequest) {
  try {
    let body: {
      amount: string
      receiver: string
      direction: 'hedera_to_arbitrum' | 'arbitrum_to_hedera'
      requestGasDrop?: boolean
    }

    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON' },
        { status: 400, headers: securityHeaders }
      )
    }

    if (!body.amount || !body.receiver || !body.direction) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: amount, receiver, direction' },
        { status: 400, headers: securityHeaders }
      )
    }

    if (!ethers.utils.isAddress(body.receiver)) {
      return NextResponse.json(
        { success: false, error: 'Invalid receiver address' },
        { status: 400, headers: securityHeaders }
      )
    }

    const amountFloat = parseFloat(body.amount)
    if (isNaN(amountFloat) || amountFloat <= 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid amount' },
        { status: 400, headers: securityHeaders }
      )
    }

    const amountRaw = Math.floor(amountFloat * 1_000_000) // 6 decimals
    const requestGasDrop = body.requestGasDrop || false
    const isHederaToArb = body.direction === 'hedera_to_arbitrum'

    // Build SendParam
    const dstEid = isHederaToArb ? USDT0_LZ_CONFIG.ARBITRUM_EID : USDT0_LZ_CONFIG.HEDERA_EID
    const sendParam = buildSendParam(dstEid, body.receiver, amountRaw, requestGasDrop)

    // Encode quoteSend call
    const iface = new ethers.utils.Interface(OFT_ABI)
    const calldata = iface.encodeFunctionData('quoteSend', [
      [
        sendParam.dstEid,
        sendParam.to,
        sendParam.amountLD,
        sendParam.minAmountLD,
        sendParam.extraOptions,
        sendParam.composeMsg,
        sendParam.oftCmd,
      ],
      false, // payInLzToken
    ])

    // Determine which OFT contract and RPC to use
    let rpcUrl: string
    let oftAddress: string

    if (isHederaToArb) {
      rpcUrl = HEDERA_RPC
      oftAddress = USDT0_HEDERA.OFT_ADDRESS
    } else {
      rpcUrl = process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc'
      oftAddress = USDT0_ARBITRUM.OFT_ADDRESS
    }

    // Call via JSON-RPC
    const rpcResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_call',
        params: [{ to: oftAddress, data: calldata }, 'latest'],
        id: 1,
      }),
    })

    if (!rpcResponse.ok) {
      throw new Error(`RPC request failed: ${rpcResponse.status}`)
    }

    const rpcResult = await rpcResponse.json()
    if (rpcResult.error) {
      throw new Error(rpcResult.error.message || 'RPC error')
    }

    // Decode result: returns MessagingFee (nativeFee, lzTokenFee)
    const decoded = iface.decodeFunctionResult('quoteSend', rpcResult.result)
    const nativeFee = decoded[0].nativeFee || decoded[0][0]

    // Format fee based on direction
    let nativeFeeFormatted: string
    if (isHederaToArb) {
      // Hedera: fee in tinybar (8 decimals)
      nativeFeeFormatted = `${(Number(nativeFee) / 1e8).toFixed(4)} HBAR`
    } else {
      // Arbitrum: fee in wei (18 decimals)
      nativeFeeFormatted = `${ethers.utils.formatEther(nativeFee)} ETH`
    }

    return NextResponse.json({
      success: true,
      nativeFee: nativeFee.toString(),
      nativeFeeFormatted,
      direction: body.direction,
    }, { headers: securityHeaders })
  } catch (error) {
    const err = error as { message?: string; reason?: string }
    const message = err.message || 'Failed to get USDT0 quote'
    console.error('[USDT0 Quote] Error:', message)

    if (message.includes('could not detect network')) {
      return NextResponse.json(
        { success: false, error: 'RPC connection failed' },
        { status: 503, headers: securityHeaders }
      )
    }

    return NextResponse.json(
      { success: false, error: message },
      { status: 500, headers: securityHeaders }
    )
  }
}
```

**Step 2: Test manually**

Run the dev server and test with curl:

```bash
curl -X POST http://localhost:3000/api/bridge/quote-usdt0 \
  -H "Content-Type: application/json" \
  -d '{"amount":"10","receiver":"0x0000000000000000000000000000000000000001","direction":"hedera_to_arbitrum"}'
```

Expected: `{ success: true, nativeFee: "...", nativeFeeFormatted: "... HBAR" }`

**Step 3: Commit**

```bash
git add app/api/bridge/quote-usdt0/route.ts
git commit -m "feat: add USDT0 quote endpoint via OFT quoteSend"
```

---

## Task 4: Add USDT0 Types to KMS Types

**Files:**
- Modify: `types/kms.ts`

**Step 1: Add USDT0 bridge request types and transaction types**

Add to `KMSTransactionType` union (around line 46):

```typescript
export type KMSTransactionType =
  | 'token_association'
  | 'token_approval'
  | 'account_create'
  | 'transfer'
  | 'bridge'
  | 'bridge_reverse'
  | 'bridge_usdt0'
  | 'bridge_usdt0_reverse'
  | 'transfer_evm'
  | 'key_rotation'
```

Add new request types after `SignBridgeRequest` (after line 113):

```typescript
export interface SignBridgeUsdt0Request {
  amount: string          // USDT0 amount (human readable, e.g., "10.5")
  receiverAddress: string // Destination address on Arbitrum (0x...)
  requestGasDrop: boolean
  lzFeeHbar: number       // LayerZero fee in HBAR (from quote)
}

export interface SignBridgeUsdt0ReverseRequest {
  amount: string          // USDT0 amount (human readable)
  requestGasDrop?: boolean
}
```

**Step 2: Commit**

```bash
git add types/kms.ts
git commit -m "feat: add USDT0 bridge types to KMS type definitions"
```

---

## Task 5: Add USDT0 Bridge Signing to Transaction Signer

**Files:**
- Modify: `lib/kms/transaction-signer.ts`

**Step 1: Add USDT0 bridge approval function**

Add after `signAndExecuteBridgeApproval` (after line 301). This approves USDT0 token to the OFT contract (not Bridge V3):

```typescript
/**
 * Build, sign, and execute USDT0 token approval for OFT contract via KMS.
 */
export async function signAndExecuteUsdt0Approval(
  amount: string,
  accountId: string,
  kmsKeyId: string,
  publicKeyHex: string
): Promise<string> {
  const client = getNetworkClient()

  try {
    const payer = AccountId.fromString(accountId)
    const usdt0TokenId = '0.0.10282787'
    // OFT contract on Hedera - convert EVM address to account ID
    const oftContractId = '0.0.7988003' // TODO: verify this is the correct Hedera entity ID for 0xe3119e23fC2371d1E6b01775ba312035425A53d6

    const amountFloat = parseFloat(amount)
    const amountRaw = Math.floor(amountFloat * 1_000_000)
    const approvalAmount = amountRaw * 10 // 10x for future transactions

    const transaction = new AccountAllowanceApproveTransaction()
      .setTransactionId(TransactionId.generate(payer))
      .approveTokenAllowance(
        TokenId.fromString(usdt0TokenId),
        payer,
        AccountId.fromString(oftContractId),
        approvalAmount
      )
      .setNodeAccountIds([DEFAULT_NODE])
      .freezeWith(client)

    return await signAndExecuteWithKMS(transaction, kmsKeyId, publicKeyHex, client)
  } finally {
    client.close()
  }
}
```

**Step 2: Add USDT0 OFT send function**

Add after the approval function. This calls OFT.send() via ContractExecuteTransaction with raw ABI-encoded calldata:

```typescript
/**
 * Build, sign, and execute USDT0 OFT send() for cross-chain bridge via KMS.
 *
 * Uses raw ABI encoding via ethers since OFT.send() takes complex struct params
 * that ContractFunctionParameters cannot easily encode.
 */
export async function signAndExecuteUsdt0Bridge(
  params: import('@/types/kms').SignBridgeUsdt0Request,
  accountId: string,
  kmsKeyId: string,
  publicKeyHex: string
): Promise<string> {
  const { ethers } = await import('ethers')
  const { OFT_ABI, USDT0_HEDERA, USDT0_LZ_CONFIG, buildSendParam } = await import('@/lib/bridge/usdt0Constants')

  const client = getNetworkClient()

  try {
    const payer = AccountId.fromString(accountId)
    const amountFloat = parseFloat(params.amount)
    const amountRaw = Math.floor(amountFloat * 1_000_000)

    // Build OFT SendParam
    const sendParam = buildSendParam(
      USDT0_LZ_CONFIG.ARBITRUM_EID,
      params.receiverAddress,
      amountRaw,
      params.requestGasDrop
    )

    // Convert LZ fee from HBAR to tinybar for msg.value
    const feeWithBuffer = Math.ceil(params.lzFeeHbar * 1.2 * 100) / 100

    // Build MessagingFee struct (nativeFee in tinybar, lzTokenFee = 0)
    const nativeFeeTinybar = Math.floor(params.lzFeeHbar * 1e8)
    const messagingFee = {
      nativeFee: nativeFeeTinybar,
      lzTokenFee: 0,
    }

    // Refund address = sender's EVM address (derived from Hedera account)
    const { accountIdToEvmAddress } = await import('@/lib/bridge/bridgeConstants')
    const refundAddress = accountIdToEvmAddress(accountId)

    // Encode the full calldata via ethers ABI
    const iface = new ethers.utils.Interface(OFT_ABI)
    const calldata = iface.encodeFunctionData('send', [
      [
        sendParam.dstEid,
        sendParam.to,
        sendParam.amountLD,
        sendParam.minAmountLD,
        sendParam.extraOptions,
        sendParam.composeMsg,
        sendParam.oftCmd,
      ],
      [messagingFee.nativeFee, messagingFee.lzTokenFee],
      refundAddress,
    ])

    // Use raw function parameters (includes 4-byte selector)
    const calldataBytes = Buffer.from(calldata.slice(2), 'hex')

    // OFT contract on Hedera
    const oftContractId = '0.0.7988003' // TODO: verify correct entity ID

    const transaction = new ContractExecuteTransaction()
      .setTransactionId(TransactionId.generate(payer))
      .setContractId(oftContractId)
      .setGas(800_000)
      .setFunctionParameters(calldataBytes)
      .setPayableAmount(new Hbar(feeWithBuffer))
      .setNodeAccountIds([DEFAULT_NODE])
      .freezeWith(client)

    return await signAndExecuteWithKMS(transaction, kmsKeyId, publicKeyHex, client)
  } finally {
    client.close()
  }
}
```

**Step 3: Commit**

```bash
git add lib/kms/transaction-signer.ts
git commit -m "feat: add USDT0 OFT approval and send signing functions"
```

---

## Task 6: Create sign-bridge-usdt0 API Endpoint (Hedera → Arbitrum)

**Files:**
- Create: `app/api/kms/sign-bridge-usdt0/route.ts`

**Step 1: Create the endpoint**

Follow the exact pattern of `app/api/kms/sign-bridge/route.ts`:

```typescript
/**
 * POST /api/kms/sign-bridge-usdt0
 *
 * Signs and executes a USDT0 bridge (Hedera → Arbitrum) via OFT.send().
 * First executes HTS approval to OFT contract, then calls OFT.send().
 */

import { NextRequest, NextResponse } from 'next/server'
import { validateSigningRequest, recordSigningOperation, AuthError } from '@/lib/kms/rate-limiter'
import { signAndExecuteUsdt0Approval, signAndExecuteUsdt0Bridge } from '@/lib/kms/transaction-signer'
import type { SignBridgeUsdt0Request } from '@/types/kms'

export async function POST(request: NextRequest) {
  let ctx

  try {
    // 1. Validate auth, account, and rate limits
    ctx = await validateSigningRequest(request)

    // 2. Parse and validate request body
    const body: SignBridgeUsdt0Request = await request.json()

    if (!body.amount || !body.receiverAddress || body.lzFeeHbar === undefined) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters: amount, receiverAddress, lzFeeHbar' },
        { status: 400 }
      )
    }

    const amountFloat = parseFloat(body.amount)
    if (isNaN(amountFloat) || amountFloat <= 0) {
      return NextResponse.json(
        { success: false, error: 'Amount must be a positive number' },
        { status: 400 }
      )
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(body.receiverAddress)) {
      return NextResponse.json(
        { success: false, error: 'Invalid receiver address' },
        { status: 400 }
      )
    }

    // 3. Execute HTS approval for OFT contract
    await signAndExecuteUsdt0Approval(
      body.amount,
      ctx.accountId,
      ctx.kmsKeyId,
      ctx.publicKeyHex
    )

    // 4. Execute OFT.send() bridge transaction
    const transactionId = await signAndExecuteUsdt0Bridge(
      body,
      ctx.accountId,
      ctx.kmsKeyId,
      ctx.publicKeyHex
    )

    // 5. Record audit
    await recordSigningOperation(ctx, 'bridge_usdt0', {
      amount: body.amount,
      receiverAddress: body.receiverAddress,
      requestGasDrop: body.requestGasDrop,
      lzFeeHbar: body.lzFeeHbar,
    }, { transactionId })

    return NextResponse.json({
      success: true,
      transactionId,
    })
  } catch (error: any) {
    console.error('Error in sign-bridge-usdt0:', error)

    if (ctx) {
      await recordSigningOperation(ctx, 'bridge_usdt0', {}, { error: error.message }).catch(() => {})
    }

    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      )
    }

    const msg = error.message || 'USDT0 bridge failed'
    if (msg.includes('INSUFFICIENT_PAYER_BALANCE')) {
      return NextResponse.json(
        { success: false, error: 'Insufficient HBAR to pay bridge fees. Send HBAR to your Hedera account first.' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    )
  }
}
```

**Step 2: Commit**

```bash
git add app/api/kms/sign-bridge-usdt0/route.ts
git commit -m "feat: add USDT0 bridge endpoint (Hedera -> Arbitrum)"
```

---

## Task 7: Create sign-bridge-usdt0-reverse API Endpoint (Arbitrum → Hedera)

**Files:**
- Create: `app/api/kms/sign-bridge-usdt0-reverse/route.ts`

**Step 1: Create the endpoint**

Follow the pattern of `app/api/kms/sign-bridge-reverse/route.ts` but using OFT contracts:

```typescript
/**
 * Sign USDT0 Bridge Reverse (Arbitrum → Hedera) via KMS
 *
 * Uses KMSSigner to sign EVM transactions on Arbitrum calling OFT.send().
 * Auto-associates USDT0 token on Hedera if needed.
 *
 * POST /api/kms/sign-bridge-usdt0-reverse
 * Body: { amount: string, requestGasDrop?: boolean }
 */

import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { validateSigningRequest, recordSigningOperation, AuthError } from '@/lib/kms/rate-limiter'
import { createArbitrumKMSSigner } from '@/lib/kms/evm-signer'
import { signAndExecuteAssociation } from '@/lib/kms/transaction-signer'
import { deriveEvmAddress } from '@/lib/kms/evm-utils'
import { supabaseAdmin } from '@/lib/supabase'
import { accountIdToEvmAddress } from '@/lib/bridge/bridgeConstants'
import {
  OFT_ABI,
  USDT0_ARBITRUM,
  USDT0_HEDERA,
  USDT0_LZ_CONFIG,
  USDT0_GAS_CONFIG,
  buildSendParam,
} from '@/lib/bridge/usdt0Constants'
import type { SignBridgeUsdt0ReverseRequest } from '@/types/kms'

const ERC20_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
]

export async function POST(request: NextRequest) {
  let ctx

  try {
    // 1. Auth + rate limit
    ctx = await validateSigningRequest(request)

    // 2. Parse request
    const body: SignBridgeUsdt0ReverseRequest = await request.json()

    if (!body.amount) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: amount' },
        { status: 400 }
      )
    }

    const amountFloat = parseFloat(body.amount)
    if (isNaN(amountFloat) || amountFloat <= 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid amount' },
        { status: 400 }
      )
    }

    const amountRaw = Math.floor(amountFloat * 1_000_000)

    // 3. Derive EVM address
    const evmAddress = deriveEvmAddress(ctx.publicKeyHex)

    // Persist evm_address if not yet stored
    const db = supabaseAdmin()
    await db
      .from('custodial_accounts')
      .update({ evm_address: evmAddress })
      .eq('user_id', ctx.userId)
      .is('evm_address', null)

    // 4. Create KMS-backed Signer on Arbitrum
    const signer = await createArbitrumKMSSigner(ctx.kmsKeyId)
    const signerAddress = await signer.getAddress()
    if (signerAddress.toLowerCase() !== evmAddress.toLowerCase()) {
      throw new Error(`Address mismatch: derived ${evmAddress} vs signer ${signerAddress}`)
    }

    const provider = signer.provider!

    // 5. Check USDT0 balance on Arbitrum
    const usdt0Contract = new ethers.Contract(USDT0_ARBITRUM.TOKEN_ADDRESS, ERC20_ABI, provider)
    const balance = await usdt0Contract.balanceOf(evmAddress)
    if (balance.lt(amountRaw)) {
      return NextResponse.json(
        { success: false, error: `Insufficient USDT0 on Arbitrum. Have: ${ethers.utils.formatUnits(balance, 6)}, need: ${body.amount}` },
        { status: 400 }
      )
    }

    // 6. Check ETH for gas
    const ethBalance = await provider.getBalance(evmAddress)
    if (ethBalance.isZero()) {
      return NextResponse.json(
        { success: false, error: 'No ETH on Arbitrum for gas fees. Send ETH to your EVM address first.' },
        { status: 400 }
      )
    }

    // 7. Auto-associate USDT0 on Hedera if needed
    try {
      const mirrorUrl = process.env.NEXT_PUBLIC_MIRROR_NODE_URL || 'https://mainnet-public.mirrornode.hedera.com'
      const tokensRes = await fetch(`${mirrorUrl}/api/v1/accounts/${ctx.accountId}/tokens?token.id=${USDT0_HEDERA.TOKEN_ID}`)
      const tokensData = await tokensRes.json()
      if (!tokensData.tokens || tokensData.tokens.length === 0) {
        // Token not associated — associate it
        await signAndExecuteAssociation(
          { tokenId: USDT0_HEDERA.TOKEN_ID },
          ctx.accountId,
          ctx.kmsKeyId,
          ctx.publicKeyHex
        )
      }
    } catch (assocError: any) {
      // If already associated, TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT is fine
      if (!assocError.message?.includes('TOKEN_ALREADY_ASSOCIATED')) {
        console.warn('[USDT0 Reverse] Association check/attempt failed:', assocError.message)
      }
    }

    // 8. Get OFT quote on Arbitrum
    const receiverEvmAddress = accountIdToEvmAddress(ctx.accountId)
    const sendParam = buildSendParam(
      USDT0_LZ_CONFIG.HEDERA_EID,
      receiverEvmAddress,
      amountRaw,
      body.requestGasDrop || false
    )

    const oftContract = new ethers.Contract(USDT0_ARBITRUM.OFT_ADDRESS, OFT_ABI, provider)
    const messagingFee = await oftContract.quoteSend(
      [
        sendParam.dstEid,
        sendParam.to,
        sendParam.amountLD,
        sendParam.minAmountLD,
        sendParam.extraOptions,
        sendParam.composeMsg,
        sendParam.oftCmd,
      ],
      false
    )
    const nativeFee = messagingFee.nativeFee || messagingFee[0]
    const feeWithBuffer = nativeFee.mul(120).div(100) // 20% buffer

    // 9. Check USDT0 allowance → approve OFT if needed
    const allowance = await usdt0Contract.allowance(evmAddress, USDT0_ARBITRUM.OFT_ADDRESS)
    if (allowance.lt(amountRaw)) {
      const approveAmount = ethers.BigNumber.from(amountRaw).mul(10)
      const usdt0WithSigner = usdt0Contract.connect(signer)
      const approveTx = await usdt0WithSigner.approve(USDT0_ARBITRUM.OFT_ADDRESS, approveAmount, {
        gasLimit: USDT0_GAS_CONFIG.ARBITRUM_APPROVE_GAS,
      })
      await approveTx.wait()
    }

    // 10. Execute OFT.send()
    const oftWithSigner = oftContract.connect(signer)
    const bridgeTx = await oftWithSigner.send(
      [
        sendParam.dstEid,
        sendParam.to,
        sendParam.amountLD,
        sendParam.minAmountLD,
        sendParam.extraOptions,
        sendParam.composeMsg,
        sendParam.oftCmd,
      ],
      [nativeFee, 0], // MessagingFee: use exact quote (buffer is in msg.value)
      evmAddress,      // refundAddress
      {
        value: feeWithBuffer,
        gasLimit: USDT0_GAS_CONFIG.ARBITRUM_OFT_SEND_GAS,
      }
    )
    const receipt = await bridgeTx.wait()

    // 11. Record audit
    await recordSigningOperation(ctx, 'bridge_usdt0_reverse', {
      amount: body.amount,
      evmAddress,
      receiverHederaAccount: ctx.accountId,
      receiverEvmAddress,
      requestGasDrop: body.requestGasDrop || false,
      nativeFeeWei: nativeFee.toString(),
    }, { transactionId: receipt.transactionHash })

    return NextResponse.json({
      success: true,
      txHash: receipt.transactionHash,
      explorerUrl: `https://arbiscan.io/tx/${receipt.transactionHash}`,
    })
  } catch (error: any) {
    console.error('[sign-bridge-usdt0-reverse] Error:', error)

    if (ctx) {
      await recordSigningOperation(ctx, 'bridge_usdt0_reverse', {}, { error: error.message }).catch(() => {})
    }

    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      )
    }

    return NextResponse.json(
      { success: false, error: error.message || 'USDT0 bridge reverse failed' },
      { status: 500 }
    )
  }
}
```

**Step 2: Commit**

```bash
git add app/api/kms/sign-bridge-usdt0-reverse/route.ts
git commit -m "feat: add USDT0 reverse bridge endpoint (Arbitrum -> Hedera)"
```

---

## Task 8: Add USDT0 to useCustodialConnection Hook

**Files:**
- Modify: `hooks/useCustodialConnection.ts`

**Step 1: Add signBridgeUsdt0 and signBridgeUsdt0Reverse methods**

Add after `signBridgeReverse` (after line 111):

```typescript
  /**
   * Sign and execute a USDT0 bridge (Hedera → Arbitrum) via KMS + OFT.
   */
  const signBridgeUsdt0 = async (
    amount: string,
    receiverAddress: string,
    requestGasDrop: boolean,
    lzFeeHbar: number
  ) => {
    if (!token) throw new Error('Not authenticated')
    return custodialFetch('/api/kms/sign-bridge-usdt0', token, {
      amount,
      receiverAddress,
      requestGasDrop,
      lzFeeHbar,
    })
  }

  /**
   * Sign and execute a USDT0 reverse bridge (Arbitrum → Hedera) via KMS + OFT.
   */
  const signBridgeUsdt0Reverse = async (
    amount: string,
    requestGasDrop?: boolean
  ) => {
    if (!token) throw new Error('Not authenticated')
    return custodialFetch('/api/kms/sign-bridge-usdt0-reverse', token, {
      amount,
      requestGasDrop: requestGasDrop || false,
    })
  }
```

Add to the return object:

```typescript
  return {
    custodialAccountId,
    signAssociate,
    signApprove,
    signTransfer,
    signBridge,
    signBridgeReverse,
    signBridgeUsdt0,
    signBridgeUsdt0Reverse,
  }
```

**Step 2: Commit**

```bash
git add hooks/useCustodialConnection.ts
git commit -m "feat: add USDT0 bridge methods to custodial connection hook"
```

---

## Task 9: Add USDT0 to useBridge Hook

**Files:**
- Modify: `hooks/useBridge.ts`

**Step 1: Import USDT0 dependencies**

Add to imports (around line 12):

```typescript
import { fetchUsdt0Quote } from '@/lib/bridge/usdt0TransactionBuilder'
```

Update the destructuring from `useCustodialConnection()` (line 42):

```typescript
const { signBridge, signBridgeUsdt0, signBridgeUsdt0Reverse } = useCustodialConnection()
```

**Step 2: Add bridgeUsdt0ToArbitrum function**

Add after `bridgeToArbitrum` (after line 271):

```typescript
  /**
   * Bridge USDT0 from Hedera to Arbitrum via OFT
   */
  const bridgeUsdt0ToArbitrum = useCallback(async (
    amount: string,
    receiverAddress: string,
    requestGasDrop: boolean = false
  ) => {
    if (!account || !isConnected) {
      setError('Wallet not connected')
      return
    }

    setState(prev => ({
      ...prev,
      direction: 'hedera_to_arbitrum',
      status: 'quoting',
      statusMessage: 'Getting USDT0 LayerZero quote...',
      error: null,
      transactionId: null,
    }))

    try {
      // 1. Fetch OFT quote
      const quote = await fetchUsdt0Quote(amount, receiverAddress, 'hedera_to_arbitrum', requestGasDrop)
      if (!quote.success) {
        setError(quote.error || 'Failed to get USDT0 quote')
        return
      }

      const lzFeeHbar = Number(quote.nativeFee) / 1e8

      // 2. Get initial Arbitrum USDT0 balance for tracking
      let initialBalance = '0'
      try {
        const balRes = await fetch(`/api/bridge/arbitrum-balance?address=${receiverAddress}&token=usdt0`)
        const balData = await balRes.json()
        if (balData.success) {
          initialBalance = balData.usdt0Balance || '0'
        }
      } catch {
        // Continue with 0
      }

      // 3. Sign and execute via KMS
      setStatus('approving', 'Approving USDT0 for bridge...')
      const bridgeResult = await signBridgeUsdt0(amount, receiverAddress, requestGasDrop, lzFeeHbar)
      const transactionId = bridgeResult.transactionId

      setState(prev => ({ ...prev, transactionId }))

      // 4. Track delivery (same LZ tracking)
      await trackBridge(transactionId, receiverAddress, initialBalance)
    } catch (error: any) {
      console.error('[USDT0 Bridge] Error:', error)
      const msg = error.message || 'USDT0 bridge failed'
      if (msg.includes('INSUFFICIENT_PAYER_BALANCE')) {
        setError('Insufficient HBAR to pay bridge fees.')
      } else {
        setError(msg)
      }
    }
  }, [account, isConnected, signBridgeUsdt0, setStatus, setError, trackBridge])
```

**Step 3: Add bridgeUsdt0ToHedera function**

Add after the new function:

```typescript
  /**
   * Bridge USDT0 from Arbitrum to Hedera via OFT (KMS custodial)
   */
  const bridgeUsdt0ToHedera = useCallback(async (
    amount: string,
    hederaReceiverAccountId: string
  ) => {
    if (connectionMode !== 'custodial') {
      setError('USDT0 reverse bridge requires custodial account')
      return
    }

    try {
      setState(prev => ({
        ...prev,
        direction: 'arbitrum_to_hedera',
        status: 'bridging',
        statusMessage: 'Signing USDT0 bridge via KMS...',
        error: null,
        transactionId: null,
      }))

      const token = session?.access_token
      if (!token) throw new Error('Not authenticated')

      const res = await fetch('/api/kms/sign-bridge-usdt0-reverse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amount }),
      })

      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error || 'USDT0 bridge reverse failed')
      }

      setState(prev => ({ ...prev, transactionId: data.txHash }))

      // Track via LayerZero
      await trackArbToHedera(data.txHash)
    } catch (err: any) {
      console.error('[USDT0 Bridge] Arb→Hedera error:', err)
      setError(err.message || 'USDT0 bridge failed')
    }
  }, [connectionMode, session, setStatus, setError, trackArbToHedera])
```

**Step 4: Add to return object**

Update the return (around line 482):

```typescript
  return {
    ...state,
    isExecuting: state.status !== 'idle' && state.status !== 'success' && state.status !== 'error',
    bridgeToArbitrum,
    bridgeToHedera,
    bridgeUsdt0ToArbitrum,
    bridgeUsdt0ToHedera,
    reset,
  }
```

**Step 5: Commit**

```bash
git add hooks/useBridge.ts
git commit -m "feat: add USDT0 bridge functions to useBridge hook"
```

---

## Task 10: Update BridgeCard to Support USDT0 Token Selection

**Files:**
- Modify: `components/BridgeCard.tsx`

This is the largest frontend change. The BridgeCard currently hardcodes USDC. We need to add a token selector that lets the user choose between USDC and USDT0.

**Step 1: Add token state and USDT0 constants**

Add after the imports (around line 20):

```typescript
import { USDT0_HEDERA } from '@/lib/bridge/usdt0Constants'

type BridgeToken = 'USDC' | 'USDT0'

const USDT0_ICON_URL = '/usdt0-icon.png' // Will need to add this asset
// Fallback if icon not available yet:
const USDT_ICON_FALLBACK = 'https://assets.coingecko.com/coins/images/325/small/Tether.png'
```

**Step 2: Add selectedToken state**

Add to the component state (around line 70):

```typescript
const [selectedToken, setSelectedToken] = useState<BridgeToken>('USDC')
```

**Step 3: Update balance display for USDT0**

Add USDT0 balance fetching alongside USDC. The `useTokenBalances` hook already fetches all HTS balances — USDT0 will be at `USDT0_HEDERA.TOKEN_ID`:

```typescript
const rawUsdt0Balance = hederaBalances[USDT0_HEDERA.TOKEN_ID]
const formattedUsdt0Balance = rawUsdt0Balance
  ? formatAmount(rawUsdt0Balance, 6)
  : null
```

**Step 4: Update quote fetching**

In the quote useEffect (around line 223), add USDT0 quote path:

```typescript
// Inside the debounced quote effect:
if (selectedToken === 'USDT0') {
  const res = await fetch('/api/bridge/quote-usdt0', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount,
      receiver,
      direction,
      requestGasDrop: useGasDrop,
    }),
  })
  const data = await res.json()
  if (data.success) {
    setLzFeeEstimate(data.nativeFeeFormatted)
  }
} else {
  // existing USDC quote logic
}
```

**Step 5: Update handleBridge to route by token**

In `handleBridge` (around line 281):

```typescript
const handleBridge = async () => {
  if (!amount || parseFloat(amount) <= 0) return

  if (selectedToken === 'USDT0') {
    if (direction === 'hedera_to_arbitrum') {
      const receiver = (isCustodial && walletMode === 'native' && custodialEvmAddress) || receiverAddress
      if (!receiver || !/^0x[a-fA-F0-9]{40}$/.test(receiver)) return
      await bridge.bridgeUsdt0ToArbitrum(amount, receiver, useGasDrop)
    } else {
      if (!account) return
      await bridge.bridgeUsdt0ToHedera(amount, account)
    }
  } else {
    // existing USDC bridge logic
    if (direction === 'hedera_to_arbitrum') {
      const receiver = (isCustodial && walletMode === 'native' && custodialEvmAddress) || receiverAddress
      if (!receiver || !/^0x[a-fA-F0-9]{40}$/.test(receiver)) return
      await bridge.bridgeToArbitrum(amount, receiver, useGasDrop)
    } else {
      if (!account) return
      const forceExternal = isCustodial && walletMode === 'external'
      await bridge.bridgeToHedera(amount, account, forceExternal ? { forceExternal: true } : undefined)
    }
  }
}
```

**Step 6: Add token selector UI**

Replace the hardcoded USDC TokenSelector (around line 338) with a token-aware version. Add a simple toggle or dropdown above or within the token selectors:

```tsx
{/* Token Selection Tabs */}
<div className="flex gap-2 mb-4">
  {(['USDC', 'USDT0'] as BridgeToken[]).map((token) => (
    <button
      key={token}
      onClick={() => {
        setSelectedToken(token)
        setAmount('')
        setLzFeeEstimate(null)
      }}
      disabled={bridge.isExecuting}
      className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
        selectedToken === token
          ? 'bg-white text-black'
          : 'bg-neutral-800 text-neutral-400 hover:text-white'
      }`}
    >
      {token}
    </button>
  ))}
</div>
```

Update the TokenSelector icon/symbol to use `selectedToken`:

```tsx
const tokenIcon = selectedToken === 'USDT0' ? USDT_ICON_FALLBACK : USDC_ICON_URL
```

**Step 7: Update fee display**

For USDT0, there's NO bridge fee (0.3%), only LayerZero fee. Update the fee section conditionally:

```tsx
{selectedToken === 'USDC' && (
  <div className="flex justify-between">
    <span>Bridge Fee (0.3%)</span>
    <span>{feeAmount.toFixed(2)} USDC</span>
  </div>
)}
{/* LZ Fee is shown for both */}
```

**Step 8: Update balance checks**

For USDT0, use `formattedUsdt0Balance` instead of `formattedUsdcBalance`:

```typescript
const activeBalance = selectedToken === 'USDT0' ? formattedUsdt0Balance : formattedUsdcBalance
const hasInsufficientHederaBalance = direction === 'hedera_to_arbitrum'
  && activeBalance !== null
  && amountFloat > 0
  && amountFloat > parseFloat(activeBalance)
```

**Step 9: Commit**

```bash
git add components/BridgeCard.tsx
git commit -m "feat: add USDT0 token selection to BridgeCard"
```

---

## Task 11: Add USDT0 Balance to Arbitrum Balance Endpoint

**Files:**
- Modify: `app/api/bridge/arbitrum-balance/route.ts`

**Step 1: Add USDT0 balance fetching**

Add USDT0 balance alongside USDC. The endpoint already fetches USDC via ERC20 balanceOf — add the same for USDT0:

After the USDC balance fetch, add:

```typescript
import { USDT0_ARBITRUM } from '@/lib/bridge/usdt0Constants'

// In the handler, add USDT0 to the parallel fetch:
const usdt0Contract = new ethers.Contract(USDT0_ARBITRUM.TOKEN_ADDRESS, ERC20_ABI, provider)
const usdt0Balance = await usdt0Contract.balanceOf(address)

// Add to response:
return NextResponse.json({
  success: true,
  usdcBalance: usdcBalance.toString(),
  usdt0Balance: usdt0Balance.toString(),
  ethBalance: ethBalance.toString(),
})
```

**Step 2: Commit**

```bash
git add app/api/bridge/arbitrum-balance/route.ts
git commit -m "feat: add USDT0 balance to Arbitrum balance endpoint"
```

---

## Task 12: Add USDT0 to Transfer Page

**Files:**
- Modify: `app/transfer/page.tsx` (or the transfer component)

**Step 1: Add USDT0 to the token list**

Find where tokens are defined for the transfer page. Add USDT0:

For Hedera transfers:
- Token ID: `0.0.10282787`
- Decimals: 6
- Symbol: USDT0

For Arbitrum transfers:
- Address: `0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9`
- Decimals: 6
- Symbol: USDT0

The transfer logic uses `signTransfer` (Hedera HTS transfer) and `sign-transfer-evm` (Arbitrum ERC20 transfer) — both already support arbitrary tokens. Just add USDT0 to the selectable list.

**Step 2: Commit**

```bash
git add app/transfer/
git commit -m "feat: add USDT0 to transfer page token list"
```

---

## Task 13: Add USDT0 to Portfolio Page

**Files:**
- Modify: `app/portfolio/page.tsx` (or the portfolio component)

**Step 1: Add USDT0 balance display**

The portfolio page shows token balances from both chains. Add USDT0:

- On Hedera tab: Show USDT0 balance (from `useTokenBalances` — already fetches all HTS tokens)
- On Arbitrum tab: Show USDT0 balance (from arbitrum-balance endpoint, now includes `usdt0Balance`)
- Price: $1.00 (stablecoin)

**Step 2: Commit**

```bash
git add app/portfolio/
git commit -m "feat: add USDT0 to portfolio page"
```

---

## Task 14: Verify OFT Contract Entity IDs on Hedera

**Files:**
- Modify: `lib/kms/transaction-signer.ts` (update TODO comments)
- Modify: `lib/bridge/usdt0Constants.ts` (if needed)

**Step 1: Look up OFT contract's Hedera entity ID**

The OFT contract EVM address on Hedera is `0xe3119e23fC2371d1E6b01775ba312035425A53d6`. This is a long-form EVM address (not a Hedera native entity padded to 20 bytes). We need to find its Hedera contract ID (e.g., `0.0.XXXXX`).

Query the Mirror Node:

```bash
curl "https://mainnet-public.mirrornode.hedera.com/api/v1/contracts/0xe3119e23fC2371d1E6b01775ba312035425A53d6"
```

This will return the `contract_id` field (e.g., `0.0.XXXXXXX`). Update the hardcoded `oftContractId` in `transaction-signer.ts`.

Similarly, verify the USDT0 token ID:

```bash
curl "https://mainnet-public.mirrornode.hedera.com/api/v1/tokens?token.id=0.0.10282787"
```

**Step 2: Update constants with verified values**

**Step 3: Commit**

```bash
git add lib/kms/transaction-signer.ts lib/bridge/usdt0Constants.ts
git commit -m "fix: verify and update OFT contract entity IDs on Hedera"
```

---

## Task 15: End-to-End Testing

**Step 1: Start dev server**

```bash
pnpm dev
```

**Step 2: Test quote endpoint**

```bash
# Hedera → Arbitrum quote
curl -X POST http://localhost:3000/api/bridge/quote-usdt0 \
  -H "Content-Type: application/json" \
  -d '{"amount":"10","receiver":"0x0000000000000000000000000000000000000001","direction":"hedera_to_arbitrum"}'

# Arbitrum → Hedera quote
curl -X POST http://localhost:3000/api/bridge/quote-usdt0 \
  -H "Content-Type: application/json" \
  -d '{"amount":"10","receiver":"0x0000000000000000000000000000000000000001","direction":"arbitrum_to_hedera"}'
```

**Step 3: Test UI**

1. Navigate to /bridge
2. Select USDT0 token tab
3. Enter amount → verify quote appears
4. Toggle gas drop → verify quote updates
5. Toggle direction → verify UI updates
6. Verify balance displays correctly

**Step 4: Test small bridge (mainnet)**

1. Fund test account with small amount of USDT0 on Hedera
2. Bridge 1 USDT0 Hedera → Arbitrum
3. Verify delivery on Arbitrum
4. Bridge 1 USDT0 Arbitrum → Hedera
5. Verify delivery on Hedera

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: end-to-end testing fixes for USDT0 bridge"
```

---

## Important Notes for Implementer

### OFT Contract ID on Hedera
The OFT contract at `0xe3119e23fC2371d1E6b01775ba312035425A53d6` is a long-form EVM address. For `ContractExecuteTransaction`, you may need to use the Hedera entity ID format (`0.0.XXXXX`). Query the Mirror Node API to resolve this. If the contract was deployed via `CREATE2` or similar, it may only be accessible via EVM address — in which case use `ContractId.fromEvmAddress(0, 0, "0xe3119e23fC2371d1E6b01775ba312035425A53d6")`.

### Tinybar vs Weibar
On Hedera EVM, `quoteSend()` returns fees in weibar (18 decimals) but Hedera native uses tinybar (8 decimals). When passing `msg.value` via `ContractExecuteTransaction.setPayableAmount()`, the SDK expects HBAR. Convert: `weibar / 1e10 = tinybar`, `tinybar / 1e8 = HBAR`.

### Token Association
USDT0 is an HTS token on Hedera. Users must associate before receiving. The reverse bridge endpoint handles this automatically.

### LayerZero extraOptions for Gas Drop
The gas drop encoding follows LayerZero V2 Type 3 options format. If the encoding in `buildGasDropOptions()` doesn't work correctly, reference the LayerZero V2 docs or use the `@layerzerolabs/lz-v2-utilities` npm package for encoding.
