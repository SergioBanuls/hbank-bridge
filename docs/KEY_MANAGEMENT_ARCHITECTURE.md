# HBank Bridge — Key Management Architecture

## 1. Overview

HBank Bridge is a secure custodial bridge application enabling USDC transfers between Hedera and Arbitrum. All cryptographic operations use AWS KMS hardware security modules (HSMs), ensuring private keys never leave the secure enclave.

## 2. Key Management Architecture

### 2.1 Key Generation
- Keys are generated as `ECC_SECG_P256K1` (secp256k1) asymmetric key pairs inside AWS KMS HSMs
- Each user gets a dedicated KMS key upon account creation
- Keys are tagged with `service: hbank-bridge` and `userId` for tracking

### 2.2 Key Storage
- Private keys are stored exclusively inside AWS KMS HSMs — they cannot be exported
- Only the public key is extracted (SPKI DER format → 65-byte uncompressed)
- Public key hex and KMS key ARN are stored in Supabase for reference

### 2.3 Key Rotation
- User-initiated rotation via the portfolio page
- Process:
  1. System checks Arbitrum balance (ETH + USDC) — blocks rotation if funds exist
  2. Creates new KMS key (secp256k1)
  3. Updates Hedera account key via `AccountUpdateTransaction` (signed with old key)
  4. Updates database records (new key ID, ARN, public key, EVM address)
  5. Disables old KMS key (not deleted — preserved for audit trail)
  6. Records rotation event in audit log
- Hedera account ID remains unchanged; EVM address changes (derived from public key)

### 2.4 Dual-Chain Identity
- Same secp256k1 key signs both Hedera and EVM (Arbitrum) transactions
- Hedera: public key registered via `AccountCreateTransaction`
- EVM: address derived as `keccak256(uncompressed_pubkey[1:])` → last 20 bytes
- One cryptographic identity expressed on two chains

## 3. Security Controls

### 3.1 Authentication
- Supabase email/OAuth authentication with JWT tokens
- All KMS endpoints require valid JWT in `Authorization: Bearer` header
- Server validates token via `supabase.auth.getUser()`

### 3.2 Authorization
- Row-Level Security (RLS) in Supabase ensures user isolation
- Users can only access their own custodial accounts
- Separate creator account with limited balance for account creation

### 3.3 Rate Limiting
- Per-user hourly limit: 10 signing operations
- Per-user daily limit: 50 signing operations
- Enforced server-side before any KMS call
- HTTP 429 response when exceeded

### 3.4 Input Validation
- All transaction parameters validated server-side
- Account ID format: `/^0\.0\.\d+$/`
- EVM address format: `/^0x[a-fA-F0-9]{40}$/`
- Amount validation: positive, not NaN, within limits

## 4. Audit Logging

### 4.1 Application-Level Audit (`kms_signing_audit` table)
Every signing operation records:
- `user_id` — who initiated the request
- `transaction_type` — operation type (transfer, bridge, key_rotation, etc.)
- `transaction_id` — blockchain transaction ID (when successful)
- `transaction_params` — input parameters (amounts, recipients, etc.)
- `kms_key_id` — which KMS key was used
- `ip_address` — client IP for security tracking
- `status` — success or failed
- `error_message` — failure reason (if applicable)
- `created_at` — timestamp

### 4.2 AWS CloudTrail Integration
- All KMS API calls (Sign, CreateKey, GetPublicKey, DisableKey) are logged by AWS CloudTrail
- Provides independent, tamper-resistant audit trail
- Includes IAM identity, timestamp, request parameters, source IP

## 5. Transaction Signing Flow

### 5.1 Hedera Transactions
```
Client Request (amount, recipient)
    ↓
API Route: Auth (JWT) → Rate Limit → Validate Input
    ↓
Build Transaction Server-Side (prevents client injection)
    ↓
Extract Transaction Body Bytes
    ↓
Hash: keccak256(bodyBytes) → 32-byte digest
    ↓
AWS KMS: Sign(digest, ECDSA_SHA_256) → DER signature
    ↓
Convert: DER → raw (r || s) with low-S normalization
    ↓
Add Signature to Transaction
    ↓
Execute on Hedera Network
    ↓
Record Audit Log
```

