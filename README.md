# HBank Bridge

**Custodial cross-chain DeFi platform on Hedera** — Bridge, transfer, and manage assets across Hedera and Arbitrum without ever touching a seed phrase.

> Built for the Hedera Hackathon 2025. Users authenticate with email or Google, and all cryptographic signing happens inside AWS KMS hardware security modules. No wallets. No extensions. Just DeFi.

---

## The Problem

Onboarding new users to DeFi is broken. Seed phrases, browser extensions, gas management, and cross-chain complexity create massive friction. Most people give up before making their first transaction.

## Our Solution

HBank Bridge abstracts away all wallet complexity. Users sign up with an email or Google account and immediately get a Hedera account with a fully functional cross-chain identity — powered by a dedicated hardware-secured key that signs on both Hedera and Arbitrum.

**One key. Two chains. Zero friction.**

---

## Key Features

### Cross-Chain Bridge (Hedera <> Arbitrum)
- Bi-directional **USDC bridging** via the **LayerZero OFT** protocol
- Optional **gas drop**: ~$2 in ETH airdropped to the receiver on Arbitrum so they can transact immediately
- Real-time bridge status tracking with adaptive polling via LayerZero Scan
- 0.3% bridge fee — transparent and predictable

### Custodial Key Management (Core Innovation)
- Private keys live **exclusively inside AWS KMS HSMs** — they can never be exported
- Each user gets a dedicated `secp256k1` key pair upon account creation
- The same key signs both **Hedera** and **EVM (Arbitrum)** transactions — one cryptographic identity on two chains (HIP-583 compatible)
- User-initiated **key rotation** with dual-signature verification
- Full **audit trail**: every signing operation is logged at both application level (Supabase) and infrastructure level (AWS CloudTrail)

### Multi-Chain Transfers
- Send **HBAR**, any **HTS token**, **ETH**, and **USDC**
- Works on both Hedera and Arbitrum from the same interface
- Automatic token association handling for Hedera Token Service

### Portfolio Dashboard
- Unified view of balances across Hedera and Arbitrum
- Real-time USD valuations via SaucerSwap + CoinGecko price feeds
- Token-level breakdown with portfolio percentages

### Missions & Incentives
- Gamified onboarding: complete actions (first bridge, first transfer) to earn **NFT rewards**
- NFTs minted from pre-allocated serial pools on Hedera
- Progress tracking for bridge count, swap count, and total bridged volume

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      Client (Browser)                        │
│   ┌──────────┐   ┌──────────┐   ┌──────────┐               │
│   │  Bridge   │   │ Transfer │   │Portfolio │               │
│   └────┬─────┘   └────┬─────┘   └────┬─────┘               │
│        └───────────────┼───────────────┘                     │
│                        │ HTTPS + JWT                         │
└────────────────────────┼─────────────────────────────────────┘
                         │
┌────────────────────────┼─────────────────────────────────────┐
│               Next.js API Routes (Server)                    │
│   ┌──────────────────────────────────────────────┐           │
│   │   Auth (JWT) → Rate Limit → Validate Input   │           │
│   └──────────────────────┬───────────────────────┘           │
│                          │                                   │
│   ┌──────────────────────┼───────────────────────┐           │
│   │       Transaction Builder (Server-Side)       │           │
│   └──────────────────────┬───────────────────────┘           │
└──────────────────────────┼───────────────────────────────────┘
                           │
             ┌─────────────┼─────────────┐
             │             │             │
       ┌─────┴─────┐ ┌────┴────┐ ┌──────┴──────┐
       │  AWS KMS   │ │ Hedera  │ │  Arbitrum   │
       │   (HSM)    │ │ Network │ │  Network    │
       │            │ │         │ │             │
       │ Private    │ │ HBAR    │ │ ETH / USDC  │
       │ Keys       │ │ HTS     │ │ LayerZero   │
       │ Sign()     │ │ Bridge  │ │             │
       └─────┬─────┘ └─────────┘ └─────────────┘
             │
       ┌─────┴─────┐
       │CloudTrail  │
       │ (Audit)    │
       └───────────┘

