'use client'

/**
 * Hook for custodial connection operations.
 *
 * Provides methods for server-side KMS signing.
 * Used by useBridge and other hooks to delegate to server-side signing.
 */

import { useConnectionContext } from '@/contexts/ConnectionContext'

/**
 * Execute a custodial API call with the user's auth token.
 */
async function custodialFetch(
  endpoint: string,
  token: string,
  body?: Record<string, unknown>
): Promise<any> {
  const res = await fetch(endpoint, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const data = await res.json()
  if (!data.success && data.error) {
    throw new Error(data.error)
  }

  return data
}

export function useCustodialConnection() {
  const { session, custodialAccountId } = useConnectionContext()

  const token = session?.access_token

  /**
   * Sign and execute a token association via KMS.
   */
  const signAssociate = async (tokenId: string) => {
    if (!token) throw new Error('Not authenticated')
    return custodialFetch('/api/kms/sign-associate', token, { tokenId })
  }

  /**
   * Sign and execute a token approval via KMS.
   */
  const signApprove = async (tokenId: string, amount: string, spenderAccountId: string) => {
    if (!token) throw new Error('Not authenticated')
    return custodialFetch('/api/kms/sign-approve', token, {
      tokenId,
      amount,
      spenderAccountId,
    })
  }

  /**
   * Sign and execute an HBAR or token transfer via KMS.
   */
  const signTransfer = async (
    recipientAccountId: string,
    amount: string,
    tokenId?: string,
    decimals?: number
  ) => {
    if (!token) throw new Error('Not authenticated')
    return custodialFetch('/api/kms/sign-transfer', token, {
      recipientAccountId,
      amount,
      ...(tokenId ? { tokenId, decimals } : {}),
    })
  }

  /**
   * Sign and execute a bridge transaction via KMS.
   * Handles both approval + bridge in a single API call.
   */
  const signBridge = async (
    amount: string,
    receiverAddress: string,
    requestGasDrop: boolean,
    lzFeeHbar: number
  ) => {
    if (!token) throw new Error('Not authenticated')
    return custodialFetch('/api/kms/sign-bridge', token, {
      amount,
      receiverAddress,
      requestGasDrop,
      lzFeeHbar,
    })
  }

  /**
   * Sign and execute a reverse bridge (Arbitrum → Hedera) via KMS.
   * Uses the same ECDSA key to sign EVM transactions on Arbitrum.
   */
  const signBridgeReverse = async (
    amount: string,
    requestGasDrop?: boolean
  ) => {
    if (!token) throw new Error('Not authenticated')
    return custodialFetch('/api/kms/sign-bridge-reverse', token, {
      amount,
      requestGasDrop: requestGasDrop || false,
    })
  }

  /**
   * Sign and execute a USDT0 bridge (Hedera -> Arbitrum) via KMS + OFT.
   */
  const signBridgeUsdt0 = async (
    amount: string,
    receiverAddress: string,
    requestGasDrop: boolean,
    lzFeeHbar: number
  ) => {
    if (!token) throw new Error('Not authenticated')
    return custodialFetch('/api/kms/sign-bridge-usdt0', token, {
      amount,
      receiverAddress,
      requestGasDrop,
      lzFeeHbar,
    })
  }

  /**
   * Sign and execute a USDT0 reverse bridge (Arbitrum -> Hedera) via KMS + OFT.
   */
  const signBridgeUsdt0Reverse = async (
    amount: string,
    requestGasDrop?: boolean
  ) => {
    if (!token) throw new Error('Not authenticated')
    return custodialFetch('/api/kms/sign-bridge-usdt0-reverse', token, {
      amount,
      requestGasDrop: requestGasDrop || false,
    })
  }

  return {
    custodialAccountId,
    signAssociate,
    signApprove,
    signTransfer,
    signBridge,
    signBridgeReverse,
    signBridgeUsdt0,
    signBridgeUsdt0Reverse,
  }
}
