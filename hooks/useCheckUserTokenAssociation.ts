/**
 * Hook to check if a user has a token associated with their account
 *
 * Uses the balances API to check if the token appears in the user's tokenRelationships
 * A token must be associated before the user can receive it in a transaction
 */

'use client'

import { useState, useEffect, useCallback } from 'react'

export function useCheckUserTokenAssociation(
    accountId: string | null,
    tokenId: string | null
) {
    const [isAssociated, setIsAssociated] = useState<boolean>(true) // Default to true to avoid false positives
    const [isChecking, setIsChecking] = useState<boolean>(false)
    const [error, setError] = useState<string | null>(null)
    const [refreshTrigger, setRefreshTrigger] = useState(0)

    const checkAssociation = useCallback(async () => {
        // Reset state if no account or no token
        if (!accountId || !tokenId) {
            setIsAssociated(true)
            setIsChecking(false)
            setError(null)
            return
        }

        // HBAR doesn't need association
        if (tokenId === 'HBAR') {
            setIsAssociated(true)
            setIsChecking(false)
            return
        }

        setIsChecking(true)
        setError(null)

        try {
            // Check if token exists in user's balance (even with 0 balance means it's associated)
            const response = await fetch(
                `/api/balances/${accountId}?_t=${Date.now()}`
            )

            if (!response.ok) {
                throw new Error('Failed to fetch account info')
            }

            const data = await response.json()

            // Check if the tokenId exists in associatedTokens array
            // This includes all tokens associated with the account, even with 0 balance
            const hasToken = data.associatedTokens?.includes(tokenId)

            console.log(
                `🔍 Token ${tokenId} association check:`,
                hasToken ? '✅ Associated' : '❌ Not associated',
                `(found ${data.associatedTokens?.length || 0} associated tokens)`
            )
            setIsAssociated(hasToken)
        } catch (err) {
            console.error('Error checking token association:', err)
            setError(
                err instanceof Error
                    ? err.message
                    : 'Failed to check token association'
            )
            // On error, assume associated to not block the user
            setIsAssociated(true)
        } finally {
            setIsChecking(false)
        }
    }, [accountId, tokenId])

    // Manual refresh function
    const refresh = useCallback(() => {
        setRefreshTrigger((prev) => prev + 1)
    }, [])

    useEffect(() => {
        checkAssociation()
    }, [checkAssociation, refreshTrigger])

    return {
        isAssociated,
        isChecking,
        error,
        refresh,
    }
}
