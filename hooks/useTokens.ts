/**
 * Hook for fetching the list of known tokens
 *
 * Uses TanStack Query for intelligent caching and background refetching.
 * Tokens are cached for 5 minutes as they don't change frequently.
 *
 * Fetches full token list from Etaswap API
 *
 * @returns {Object} - TanStack Query result with tokens data
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { Token } from '@/types/token';

async function fetchTokens(): Promise<Token[]> {
  const response = await fetch(`/api/tokens`);

  if (!response.ok) {
    throw new Error('Failed to fetch tokens');
  }

  const data = await response.json();
  return data;
}

export function useTokens() {
  return useQuery({
    queryKey: ['tokens'],
    queryFn: () => fetchTokens(),
    staleTime: 5 * 60 * 1000, // 5min - tokens don't change frequently
    gcTime: 60 * 60 * 1000, // 1h
    refetchOnWindowFocus: false,
  });
}

