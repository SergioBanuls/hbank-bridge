/**
 * Token Association Manager
 *
 * Manages HTS token association checks for user accounts.
 * Before a user can receive HTS tokens, they must associate the token with their account.
 * The actual association transaction is handled server-side via /api/kms/sign-associate.
 */

export interface TokenAssociationStatus {
    isAssociated: boolean
    tokenId: string
}

export interface AssociateTokenParams {
    tokenId: string // Hedera token ID (0.0.X) or 'HBAR'
    accountId: string // User's account ID
}

/**
 * Check if a token is associated with an account
 *
 * @param params - Token and account parameters
 * @returns Association status
 */
export async function checkTokenAssociation(
    params: AssociateTokenParams
): Promise<TokenAssociationStatus> {
    const { tokenId, accountId } = params

    // HBAR doesn't need association
    if (tokenId === 'HBAR') {
        return {
            isAssociated: true,
            tokenId,
        }
    }

    try {
        // Query Mirror Node for account token associations
        const network = process.env.NEXT_PUBLIC_HEDERA_NETWORK || 'testnet'
        const useApiEndpoint = network === 'mainnet'

        // Use API endpoint for mainnet (secure), direct for testnet
        const url = useApiEndpoint
            ? `/api/mirror/account-tokens/${accountId}`
            : `https://testnet.mirrornode.hedera.com/api/v1/accounts/${accountId}/tokens`

        const response = await fetch(url)

        if (!response.ok) {
            console.warn(
                'Failed to fetch token associations, assuming not associated'
            )
            return {
                isAssociated: false,
                tokenId,
            }
        }

        const data = await response.json()

        // Check if token is in the list of associated tokens
        const isAssociated =
            data.tokens?.some((token: any) => token.token_id === tokenId) ||
            false

        return {
            isAssociated,
            tokenId,
        }
    } catch (error) {
        console.error('Error checking token association:', error)
        // On error, assume not associated (safer)
        return {
            isAssociated: false,
            tokenId,
        }
    }
}

/**
 * Check if token association is needed for the user's account.
 *
 * This function checks the association status and returns whether
 * association is required. The actual association is performed
 * server-side via /api/kms/sign-associate in the custodial flow.
 *
 * @param params - Association parameters
 * @returns Object with association status
 */
export async function requestTokenAssociation(
    params: AssociateTokenParams
): Promise<{
    needed: boolean
    status: TokenAssociationStatus
}> {
    // Skip HBAR
    if (params.tokenId === 'HBAR') {
        return {
            needed: false,
            status: {
                isAssociated: true,
                tokenId: params.tokenId,
            },
        }
    }

    // Check current association
    const status = await checkTokenAssociation(params)

    return {
        needed: !status.isAssociated,
        status,
    }
}