### 5.2 EVM (Arbitrum) Transactions
```
Client Request (amount, recipient, token)
    ↓
API Route: Auth (JWT) → Rate Limit → Validate Input
    ↓
Create KMS-Backed ethers.js Signer
    ↓
Build Transaction via ethers Contract
    ↓
KMS Signer: Sign transaction hash inside HSM
    ↓
Broadcast to Arbitrum Network
    ↓
Record Audit Log with tx hash
```

### 5.3 Key Security Guarantee
- Private keys NEVER leave AWS KMS HSM at any point
- Only 32-byte message digests are sent to KMS for signing
- Signatures are returned in DER format and converted to chain-specific formats
- No opportunity for key theft, logging, or interception

## 6. Integration with Hedera

### 6.1 Account Model
- Custodial accounts created via `AccountCreateTransaction` with KMS public key
- Accounts support ECDSA secp256k1 keys (HIP-583 compatible)
- Max 10 automatic token associations per account

### 6.2 Supported Operations
| Operation | Hedera Transaction | Signed By |
|-----------|-------------------|-----------|
| Account Creation | AccountCreateTransaction | Creator operator |
| Token Association | TokenAssociateTransaction | KMS (custodial key) |
| Token Approval | AccountAllowanceApproveTransaction | KMS (custodial key) |
| HBAR/Token Transfer | TransferTransaction | KMS (custodial key) |
| Bridge (Hedera→Arb) | ContractExecuteTransaction | KMS (custodial key) |
| Key Rotation | AccountUpdateTransaction | KMS (old custodial key) |

### 6.3 Cross-Chain Bridge
- USDC bridging via LayerZero OFT protocol
- Hedera → Arbitrum: HTS approval + contract call (signed by KMS)
- Arbitrum → Hedera: ERC20 approval + bridge call (signed by KMS via ethers Signer)

## 7. System Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Client (Browser)                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Portfolio │  │ Transfer │  │  Bridge  │              │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘              │
│       │              │              │                    │
│       └──────────────┼──────────────┘                    │
│                      │ HTTPS + JWT                       │
└──────────────────────┼───────────────────────────────────┘
                       │
┌──────────────────────┼───────────────────────────────────┐
│              Next.js API Routes                          │
│  ┌────────────────────────────────────────────┐          │
│  │  Auth (JWT) → Rate Limit → Validate Input  │          │
│  └───────────────────┬────────────────────────┘          │
│                      │                                   │
│  ┌───────────────────┼────────────────────────┐          │
│  │         Transaction Builder (Server)        │          │
│  └───────────────────┬────────────────────────┘          │
│                      │                                   │
└──────────────────────┼───────────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          │            │            │
    ┌─────┴─────┐ ┌───┴───┐ ┌─────┴──────┐
    │  AWS KMS  │ │Hedera │ │  Arbitrum   │
    │   (HSM)   │ │Network│ │  Network    │
    │           │ │       │ │            │
    │ Private   │ │ HBAR  │ │ ETH/USDC   │
    │ Keys      │ │ HTS   │ │ LayerZero  │
    │ Sign()    │ │ Bridge│ │            │
    └───────────┘ └───────┘ └────────────┘
          │
    ┌─────┴─────┐
    │ CloudTrail│
    │  (Audit)  │
    └───────────┘

┌───────────────────────────────────────┐
│            Supabase                    │
│  ┌────────────────────────────────┐   │
│  │ custodial_accounts (RLS)       │   │
│  │ kms_signing_audit (audit trail)│   │
│  │ kms_rate_limits (rate limits)  │   │
│  └────────────────────────────────┘   │
└───────────────────────────────────────┘
```
