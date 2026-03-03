/**
 * Hook for fetching token balances for a connected account
 *
 * Uses API route to fetch all token balances for an account.
 * Automatically refreshes balances periodically.
 *
 * @param accountId - The Hedera account ID (e.g., "0.0.123456")
 * @returns {Object} - balances map, loading state, error, and refresh function
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const REFRESH_INTERVAL = 30000; // 30 seconds

export interface TokenBalance {
  tokenId: string;
  balance: string;
  decimals: number;
}

export function useTokenBalances(accountId: string | null) {
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasFetchedRef = useRef(false);

  const fetchBalances = useCallback(async (isBackground = false) => {
    if (!accountId) {
      setBalances({});
      setLoading(false);
      return;
    }

    // Only show loading on initial fetch, not background refreshes
    if (!isBackground) {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await fetch(`/api/balances/${accountId}`);

      if (!response.ok) {
        throw new Error('Failed to fetch balances from API');
      }

      const data = await response.json();

      const balanceMap: Record<string, string> = {};

      if (data.balances && Array.isArray(data.balances)) {
        data.balances.forEach((item: { tokenId: string; balance: string }) => {
          balanceMap[item.tokenId] = item.balance;
        });
      }

      setBalances(balanceMap);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch balances:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch balances');
    } finally {
      if (!isBackground) {
        setLoading(false);
      }
    }
  }, [accountId]);

  // Fetch on mount and when accountId changes
  useEffect(() => {
    hasFetchedRef.current = false;
    fetchBalances();
    hasFetchedRef.current = true;
  }, [fetchBalances]);

  // Silent background refresh
  useEffect(() => {
    if (!accountId) return;

    const interval = setInterval(() => {
      fetchBalances(true);
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [accountId, fetchBalances]);

  return {
    balances,
    loading,
    error,
    refresh: fetchBalances,
  };
}
