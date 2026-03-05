# EVM KMS Bridge Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable custodial users to bridge Arbitrum → Hedera using their existing KMS ECDSA key (same account, no new wallet).

**Architecture:** The same AWS KMS `ECC_SECG_P256K1` key that signs Hedera transactions also signs EVM transactions on Arbitrum. A new API endpoint `/api/kms/sign-bridge-reverse` handles the full Arb→Hedera bridge flow server-side: ERC20 approval + bridge call, signed via `@hashflow/aws-kms-ethers-signer`. The UI detects custodial mode and routes Arb→Hedera bridge calls to this endpoint instead of MetaMask.

**Tech Stack:** ethers.js v5, `@hashflow/aws-kms-ethers-signer`, AWS KMS (`ECC_SECG_P256K1`), Next.js API routes, Supabase

**Design Doc:** `docs/plans/2026-03-05-evm-kms-bridge-design.md`

---

### Task 1: Install `@hashflow/aws-kms-ethers-signer`

**Files:**
- Modify: `package.json`

**Step 1: Install dependency**

Run: `npm install @hashflow/aws-kms-ethers-signer --legacy-peer-deps`

Expected: Package installs successfully (compatible with ethers v5)

**Step 2: Verify import works**

Run: `node -e "const { KMSSigner } = require('@hashflow/aws-kms-ethers-signer'); console.log('OK:', typeof KMSSigner)"`

Expected: `OK: function`

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @hashflow/aws-kms-ethers-signer for EVM KMS signing"
```

---

### Task 2: Create `lib/kms/evm-utils.ts` — EVM address derivation

**Files:**
- Create: `lib/kms/evm-utils.ts`

This utility derives the EVM address from the uncompressed public key already stored in `custodial_accounts.public_key_hex`. No new key — same cryptographic identity.

**Step 1: Create the file**

```typescript
/**
 * EVM Utilities for KMS-managed ECDSA Keys
 *
 * Derives EVM addresses from the same secp256k1 public key used for Hedera.
 * The EVM address is keccak256(uncompressed_pubkey_without_prefix) → last 20 bytes.
 * This is the same address on Ethereum, Arbitrum, and any EVM chain.
 */

import { ethers } from 'ethers'

/**
 * Derive EVM address from an uncompressed secp256k1 public key.
 *
 * @param publicKeyHex - 65-byte uncompressed public key as hex (0x04 || x || y),
 *                       stored in custodial_accounts.public_key_hex
 * @returns Checksummed EVM address (0x-prefixed, 42 chars)
 */
