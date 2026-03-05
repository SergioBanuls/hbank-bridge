# EVM KMS Bridge Design — Same Account, Dual Chain Signing

**Date:** 2026-03-05
**Status:** Approved
**Scope:** Custodial bridge Arbitrum → Hedera using existing KMS key

## Problem

Custodial users can bridge Hedera → Arbitrum via KMS, but bridge Arbitrum → Hedera requires MetaMask. Since custodial accounts use ECDSA secp256k1 keys (same curve as Ethereum), the same KMS key can sign EVM transactions — enabling fully custodial bidirectional bridge.

## Key Insight

Hedera ECDSA accounts have an intrinsic EVM address alias (HIP-583). The EVM address is derived identically to Ethereum: `keccak256(uncompressed_pubkey[1:])` → last 20 bytes. This is not a new account — it's the same cryptographic identity expressed on EVM chains.

```
1 KMS key (ECC_SECG_P256K1)
  ├── Signs Hedera transactions → account 0.0.XXXXX
  └── Signs Arbitrum transactions → address 0x... (same public key)
```

## Architecture

### Flow: Custodial Bridge Arb → Hedera

```
[Custodial User] → [POST /api/kms/sign-bridge-reverse]
                          │
                    1. Auth + rate limit (existing)
                    2. Get custodial account (kms_key_id + public_key_hex)
                    3. Derive EVM address from public_key_hex
                    4. Create KMSSigner (ethers v5 Signer + Arbitrum provider)
                    5. Check USDC balance on Arbitrum
                    6. Check/execute ERC20 approve (if needed)
                    7. Encode bridgeTokens() calldata
                    8. Send signed tx via KMSSigner
                    9. Return txHash + status
```

### New Components

#### 1. `lib/kms/evm-utils.ts` — EVM Address Derivation
- `deriveEvmAddress(publicKeyHex: string): string`
- Input: 65-byte uncompressed public key (0x04||x||y) from `custodial_accounts.public_key_hex`
- Output: EVM address (0x + last 20 bytes of keccak256(x||y))

#### 2. `lib/kms/evm-signer.ts` — KMS-backed ethers Signer
- Wraps `@hashflow/aws-kms-ethers-signer` (or similar ethers v5 lib)
- Creates ethers Signer from existing KMS key ID + Arbitrum provider
- Handles: DER decode, low-S normalization, recovery ID (v) calculation

#### 3. `POST /api/kms/sign-bridge-reverse` — New API Endpoint
- Auth: Supabase JWT (existing pattern)
- Input: `{ amount: string, requestGasDrop?: boolean }`
- Receiver: auto-derived from user's `hedera_account_id` (converted to EVM address via `accountIdToEvmAddress`)
- Steps:
  1. Get LZ quote (reuse existing quote logic)
  2. Check USDC allowance → approve if needed
  3. Encode + send `bridgeTokens()`
  4. Record audit log with `transaction_type: 'bridge_reverse'`
- Output: `{ txHash: string, explorerUrl: string }`

#### 4. Supabase Migration
- `ALTER TABLE custodial_accounts ADD COLUMN evm_address text;`
- Cached derivation — computed once on first use or account creation

#### 5. UI Changes
- When direction = Arb→Hedera and connection = custodial: use new endpoint instead of MetaMask
- Show derived EVM address in bridge card / profile
- Display Arbitrum USDC/ETH balances for custodial users

### What Doesn't Change
- Bridge Hedera → Arbitrum (already works with KMS)
- Bridge Arb → Hedera for wallet users (still MetaMask)
- Rate limits, auth, audit trail (reused as-is)
- Bridge contract, ABI, LayerZero config (same contracts)

### Important: accountIdToEvmAddress vs Real EVM Address

Current `accountIdToEvmAddress("0.0.XXXXX")` produces a zero-padded address from the account number. That is NOT the ECDSA-derived EVM address. On Hedera, both work as aliases. On Arbitrum, only the keccak256-derived address is valid (it's the one the KMS key can sign for).

The bridge contract receiver parameter on Hedera side accepts the zero-padded form. The sender address on Arbitrum must be the keccak256-derived form.

### New Dependency
- `@hashflow/aws-kms-ethers-signer` — ethers v5 Signer that delegates signing to AWS KMS

### Gas & Fees
- Arbitrum gas: ~200k for bridge tx, ~100k for approve
- LZ fee: sent as `msg.value` in the bridge tx (ETH on Arbitrum)
- The custodial EVM address needs ETH for gas — user must fund it or we provide gas sponsorship (future scope)

### Open Question: ETH for Gas
Custodial users need ETH on Arbitrum to pay gas. Options:
- User sends ETH to their EVM address manually
- Gas sponsorship / paymaster (future scope)
- Use gas drop from Hedera→Arb bridge to fund the account first
