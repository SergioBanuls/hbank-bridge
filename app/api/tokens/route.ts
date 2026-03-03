/**
 * API Route Handler for fetching known tokens
 *
 * Fetches tokens from Etaswap API
 */

import { NextResponse } from 'next/server';

const API_URL = 'https://api.etaswap.com/v1/tokens';

export async function GET() {
  try {
    const response = await fetch(API_URL, {
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.warn('Rate limited when fetching tokens list');
        return NextResponse.json(
          { error: 'Rate limited', code: 429 },
          { status: 429 }
        );
      }
      throw new Error(`Etaswap API error: ${response.status}`);
    }

    const tokens = await response.json();

    // Normalize token icons: fix relative paths from the API
    const normalizedTokens = tokens.map((token: { icon?: string; address?: string; [key: string]: unknown }) => {
      if (token.icon && !token.icon.startsWith('http')) {
        // HBAR has a relative path "/tokens/hbar.png" - use local icon
        return { ...token, icon: '/hbar.png' }
      }
      return token
    })

    return NextResponse.json(normalizedTokens);
  } catch (error) {
    console.error('Error fetching tokens:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tokens' },
      { status: 500 }
    );
  }
}