export function deriveEvmAddress(publicKeyHex: string): string {
  const pubKeyBytes = Buffer.from(publicKeyHex, 'hex')

  if (pubKeyBytes.length !== 65 || pubKeyBytes[0] !== 0x04) {
    throw new Error(
      `Expected 65-byte uncompressed public key (0x04 prefix), got ${pubKeyBytes.length} bytes`
    )
  }

  // Strip the 0x04 prefix, hash the 64-byte (x || y), take last 20 bytes
  const addressHash = ethers.utils.keccak256(pubKeyBytes.slice(1))
  return ethers.utils.getAddress('0x' + addressHash.slice(-40))
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit lib/kms/evm-utils.ts 2>&1 | head -5` (or build check)

Expected: No errors

**Step 3: Commit**

```bash
git add lib/kms/evm-utils.ts
git commit -m "feat: add EVM address derivation from KMS public key"
```

---

### Task 3: Create `lib/kms/evm-signer.ts` — KMS-backed ethers Signer factory

**Files:**
- Create: `lib/kms/evm-signer.ts`

Wraps `@hashflow/aws-kms-ethers-signer` to create an ethers v5 Signer connected to Arbitrum.

**Step 1: Create the file**

```typescript
/**
 * EVM Signer using AWS KMS
 *
 * Creates an ethers.js v5 Signer backed by the same KMS key used for Hedera signing.
 * The KMSSigner handles DER decoding, low-S normalization, and recovery ID (v) calculation.
 */

import { KMSSigner } from '@hashflow/aws-kms-ethers-signer'
import { getArbitrumProvider } from '@/lib/bridge/arbitrumRpc'

const AWS_REGION = process.env.AWS_KMS_REGION || 'us-east-1'

/**
 * Create an ethers Signer backed by a KMS key, connected to Arbitrum.
 *
 * @param kmsKeyId - AWS KMS key ID (from custodial_accounts.kms_key_id)
 * @returns KMSSigner instance connected to Arbitrum provider
 */
export async function createArbitrumKMSSigner(kmsKeyId: string): Promise<KMSSigner> {
  const provider = await getArbitrumProvider()
  return new KMSSigner(AWS_REGION, kmsKeyId, provider)
}
```

**Step 2: Commit**

```bash
git add lib/kms/evm-signer.ts
git commit -m "feat: add KMS-backed ethers Signer factory for Arbitrum"
```

---

### Task 4: Add `evm_address` column to Supabase

**Files:**
- Supabase migration (via MCP tool)

**Step 1: Apply migration**

Use `mcp__supabase__apply_migration` with:
- name: `add_evm_address_to_custodial_accounts`
- query:
```sql
ALTER TABLE custodial_accounts ADD COLUMN evm_address text;

COMMENT ON COLUMN custodial_accounts.evm_address IS 'Derived EVM address from ECDSA public key — keccak256(pubkey) last 20 bytes. Same identity on all EVM chains.';
```

**Step 2: Regenerate TypeScript types**

Use `mcp__supabase__generate_typescript_types` and update `types/supabase.types.ts`.

**Step 3: Commit**

```bash
git add types/supabase.types.ts
git commit -m "feat: add evm_address column to custodial_accounts"
```

---

### Task 5: Add `bridge_reverse` to KMS transaction types

**Files:**
- Modify: `types/kms.ts`

**Step 1: Update KMSTransactionType**

In `types/kms.ts`, add `'bridge_reverse'` to the `KMSTransactionType` union:

```typescript
// Before:
export type KMSTransactionType =
  | 'swap'
  | 'token_association'
  | 'token_approval'
  | 'account_create'
  | 'transfer'
  | 'bridge'

// After:
export type KMSTransactionType =
  | 'swap'
  | 'token_association'
  | 'token_approval'
  | 'account_create'
  | 'transfer'
  | 'bridge'
  | 'bridge_reverse'
```

**Step 2: Add request type for the new endpoint**

Add to `types/kms.ts`:

```typescript
export interface SignBridgeReverseRequest {
  amount: string          // USDC amount (human readable, e.g., "10.5")
  requestGasDrop?: boolean
}
```

**Step 3: Commit**

```bash
git add types/kms.ts
git commit -m "feat: add bridge_reverse transaction type and request interface"
```

---

### Task 6: Create `POST /api/kms/sign-bridge-reverse` endpoint

**Files:**
- Create: `app/api/kms/sign-bridge-reverse/route.ts`

This is the core endpoint. It follows the exact same pattern as `app/api/kms/sign-bridge/route.ts` (auth → validate → execute → audit), but signs EVM transactions on Arbitrum instead of Hedera transactions.

**Step 1: Create the file**

```typescript
/**
 * Sign Bridge Reverse (Arbitrum → Hedera) via KMS
 *
 * Custodial endpoint that signs EVM transactions on Arbitrum using the same
 * KMS key used for Hedera. The user's ECDSA key produces the same identity
 * on both chains (HIP-583).
 *
 * Flow:
 * 1. Auth + rate limit (existing infrastructure)
 * 2. Derive EVM address from stored public key
 * 3. Get LayerZero quote from Arbitrum bridge contract
 * 4. Check USDC allowance → approve if needed (signed via KMS)
 * 5. Execute bridgeTokens() on Arbitrum (signed via KMS)
 * 6. Return Arbitrum txHash
 *
 * POST /api/kms/sign-bridge-reverse
 * Body: { amount: string, requestGasDrop?: boolean }
 */

import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { validateSigningRequest, recordSigningOperation } from '@/lib/kms/rate-limiter'
import { AuthError } from '@/lib/kms/rate-limiter'
import { createArbitrumKMSSigner } from '@/lib/kms/evm-signer'
import { deriveEvmAddress } from '@/lib/kms/evm-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'
import {
  ARBITRUM_CONFIG,
  BRIDGE_V3_CONFIG,
  LAYER_ZERO_CONFIG,
  accountIdToEvmAddress,
} from '@/lib/bridge/bridgeConstants'
import type { SignBridgeReverseRequest } from '@/types/kms'

const BRIDGE_V3_ABI = [
  'function quote(string calldata symbol, uint256 amount, address receiver, uint32 targetChainId) view returns (uint256 nativeFee)',
  'function bridgeTokens(string symbol, uint256 amount, address receiver, uint32 targetChainId) payable',
]

const ERC20_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
]

const HEDERA_EID = LAYER_ZERO_CONFIG.HEDERA_MAINNET_EID // 30316

