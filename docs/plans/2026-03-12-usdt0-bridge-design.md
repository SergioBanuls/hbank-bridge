# USDT0 Bridge Integration Design

**Date**: 2026-03-12
**Status**: Approved

## Overview

Add USDT0 bridging between Hedera and Arbitrum to the existing HBank Bridge. USDT0 is Tether's omnichain USDT deployment using LayerZero's OFT (Omnichain Fungible Token) standard. Unlike our USDC bridge (which uses a custom Bridge V3 OApp contract), USDT0 integration interacts directly with USDT0's own OFT contracts — no custom bridge contracts, no liquidity provision, no protocol fee.

## Key Decision Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Fee model | LayerZero fee only (~$0.10-2) | No own fee. Simpler, cheaper for users |
| Token naming | USDT0 | Technically precise, differentiates from USDC |
| Gas drop | Supported | Consistent with USDC bridge UX |
| Scope | Bridge + Transfer | Full token support on both pages |
| Approach | Direct OFT integration | No wrapper contract needed, fastest to implement |

## Contract Addresses

| | Hedera | Arbitrum |
|---|---|---|
| **USDT0 Token** | `0x00000000000000000000000000000000009Ce723` (HTS ID: ~`0.0.10282787`) | `0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9` |
| **OFT Contract** | `0xe3119e23fC2371d1E6b01775ba312035425A53d6` | `0x14E4A1B13bf7F943c8ff7C51fb60FA964A298D92` |
| **LZ Endpoint** | `0x3A73033C0b1407574C76BdBAc67f126f6b4a9AA9` (EID: 30316) | `0x1a44076050125825900e736c501f859c50fE728c` (EID: 30110) |

Note: On Arbitrum, the native USDT was upgraded in-place to USDT0. Same contract address `0xFd086bC7...` that was previously native USDT.

## How USDT0 OFT Works

1. **Lock-and-mint**: USDT is locked on Ethereum, USDT0 is minted on destination chains
2. **Burn-and-mint between non-Ethereum chains**: USDT0 is burned on source, minted on destination via LayerZero messaging
3. **OFT interface**: Standard functions `quoteSend()`, `send()`, `quoteOFT()` for cross-chain transfers
4. **Dual DVN security**: LayerZero DVN + USDT0 DVN must both verify each transfer
5. **No liquidity pools needed**: The OFT standard manages supply across chains natively

## Architecture

### Hedera → Arbitrum Flow

```
User requests bridge 100 USDT0
    │
    ▼
Frontend → GET /api/bridge/quote-usdt0
    │   Calls OFT.quoteSend(SendParam, false) on Hedera
    │   Returns: nativeFee in tinybars → formatted as HBAR
    ▼
Frontend shows fee to user
    │
    ▼
Frontend → POST /api/kms/sign-bridge-usdt0
    │
    ▼  Server-side:
    │   1. JWT auth + rate limit check
    │   2. Get user's KMS key from DB
    │   3. Build & sign HTS approve(USDT0_TOKEN, OFT_CONTRACT, amount)
    │   4. Execute approve on Hedera
    │   5. Build & sign ContractExecute: OFT.send(SendParam, fee, refund)
    │      payableAmount = nativeFee + 20% buffer (in tinybars)
    │   6. Execute send on Hedera
    │   7. Audit log (type: bridge_usdt0)
    │   8. Return transactionId
    ▼
Frontend → poll /api/bridge/track (adaptive intervals)
    │   Hedera confirmed → LZ inflight → Arb delivered
    ▼
Bridge complete
```

### Arbitrum → Hedera Flow

```
User requests bridge 100 USDT0 from Arb to Hedera
    │
    ▼
Frontend → GET /api/bridge/quote-usdt0
    │   Calls OFT.quoteSend(SendParam, false) on Arbitrum
    │   Returns: nativeFee in wei → formatted as ETH
    ▼
Frontend shows fee to user
    │
    ▼
Frontend → POST /api/kms/sign-bridge-usdt0-reverse
    │
    ▼  Server-side:
    │   1. JWT auth + rate limit check
    │   2. Create KMSSigner (ethers.js v5) for Arbitrum
    │   3. Check if USDT0 token is associated on Hedera (auto-associate if not)
    │   4. USDT0.approve(OFT_CONTRACT, amount) via KMSSigner
    │   5. OFT.send(SendParam, fee, refund) via KMSSigner
    │      msg.value = nativeFee + 20% buffer (in ETH)
    │   6. Audit log (type: bridge_usdt0_reverse)
    │   7. Return txHash
    ▼
Frontend → poll /api/bridge/track
    │   Arb confirmed → LZ inflight → Hedera delivered
    ▼
Bridge complete
```

### OFT SendParam Structure

```typescript
interface SendParam {
  dstEid: number;          // 30110 (Arbitrum) or 30316 (Hedera)
  to: bytes32;             // receiver address padded to 32 bytes
  amountLD: bigint;        // amount in 6 decimals (USDT0 = 6 decimals)
  minAmountLD: bigint;     // amount * 0.995 (0.5% slippage safety)
  extraOptions: bytes;     // "0x" or encoded gas drop options
  composeMsg: bytes;       // "0x" (unused)
  oftCmd: bytes;           // "0x" (unused)
}
```

