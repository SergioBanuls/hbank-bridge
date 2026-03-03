/**
 * API Route Handler for fetching individual token price
 *
 * Returns mock prices for testnet tokens
 * For mainnet, fetches real prices from SaucerSwap API
 */

import { NextResponse } from 'next/server';

const SAUCERSWAP_API_URL = 'https://api.saucerswap.finance/tokens/known';
const API_KEY = process.env.SAUCERSWAP_API_KEY;
const HEDERA_NETWORK = process.env.NEXT_PUBLIC_HEDERA_NETWORK || 'testnet';

// Mock prices for testnet tokens
const TESTNET_PRICES: Record<string, number> = {
  'HBAR': 0.10,
  '0.0.429274': 1.00, // USDC
};

// Cache for mainnet token prices (5 minutes)
let mainnetPriceCache: Record<string, { price: number; timestamp: number }> = {};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

async function fetchMainnetPrice(tokenId: string): Promise<number> {
  // Check cache first
  const cached = mainnetPriceCache[tokenId];
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.price;
  }

  if (!API_KEY) {
    console.error('SAUCERSWAP_API_KEY not configured');
    return 0;
  }

  try {
    const response = await fetch(SAUCERSWAP_API_URL, {
      headers: { 'x-api-key': API_KEY },
    });

    if (!response.ok) {
      console.error(`SaucerSwap API error: ${response.status}`);
      return 0;
    }

    const tokens = await response.json();
    const token = tokens.find((t: any) => t.id === tokenId || t.symbol === tokenId);
    
    const price = token?.priceUsd || 0;

    // Update cache
    mainnetPriceCache[tokenId] = {
      price,
      timestamp: Date.now(),
    };

    return price;
  } catch (error) {
    console.error('Error fetching mainnet price:', error);
    return 0;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tokenId: string }> }
) {
  const { tokenId } = await params;

  if (!tokenId) {
    return NextResponse.json(
      { error: 'Token ID is required' },
      { status: 400 }
    );
  }

  let priceUsd = 0;

  if (HEDERA_NETWORK === 'mainnet') {
    priceUsd = await fetchMainnetPrice(tokenId);
  } else {
    priceUsd = TESTNET_PRICES[tokenId] || 0;
  }

  return NextResponse.json({
    id: tokenId,
    priceUsd,
  });
}