export async function POST(request: NextRequest) {
  let ctx

  try {
    // 1. Auth + rate limit (same as all KMS endpoints)
    ctx = await validateSigningRequest(request)

    // 2. Parse request
    const body: SignBridgeReverseRequest = await request.json()

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

    const amountRaw = Math.floor(amountFloat * 1_000_000) // USDC 6 decimals

    // 3. Derive EVM address from stored public key
    const evmAddress = deriveEvmAddress(ctx.publicKeyHex)

    // Persist evm_address if not yet stored
    const db = supabaseAdmin()
    await db
      .from('custodial_accounts')
      .update({ evm_address: evmAddress })
      .eq('user_id', ctx.userId)
      .is('evm_address', null)

    // 4. Create KMS-backed Signer connected to Arbitrum
    const signer = await createArbitrumKMSSigner(ctx.kmsKeyId)

    // Verify derived address matches signer address
    const signerAddress = await signer.getAddress()
    if (signerAddress.toLowerCase() !== evmAddress.toLowerCase()) {
      throw new Error(
        `Address mismatch: derived ${evmAddress} vs signer ${signerAddress}`
      )
    }

    const provider = signer.provider!
    const bridgeAddress = BRIDGE_V3_CONFIG.ARBITRUM.ADDRESS

    // 5. Check USDC balance
    const usdcContract = new ethers.Contract(ARBITRUM_CONFIG.USDC_ADDRESS, ERC20_ABI, provider)
    const balance = await usdcContract.balanceOf(evmAddress)
    if (balance.lt(amountRaw)) {
      return NextResponse.json(
        { success: false, error: `Insufficient USDC on Arbitrum. Have: ${ethers.utils.formatUnits(balance, 6)}, need: ${body.amount}` },
        { status: 400 }
      )
    }

    // 6. Check ETH balance for gas
    const ethBalance = await provider.getBalance(evmAddress)
    if (ethBalance.isZero()) {
      return NextResponse.json(
        { success: false, error: 'No ETH on Arbitrum for gas fees. Send ETH to your EVM address first.' },
        { status: 400 }
      )
    }

    // 7. Get LayerZero quote
    const bridgeContract = new ethers.Contract(bridgeAddress, BRIDGE_V3_ABI, provider)
    const receiverEvmAddress = accountIdToEvmAddress(ctx.accountId)
    const nativeFee = await bridgeContract.quote('USDC', amountRaw, receiverEvmAddress, HEDERA_EID)
    const feeWithBuffer = nativeFee.mul(120).div(100) // 20% buffer

    // 8. Check USDC allowance → approve if needed
    const allowance = await usdcContract.allowance(evmAddress, bridgeAddress)
    if (allowance.lt(amountRaw)) {
      const approveAmount = ethers.BigNumber.from(amountRaw).mul(10) // 10x for future txs
      const usdcWithSigner = usdcContract.connect(signer)
      const approveTx = await usdcWithSigner.approve(bridgeAddress, approveAmount, {
        gasLimit: 100_000,
      })
      await approveTx.wait()
    }

    // 9. Execute bridge
    const bridgeWithSigner = bridgeContract.connect(signer)
    const bridgeTx = await bridgeWithSigner.bridgeTokens(
      'USDC',
      amountRaw,
      receiverEvmAddress,
      HEDERA_EID,
      {
        value: feeWithBuffer,
        gasLimit: 200_000,
      }
    )
    const receipt = await bridgeTx.wait()

    // 10. Record audit
    await recordSigningOperation(ctx, 'bridge_reverse', {
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
    console.error('[sign-bridge-reverse] Error:', error)

    if (ctx) {
      await recordSigningOperation(ctx, 'bridge_reverse', {}, { error: error.message }).catch(() => {})
    }

    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      )
    }

    return NextResponse.json(
      { success: false, error: error.message || 'Bridge reverse failed' },
      { status: 500 }
    )
  }
}
```

**Step 2: Verify it compiles**

Run: `npx next build 2>&1 | tail -20` (or `npx tsc --noEmit`)

Expected: No type errors

**Step 3: Commit**

```bash
git add app/api/kms/sign-bridge-reverse/route.ts
git commit -m "feat: add custodial bridge reverse endpoint (Arb→Hedera via KMS)"
```

---

### Task 7: Add `signBridgeReverse` to `useCustodialConnection` hook

**Files:**
- Modify: `hooks/useCustodialConnection.ts`

**Step 1: Add the method**

Add a new function after `signBridge` (around line 104):

```typescript
  /**
   * Sign and execute a reverse bridge (Arbitrum → Hedera) via KMS.
   * Uses the same ECDSA key to sign EVM transactions on Arbitrum.
   */
  const signBridgeReverse = async (
    amount: string,
    requestGasDrop?: boolean
  ) => {
    if (!token) throw new Error('Not authenticated')
    return custodialFetch('/api/kms/sign-bridge-reverse', token, {
      amount,
      requestGasDrop: requestGasDrop || false,
    })
  }
