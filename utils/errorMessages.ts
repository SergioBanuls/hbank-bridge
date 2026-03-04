/**
 * Error Message Utility
 *
 * Parses Hedera transaction errors and provides user-friendly messages in English.
 */

export interface ParsedError {
    userMessage: string
    technicalMessage: string
    suggestion?: string
}

/**
 * Parse Hedera error and return user-friendly message
 */
export function parseHederaError(error: any): ParsedError {
    let errorString = error?.message || error?.toString() || 'Unknown error'

    // Handle wallet connect errors with nested JSON
    try {
        // Check if error contains txError or queryError objects
        if (typeof error === 'object' && (error.txError || error.queryError)) {
            // Extract the most relevant message
            if (error.txError?.message) {
                errorString = error.txError.message
            } else if (error.queryError?.message) {
                errorString = error.queryError.message
            }
        }

        // Remove common error prefixes
        const prefixes = [
            'Error executing transaction or query:',
            'Error:',
            'Transaction error:',
            'Query error:',
        ]

        for (const prefix of prefixes) {
            if (errorString.startsWith(prefix)) {
                errorString = errorString.substring(prefix.length).trim()
                break
            }
        }

        // Try to parse stringified JSON errors
        if (
            errorString.includes('txError') ||
            errorString.includes('queryError')
        ) {
            const jsonMatch = errorString.match(/\{[\s\S]*?\}(?=\s|$)/)
            if (jsonMatch) {
                try {
                    const parsed = JSON.parse(jsonMatch[0])
                    if (parsed.txError?.message) {
                        errorString = parsed.txError.message
                    } else if (parsed.queryError?.message) {
                        errorString = parsed.queryError.message
                    }
                } catch {
                    // If JSON parsing fails, try to extract message manually
                    const messageMatch = errorString.match(
                        /"message"\s*:\s*"([^"]+)"/
                    )
                    if (messageMatch && messageMatch[1]) {
                        errorString = messageMatch[1]
                    }
                }
            }
        }

        // Remove stack traces and long technical details
        if (errorString.includes('\n at ')) {
            errorString = errorString.split('\n at ')[0].trim()
        }

        // Remove incomplete JSON fragments
        if (errorString.includes('{') && !errorString.trim().endsWith('}')) {
            const beforeJson = errorString
                .substring(0, errorString.indexOf('{'))
                .trim()
            if (beforeJson) {
                errorString = beforeJson
            }
        }

        // Truncate very long error messages
        if (errorString.length > 500) {
            errorString = errorString.substring(0, 500) + '...'
        }
    } catch {
        // If any parsing fails, use original error string
    }

    const errorLower = errorString.toLowerCase()

    // INSUFFICIENT_PAYER_BALANCE - Not enough HBAR
    if (
        errorLower.includes('insufficient_payer_balance') ||
        errorLower.includes('insufficient payer balance') ||
        errorLower.includes('insufficient balance')
    ) {
        return {
            userMessage: 'Insufficient HBAR balance',
            technicalMessage: errorString,
            suggestion:
                'You need at least ~0.05 HBAR to associate a token. Please add HBAR to your wallet.',
        }
    }

    // INSUFFICIENT_TX_FEE - Transaction fee insufficient
    if (
        errorLower.includes('insufficient_tx_fee') ||
        errorLower.includes('insufficient transaction fee')
    ) {
        return {
            userMessage: 'Transaction fee is insufficient',
            technicalMessage: errorString,
            suggestion:
                'The transaction fee is lower than the minimum required by the network.',
        }
    }

    // TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT - Token already associated
    if (
        errorLower.includes('token_already_associated') ||
        errorLower.includes('already associated')
    ) {
        return {
            userMessage: 'This token is already associated with your account',
            technicalMessage: errorString,
            suggestion: 'You can proceed with the transaction directly.',
        }
    }

    // INVALID_SIGNATURE - Invalid or rejected signature
    if (
        errorLower.includes('invalid_signature') ||
        errorLower.includes('signature') ||
        errorLower.includes('rejected') ||
        errorLower.includes('user rejected') ||
        errorLower.includes('was rejected')
    ) {
        return {
            userMessage: 'Transaction rejected in wallet',
            technicalMessage: errorString,
            suggestion:
                'You cancelled the transaction signature in your wallet.',
        }
    }

    // TRANSACTION_EXPIRED - Transaction expired
    if (
        errorLower.includes('transaction_expired') ||
        errorLower.includes('expired')
    ) {
        return {
            userMessage: 'Transaction has expired',
            technicalMessage: errorString,
            suggestion:
                'Please try again. The transaction took too long to be signed.',
        }
    }

    // INVALID_ACCOUNT_ID - Invalid account
    if (
        errorLower.includes('invalid_account') ||
        errorLower.includes('account not found')
    ) {
        return {
            userMessage: 'Invalid or not found account',
            technicalMessage: errorString,
            suggestion: 'Verify that your wallet is properly connected.',
        }
    }

    // INVALID_TOKEN_ID - Invalid token
    if (
        errorLower.includes('invalid_token') ||
        errorLower.includes('token not found')
    ) {
        return {
            userMessage: 'Token not found',
            technicalMessage: errorString,
            suggestion:
                'The token you are trying to use does not exist or is not available on this network.',
        }
    }

    // MAX_ENTITIES_IN_PRICE_REGIME_HAVE_BEEN_CREATED
    if (errorLower.includes('max_entities')) {
        return {
            userMessage: 'Token association limit reached',
            technicalMessage: errorString,
            suggestion:
                'You have reached the maximum number of tokens associated with your account.',
        }
    }

    // INSUFFICIENT_GAS - Insufficient gas
    if (
        errorLower.includes('insufficient gas') ||
        errorLower.includes('out of gas')
    ) {
        return {
            userMessage: 'Insufficient gas for transaction',
            technicalMessage: errorString,
            suggestion: 'The transaction requires more gas than specified.',
        }
    }

    // Network errors
    if (
        errorLower.includes('network') ||
        errorLower.includes('timeout') ||
        errorLower.includes('connection')
    ) {
        return {
            userMessage: 'Network connection error',
            technicalMessage: errorString,
            suggestion: 'Check your internet connection and try again.',
        }
    }

    // Generic approval/association errors
    if (errorLower.includes('approval')) {
        return {
            userMessage: 'Token approval failed',
            technicalMessage: errorString,
            suggestion: 'There was a problem approving the token spending.',
        }
    }

    if (errorLower.includes('association')) {
        return {
            userMessage: 'Token association failed',
            technicalMessage: errorString,
            suggestion:
                'There was a problem associating the token to your account.',
        }
    }

    // Default: return original error
    return {
        userMessage: 'Transaction error',
        technicalMessage: errorString,
        suggestion: 'Please review the error details and try again.',
    }
}

/**
 * Format error for user display
 */
export function formatErrorMessage(error: any): string {
    const parsed = parseHederaError(error)

    let message = `❌ ${parsed.userMessage}`

    if (parsed.suggestion) {
        message += `\n\n💡 ${parsed.suggestion}`
    }

    return message
}

/**
 * Get short error message for toasts
 */
export function getShortErrorMessage(error: any): string {
    const parsed = parseHederaError(error)
    return parsed.userMessage
}
