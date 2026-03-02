# HBank Bridge

Cross-chain bridge and transfer platform for Hedera, featuring custodial authentication and portfolio management.

## Features

- **Bridge**: USDC bridge between Hedera and Arbitrum via LayerZero
- **Transfer**: HBAR and HTS token transfers
- **Portfolio**: Token balances and portfolio overview
- **Custodial Auth**: Email/OAuth authentication with server-side KMS signing

## Getting Started

```bash
npm install
cp .env.example .env.local
# Fill in environment variables
npm run dev
```

## Tech Stack

- Next.js 15 (App Router)
- React 19
- Tailwind CSS 4
- Supabase (Auth + Database)
- AWS KMS (Custodial signing)
- Hedera SDK
- ethers.js (Arbitrum integration)