```

Add `signBridgeReverse` to the return object:

```typescript
  return {
    custodialAccountId,
    signSwap,
    signAssociate,
    signApprove,
    signTransfer,
    signBridge,
    signBridgeReverse,
  }
```

**Step 2: Commit**

```bash
git add hooks/useCustodialConnection.ts
git commit -m "feat: add signBridgeReverse to custodial connection hook"
```

---

### Task 8: Update `useBridge` hook to support custodial Arb→Hedera

**Files:**
- Modify: `hooks/useBridge.ts`

The key change: when `connectionMode === 'custodial'`, route `bridgeToHedera` through the new KMS endpoint instead of MetaMask.

**Step 1: Import custodial hook**

At the top of `useBridge.ts`, ensure `useConnectionContext` is imported (it should already be). Also import the custodial fetch helper. The hook already uses `useConnectionContext` for `account` and `connectionMode`.

**Step 2: Modify `bridgeToHedera` function**

At the beginning of `bridgeToHedera()` (around line 274), add a custodial branch:

```typescript
  const bridgeToHedera = useCallback(async (amountUsdc: string, hederaReceiverAccountId: string) => {
    // --- CUSTODIAL PATH: Sign via KMS ---
    if (connectionMode === 'custodial') {
      try {
        setStatus('bridging')
        setError(null)

        const token = session?.access_token
        if (!token) throw new Error('Not authenticated')

        const res = await fetch('/api/kms/sign-bridge-reverse', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            amount: amountUsdc,
          }),
        })

        const data = await res.json()
        if (!data.success) {
          throw new Error(data.error || 'Bridge reverse failed')
        }

        // Track via LayerZero (same tracking as MetaMask path)
        await trackArbToHedera(data.txHash)
        return
      } catch (err: any) {
        console.error('[Bridge] Custodial Arb→Hedera error:', err)
        setError(err.message || 'Bridge failed')
        setStatus('error')
        return
      }
    }

    // --- WALLET PATH: Original MetaMask flow ---
    // (existing code continues unchanged)
```

**Important:** The existing MetaMask flow remains untouched — only a custodial branch is added at the top.

**Step 3: Ensure `connectionMode` and `session` are available**

The hook needs access to `connectionMode` and `session` from `useConnectionContext`. Check that the hook already destructures these, or add them. The hook already imports from `ConnectionContext` — just ensure `connectionMode` and `session` are destructured.

**Step 4: Commit**

```bash
git add hooks/useBridge.ts
git commit -m "feat: route custodial Arb→Hedera bridge through KMS endpoint"
```

---

### Task 9: Update `BridgeCard.tsx` UI for custodial Arb→Hedera

**Files:**
- Modify: `components/BridgeCard.tsx`

**Step 1: Show EVM address for custodial users**

When direction is `arbitrum_to_hedera` and `connectionMode === 'custodial'`:
- Instead of "Connect EVM wallet" button, show the user's derived EVM address
- Fetch balances using the derived EVM address via `/api/bridge/arbitrum-balance`
- The "Bridge" button calls `bridge.bridgeToHedera()` (which now routes to KMS)

**Step 2: Add EVM address derivation on client side**

Add a utility call in the component (or a new hook) to get the EVM address. Two options:
- Derive client-side from public key (available in context)
- Fetch from `/api/kms/account-info` (which would need to include `evm_address`)

**Recommended: Add `evm_address` to the account-info response.** Modify `app/api/kms/account-info/route.ts` to include the `evm_address` field from the DB. Then surface it through `ConnectionContext`.

**Step 3: Modify BridgeCard logic**

In the Arb→Hedera section of `BridgeCard.tsx`:

```typescript
// Where it currently checks needsMetaMask / evmAccount:
const isCustodial = connectionMode === 'custodial'
const custodialEvmAddress = /* from context or account-info */

// If custodial + arb_to_hedera:
//   - Show custodialEvmAddress as the "source wallet"
//   - Fetch balances using custodialEvmAddress
//   - Don't show MetaMask connect button
//   - Bridge button calls bridgeToHedera (which routes to KMS)

// If wallet + arb_to_hedera:
//   - Existing MetaMask flow (unchanged)
```

**Step 4: Commit**

```bash
git add components/BridgeCard.tsx app/api/kms/account-info/route.ts contexts/ConnectionContext.tsx
git commit -m "feat: update bridge UI to support custodial Arb→Hedera flow"
```

---

### Task 10: Populate `evm_address` on account creation

**Files:**
- Modify: `app/api/kms/create-account/route.ts`

**Step 1: Derive and store EVM address during account creation**

After the Hedera account is created and stored, compute the EVM address:

```typescript
import { deriveEvmAddress } from '@/lib/kms/evm-utils'

