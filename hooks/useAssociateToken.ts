/**
 * Hook to associate a token to the user's custodial account
 *
 * Uses the KMS sign-associate API endpoint to associate HTS tokens
 * server-side via the custodial account.
 */

'use client'

import { useState } from 'react'
import { useConnectionContext } from '@/contexts/ConnectionContext'

export function useAssociateToken() {
    const { account, isConnected, session } = useConnectionContext()
    const [isAssociating, setIsAssociating] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const associateToken = async (tokenId: string): Promise<boolean> => {
        if (!isConnected || !account || !session?.access_token) {
            setError('Not authenticated')
            return false
        }

        if (!tokenId || tokenId === 'HBAR') {
            // HBAR doesn't need association
            return true
        }

        setIsAssociating(true)
        setError(null)

        try {
            console.log(
                `Associating token ${tokenId} to custodial account ${account}`
            )

            const res = await fetch('/api/kms/sign-associate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ tokenId }),
            })

            const data = await res.json()

            if (!data.success) {
                throw new Error(data.error || 'Association failed')
            }

            console.log('Token association successful:', data)
            return true
        } catch (err: any) {
            const errorMsg = err.message || 'Failed to associate token'
            console.error('Token association failed:', err)
            setError(errorMsg)
            return false
        } finally {
            setIsAssociating(false)
        }
    }

    return {
        associateToken,
        isAssociating,
        error,
    }
}