## Component Changes

### New API Endpoints

1. **`/api/bridge/quote-usdt0`** (GET)
   - Params: `amount`, `direction`, `requestGasDrop`
   - Calls OFT.quoteSend() on the source chain
   - Returns: `{ nativeFee, nativeFeeFormatted, estimatedTime }`

2. **`/api/kms/sign-bridge-usdt0`** (POST) — Hedera → Arbitrum
   - HTS approve + OFT.send() via KMS signing on Hedera
   - Follows same pattern as existing sign-bridge

3. **`/api/kms/sign-bridge-usdt0-reverse`** (POST) — Arbitrum → Hedera
   - ERC20 approve + OFT.send() via KMSSigner on Arbitrum
   - Auto-associates USDT0 token on Hedera if needed

### Modified Endpoints

4. **`/api/bridge/track`** — Extend for USDT0
   - Detect bridge type (USDC vs USDT0)
   - Same LayerZero tracking mechanism works for both

5. **`/api/balances`** — Add USDT0
   - Hedera: Mirror Node query for USDT0 token ID
   - Arbitrum: ERC20 balanceOf for USDT0 address

### New Library Modules

6. **`lib/bridge/usdt0Constants.ts`**
   - Token and OFT addresses for both chains
   - IOFT ABI (send, quoteSend, quoteOFT)
   - LayerZero EIDs
   - Helper for building SendParam and extraOptions

7. **`lib/bridge/usdt0TransactionBuilder.ts`**
   - `buildQuoteSend()` — construct quote query
   - `buildSendParam()` — construct SendParam struct
   - `buildExtraOptions()` — encode gas drop options via LZ OptionsBuilder

### Frontend Changes

8. **`BridgeCard.tsx`**
   - Add USDT0 as selectable token
   - Adapt quote logic (different endpoint)
   - Adapt bridge execution (different endpoint)
   - Balance fetching for USDT0
   - Maintain gas drop toggle

9. **`BridgeStatusTracker.tsx`**
   - Minimal changes — same LayerZero tracking mechanism

10. **Transfer page**
    - Add USDT0 to transferable token list
    - Hedera: HTS transfer (same as other HTS tokens)
    - Arbitrum: ERC20 transfer (same as USDC)

11. **Portfolio page**
    - Show USDT0 balance on both chains
    - Price = $1 (stablecoin pegged 1:1)

### Database

12. **No schema changes**
    - `kms_signing_audit.transaction_type` already accepts free text
    - New types: `bridge_usdt0`, `bridge_usdt0_reverse`, `transfer_usdt0`

## Hedera-Specific Considerations

### Tinybar/Weibar Conversion

Hedera EVM operates with 18-decimal weibars for `msg.value`, but actual gas is in 8-decimal tinybars. The OFT `quoteSend()` returns fees in the EVM denomination. Must handle conversion correctly (same as current USDC bridge).

### Token Association (HTS)

USDT0 on Hedera is an HTS token. Users must associate it before receiving. Use existing `/api/kms/sign-associate` to auto-associate before first reverse bridge (Arb → Hedera).

### Gas Drop via extraOptions

LayerZero V2 supports `extraOptions` in SendParam to deliver native gas on destination. Use LayerZero's `OptionsBuilder` encoding to add gas drop when requested.

## Error Handling

- **Insufficient USDT0 balance**: Check before executing, return clear error
- **Insufficient HBAR/ETH for LZ fee**: Check native balance covers fee + buffer
- **Token not associated**: Auto-associate on Hedera before receiving
- **OFT contract revert**: Parse revert reason, surface to user
- **LZ message timeout**: Same adaptive tracking as USDC bridge

## Security

- Same KMS signing model — keys never leave AWS HSM
- Same rate limiting (10/hr, 50/day)
- Same audit logging with new transaction types
- USDT0 OFT contracts are audited by Tether/LayerZero
- Dual DVN (LayerZero + USDT0) verifies every transfer

## Sources

- [Hedera USDT0 Integration Blog](https://hedera.com/blog/hedera-integrates-usdt0-for-crosschain-stablecoin-liquidity/)
- [USDT0 Documentation](https://docs.usdt0.to/)
- [USDT0 Developer Guide](https://docs.usdt0.to/technical-documentation/developer/)
- [LayerZero on Hedera](https://docs.hedera.com/hedera/open-source-solutions/interoperability-and-bridging/layerzero)
- [USDT0 on Arbitrum (Arbiscan)](https://arbiscan.io/token/0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9)
- [LayerZero OFT Interface](https://github.com/LayerZero-Labs/LayerZero-v2/blob/main/packages/layerzero-v2/evm/oapp/contracts/oft/interfaces/IOFT.sol)
- [USDT0 Deployments](https://docs.usdt0.to/technical-documentation/deployments)