// After storing the custodial account in Supabase:
const evmAddress = deriveEvmAddress(publicKeyHex)
await db
  .from('custodial_accounts')
  .update({ evm_address: evmAddress })
  .eq('user_id', user.id)
```

This ensures new accounts get their EVM address populated immediately. Existing accounts get it populated lazily on first bridge-reverse call (Task 6 already handles this).

**Step 2: Commit**

```bash
git add app/api/kms/create-account/route.ts
git commit -m "feat: compute and store EVM address on custodial account creation"
```

---

### Task 11: Add `evm_address` to account-info response and context

**Files:**
- Modify: `app/api/kms/account-info/route.ts`
- Modify: `contexts/ConnectionContext.tsx`

**Step 1: Include `evm_address` in account-info response**

In `app/api/kms/account-info/route.ts`, ensure the response includes the `evm_address` field from the DB (it's already in the `custodial_accounts` table after Task 4). If `evm_address` is null (for pre-existing accounts), derive it on the fly and store it:

```typescript
import { deriveEvmAddress } from '@/lib/kms/evm-utils'

// In the GET handler, after fetching account:
let evmAddress = account.evm_address
if (!evmAddress && account.public_key_hex) {
  evmAddress = deriveEvmAddress(account.public_key_hex)
  await db
    .from('custodial_accounts')
    .update({ evm_address: evmAddress })
    .eq('id', account.id)
}

// Include in response:
return NextResponse.json({
  success: true,
  account: {
    hederaAccountId: account.hedera_account_id,
    publicKeyHex: account.public_key_hex,
    evmAddress,
    status: account.status,
    createdAt: account.created_at,
  },
})
```

**Step 2: Surface `evmAddress` in ConnectionContext**

Add `custodialEvmAddress: string | null` to the context interface and populate it from the account-info response during session initialization.

**Step 3: Commit**

```bash
git add app/api/kms/account-info/route.ts contexts/ConnectionContext.tsx
git commit -m "feat: surface EVM address in account info and connection context"
```

---

### Task 12: Build verification and manual test

**Step 1: Build check**

Run: `npm run build`

Expected: Builds successfully with no type errors.

**Step 2: Manual test checklist**

- [ ] Custodial user can see their derived EVM address in the bridge card
- [ ] Switching to Arb→Hedera direction shows EVM balances (USDC + ETH)
- [ ] If no ETH on Arbitrum: clear error message about needing ETH for gas
- [ ] If no USDC on Arbitrum: clear error message about insufficient balance
- [ ] Bridge executes: approval tx + bridge tx both signed via KMS
- [ ] LayerZero tracking works (same polling as MetaMask flow)
- [ ] Audit log records `bridge_reverse` transaction type
- [ ] Rate limits are enforced (same limits as other KMS operations)
- [ ] Wallet users still use MetaMask for Arb→Hedera (no regression)

**Step 3: Commit all remaining changes**

```bash
git add -A
git commit -m "feat: complete custodial bridge reverse (Arb→Hedera via KMS)"
```

---

## Dependency Graph

```
Task 1 (install dep)
  └→ Task 3 (evm-signer.ts depends on the package)
       └→ Task 6 (API endpoint depends on evm-signer)

Task 2 (evm-utils.ts)
  └→ Task 6 (API endpoint depends on deriveEvmAddress)
  └→ Task 10 (account creation depends on deriveEvmAddress)
  └→ Task 11 (account-info depends on deriveEvmAddress)

Task 4 (Supabase migration)
  └→ Task 6 (endpoint writes evm_address)
  └→ Task 10 (account creation writes evm_address)
  └→ Task 11 (account-info reads evm_address)

Task 5 (types)
  └→ Task 6 (endpoint uses bridge_reverse type)

Task 6 (API endpoint)
  └→ Task 8 (useBridge calls the endpoint)

Task 7 (custodial hook)
  └→ Task 9 (BridgeCard may use signBridgeReverse)

Task 8 (useBridge)
  └→ Task 9 (BridgeCard uses useBridge)

Task 11 (account-info + context)
  └→ Task 9 (BridgeCard reads evmAddress from context)

Task 12 depends on all previous tasks.
```

**Parallel-safe execution order:**
1. Tasks 1, 2, 4, 5 (all independent)
2. Tasks 3, 6, 7, 10, 11 (depend on above)
3. Tasks 8, 9 (depend on above)
4. Task 12 (final verification)