┌────────────────────────────────────────┐
│              Supabase                  │
│  ┌──────────────────────────────────┐  │
│  │ Auth (email + Google OAuth)      │  │
│  │ custodial_accounts (RLS)         │  │
│  │ kms_signing_audit (audit trail)  │  │
│  │ kms_rate_limits (10/hr, 50/day)  │  │
│  │ missions + user_mission_claims   │  │
│  └──────────────────────────────────┘  │
└────────────────────────────────────────┘
```

### Transaction Signing Flow

All transactions are built **server-side** to prevent client-side injection:

1. Client sends request with parameters (amount, recipient) + JWT
2. Server validates auth → checks rate limits → validates input
3. Transaction body is constructed on the server
4. Body bytes are hashed and sent to AWS KMS for signing
5. KMS returns signature (key never leaves the HSM)
6. Signed transaction is submitted to the blockchain
7. Audit log entry is recorded

This works identically for both Hedera (via `@hashgraph/sdk`) and Arbitrum (via `ethers.js` with a KMS-backed signer).

---

## Security Model

| Layer | Implementation |
|-------|---------------|
| **Key Storage** | AWS KMS HSMs — keys cannot be exported |
| **Authentication** | Supabase Auth (email/password + Google OAuth) with JWT |
| **Authorization** | Row-Level Security (RLS) — users can only access their own data |
| **Rate Limiting** | 10 signing operations/hour, 50/day per user |
| **Input Validation** | Server-side validation of all transaction parameters |
| **Audit** | Dual-layer: application-level Supabase table + AWS CloudTrail |
| **Transaction Safety** | All tx bodies built server-side — no client-constructed transactions |
| **Key Rotation** | User-initiated, dual-signature (old + new key), old key disabled for audit |

---

## Tech Stack

| Category | Technology |
|----------|-----------|
| Frontend | Next.js 15 (App Router), React 19, Tailwind CSS v4 |
| UI | Radix UI, shadcn/ui patterns, Sonner (toasts) |
| State | TanStack Query v5 (React Query) |
| Auth + DB | Supabase (PostgreSQL + Auth + RLS) |
| Key Management | AWS KMS (secp256k1 HSM keys) |
| Hedera | @hashgraph/sdk v2.76 |
| EVM | ethers.js v5 + @hashflow/aws-kms-ethers-signer |
| Bridge Protocol | LayerZero OFT (Omnichain Fungible Token) |
| Crypto | @noble/hashes (keccak256 for ECDSA compatibility) |
| Mirror Node | Validation Cloud |
| Language | TypeScript 5.9 |
| Package Manager | pnpm |

---

## How It Works — User Journey

### 1. Sign Up
User creates an account with email/password or Google OAuth. No wallet, no extension, no seed phrase.

### 2. Account Creation
The system creates a dedicated AWS KMS key (secp256k1) and uses it to create a Hedera account. The EVM address is derived from the same public key — giving the user a cross-chain identity.

### 3. Fund Account
User sends HBAR to their new Hedera account to cover transaction fees.

### 4. Bridge
User selects an amount of USDC to bridge from Hedera to Arbitrum (or vice versa). The server builds and signs all necessary transactions (approval + bridge call) using the user's KMS key. LayerZero handles cross-chain message delivery. Optional gas drop provides ETH on arrival.

### 5. Transfer
User can send HBAR, HTS tokens, ETH, or USDC to any address on either chain. All signing is handled server-side.

### 6. Earn Rewards
Completing actions like the first bridge or first transfer unlocks missions that reward NFTs to the user's Hedera account.

---

## Project Structure

```
hbank-bridge/
├── app/                     # Next.js App Router
│   ├── bridge/              # Bridge page (main feature)
│   ├── transfer/            # Multi-chain transfer page
│   ├── portfolio/           # Portfolio dashboard
│   ├── auth/callback/       # OAuth callback
│   └── api/                 # Server-side API routes
│       ├── auth/            #   Login, signup, logout
│       ├── kms/             #   All custodial signing endpoints
│       ├── bridge/          #   Quotes, tracking, balances
│       └── balances/        #   Token balance queries
├── components/              # React components
│   ├── BridgeCard.tsx       #   Main bridge interface
│   ├── BridgeStatusTracker  #   Live cross-chain tracking
│   ├── MissionsSheet.tsx    #   Missions, account, key rotation
│   └── ui/                  #   shadcn/ui primitives
├── contexts/                # React contexts (auth, prices)
├── hooks/                   # Custom hooks (bridge, balances, tokens)
├── lib/
│   ├── kms/                 # AWS KMS integration
│   │   ├── kms-client.ts    #   Key creation, signing, public key extraction
│   │   ├── transaction-signer.ts  # Hedera tx signing
│   │   └── evm-signer.ts   #   KMS-backed ethers.js Signer
│   ├── bridge/              # LayerZero bridge logic
│   └── supabase.ts          # Supabase client setup
└── types/                   # TypeScript type definitions
```

---

## Smart Contracts

| Contract | Network | Address |
|----------|---------|---------|
| Bridge V3 | Hedera Mainnet | `0.0.10295928` |
| Bridge V3 | Arbitrum One | `0xCFDA1CFf2b9f570817866434bBf60213764F0E61` |

Built on the LayerZero OApp pattern with:
- `bridgeTokens()` — standard bridge with 0.3% fee
- `bridgeTokensWithGasDrop()` — bridge + ETH airdrop on destination
- `quote()` — LayerZero fee estimation

---

## What Makes This Different

1. **No wallet required** — Users sign up with email/Google. The complexity of key management is fully abstracted.
2. **Hardware-grade security** — AWS KMS HSMs provide the same level of key protection used by banks, but accessible to any web user.
3. **One key, two chains** — A single secp256k1 key creates a unified identity across Hedera and Arbitrum (EVM), enabled by HIP-583.
4. **Server-side transaction building** — All transaction bodies are constructed on the server, eliminating an entire class of client-side attacks.
5. **Complete audit trail** — Every operation is logged at application and infrastructure level, providing full transparency.
6. **Gamified onboarding** — Mission system with NFT rewards drives user engagement and cross-chain activity.

---

## Getting Started

```bash
pnpm install
cp .env.example .env.local
# Fill in environment variables (Supabase, AWS KMS, Hedera, etc.)
pnpm dev
```

---

## Team

Built with Next.js, Hedera, LayerZero, AWS KMS, and Supabase.
