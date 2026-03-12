'use client'

/**
 * Bridge orchestration hook for Hedera <-> Arbitrum bridging.
 *
 * Hedera -> Arbitrum: custodial (KMS) signing
 * Arbitrum -> Hedera: MetaMask (window.ethereum) only
 */

import { useState, useCallback, useRef } from 'react'
import { useConnectionContext } from '@/contexts/ConnectionContext'
import { useCustodialConnection } from '@/hooks/useCustodialConnection'
import {
  BridgeStatus,
  BridgeDirection,
  accountIdToEvmAddress,
  BRIDGE_V3_CONFIG,
  ARBITRUM_CONFIG,
  LAYER_ZERO_CONFIG,
} from '@/lib/bridge/bridgeConstants'
import { fetchBridgeQuoteV3 } from '@/lib/bridge/bridgeTransactionBuilder'
import { fetchUsdt0Quote } from '@/lib/bridge/usdt0TransactionBuilder'
import { truncateBalance } from '@/utils/amountValidation'

interface BridgeState {
  status: BridgeStatus
  statusMessage: string
  direction: BridgeDirection
  transactionId: string | null
  hederaTxHash: string | null
  error: string | null
}

interface TrackResult {
  success: boolean
  status: string
  hedera: { confirmed: boolean; transactionHash?: string }
  layerZero: { status?: string; dstTxHash?: string }
  arbitrum: { delivered: boolean; newBalance?: string }
}

export function useBridge() {
  const { account, isConnected, connectionMode, session } = useConnectionContext()
  const { signBridge, signBridgeUsdt0, signBridgeUsdt0Reverse } = useCustodialConnection()

  const [state, setState] = useState<BridgeState>({
    status: 'idle',
    statusMessage: '',
    direction: 'hedera_to_arbitrum',
    transactionId: null,
    hederaTxHash: null,
    error: null,
  })

  const trackingRef = useRef(false)

  const setStatus = useCallback((status: BridgeStatus, statusMessage: string) => {
    setState(prev => ({ ...prev, status, statusMessage, error: null }))
  }, [])

  const setError = useCallback((error: string) => {
    setState(prev => ({ ...prev, status: 'error', error, statusMessage: '' }))
  }, [])

  const reset = useCallback(() => {
    trackingRef.current = false
    setState({
      status: 'idle',
      statusMessage: '',
      direction: 'hedera_to_arbitrum',
      transactionId: null,
      hederaTxHash: null,
      error: null,
    })
  }, [])

  /**
   * Track bridge transaction via /api/bridge/track with progressive polling
   */
  const trackBridge = useCallback(async (
    transactionId: string,
    destinationAddress: string,
    initialBalance: string
  ): Promise<boolean> => {
    trackingRef.current = true
    setStatus('waiting_lz', 'Waiting for LayerZero delivery...')

    const maxAttempts = 120 // ~10 minutes with adaptive polling
    let attempt = 0

    while (trackingRef.current && attempt < maxAttempts) {
      try {
        const response = await fetch('/api/bridge/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transactionId,
            destinationAddress,
            initialArbitrumBalance: initialBalance,
          }),
        })

        const result: TrackResult = await response.json()

        if (!result.success) {
          attempt++
          await new Promise(r => setTimeout(r, 5000))
          continue
        }

        // Store the hex transaction hash for LayerZero Scan URL
        if (result.hedera?.transactionHash) {
          const txHash = result.hedera.transactionHash as string
          setState(prev => prev.hederaTxHash ? prev : { ...prev, hederaTxHash: txHash })
        }

        switch (result.status) {
          case 'delivered':
            setStatus('success', 'Bridge complete! USDC delivered.')
            trackingRef.current = false
            return true

          case 'lz_delivered':
            setStatus('confirming', 'LayerZero delivered, confirming on Arbitrum...')
            break

          case 'lz_inflight':
            setStatus('waiting_lz', 'Cross-chain message in flight...')
            break

          case 'hedera_confirmed':
            setStatus('waiting_lz', 'Hedera confirmed, waiting for LayerZero...')
            break

          case 'failed':
            setError('Bridge transaction failed')
            trackingRef.current = false
            return false

          default:
            setStatus('waiting_lz', 'Waiting for Hedera confirmation...')
        }
      } catch {
        // Continue polling on network errors
      }

      attempt++
      // Adaptive polling: faster initially, slower after
      const delay = attempt < 12 ? 5000 : attempt < 30 ? 10000 : 15000
      await new Promise(r => setTimeout(r, delay))
    }

    if (trackingRef.current) {
      setError('Tracking timed out. Bridge may still complete — check HashScan.')
      trackingRef.current = false
    }
    return false
  }, [setStatus, setError])

  /**
   * Track Arbitrum → Hedera bridge via LayerZero Scan polling
   */
  const trackArbToHedera = useCallback(async (txHash: string) => {
    trackingRef.current = true
    setStatus('waiting_lz', 'Waiting for LayerZero to pick up transaction...')

    const maxAttempts = 44 // ~11 minutes at 15s intervals
    let attempt = 0

    while (trackingRef.current && attempt < maxAttempts) {
      try {
        const res = await fetch(`/api/bridge/lz-status?txHash=${txHash}`)
        const data = await res.json()

        if (data.success) {
          switch (data.status) {
            case 'DELIVERED':
              setStatus('success', 'Bridge complete! USDC delivered to Hedera.')
              trackingRef.current = false
              return
            case 'INFLIGHT':
            case 'CONFIRMING':
              setStatus('waiting_lz', 'Cross-chain message in flight...')
              break
            case 'FAILED':
              setError('LayerZero delivery failed. Check LayerZero Scan for details.')
              trackingRef.current = false
              return
            case 'NOT_FOUND':
              // LZ hasn't indexed the tx yet, keep polling
              break
          }
        }
      } catch {
        // Network error, continue polling
      }

      attempt++
      await new Promise(r => setTimeout(r, 15000))
    }

    if (trackingRef.current) {
      setStatus('success', 'Bridge submitted. Delivery may take a few more minutes — check LayerZero Scan.')
      trackingRef.current = false
    }
  }, [setStatus, setError])

  /**
   * Bridge USDC from Hedera to Arbitrum
   */
  const bridgeToArbitrum = useCallback(async (
    amountUsdc: string,
    receiverAddress: string,
    requestGasDrop: boolean = false
  ) => {
    if (!account || !isConnected) {
      setError('Wallet not connected')
      return
    }

    setState(prev => ({
      ...prev,
      direction: 'hedera_to_arbitrum',
      status: 'quoting',
      statusMessage: 'Getting LayerZero quote...',
      error: null,
      transactionId: null,
    }))

    try {
      // 1. Fetch LZ quote
      const quote = await fetchBridgeQuoteV3(amountUsdc, receiverAddress, requestGasDrop)
      if (!quote.success) {
        setError(quote.error || 'Failed to get bridge quote')
        return
      }

      const lzFeeHbar = parseFloat(quote.nativeFeeHbar)

      // 2. Get initial Arbitrum balance for tracking
      let initialBalance = '0'
      try {
        const balRes = await fetch(`/api/bridge/arbitrum-balance?address=${receiverAddress}`)
        const balData = await balRes.json()
        if (balData.success) {
          initialBalance = balData.usdcBalance || '0'
        }
      } catch {
        // Continue with 0 — tracking will still work
      }

      let transactionId: string

      setStatus('approving', 'Approving USDC for bridge...')
      const bridgeResult = await signBridge(amountUsdc, receiverAddress, requestGasDrop, lzFeeHbar)
      transactionId = bridgeResult.transactionId

      setState(prev => ({ ...prev, transactionId }))

      // 3. Track delivery
      await trackBridge(transactionId, receiverAddress, initialBalance)
    } catch (error: any) {
      console.error('[Bridge] Error:', error)
      const msg = error.message || 'Bridge failed'
      if (msg.includes('USER_REJECT') || msg.includes('rejected')) {
        setError('Transaction rejected by user')
      } else if (msg.includes('INSUFFICIENT_PAYER_BALANCE')) {
        setError('Insufficient HBAR to pay bridge fees. Send HBAR to your Hedera account first.')
      } else {
        setError(msg)
      }
    }
  }, [account, isConnected, signBridge, setStatus, setError, trackBridge])

  /**
   * Bridge USDC from Arbitrum to Hedera (requires MetaMask / window.ethereum)
   */
  const bridgeToHedera = useCallback(async (
    amountUsdc: string,
    hederaReceiverAccountId: string,
    options?: { forceExternal?: boolean }
  ) => {
    // --- CUSTODIAL PATH: Sign via KMS ---
    if (connectionMode === 'custodial' && !options?.forceExternal) {
      try {
        setState(prev => ({
          ...prev,
          direction: 'arbitrum_to_hedera',
          status: 'bridging',
          statusMessage: 'Signing bridge via KMS...',
          error: null,
          transactionId: null,
        }))

        const token = session?.access_token
        if (!token) throw new Error('Not authenticated')

        const res = await fetch('/api/kms/sign-bridge-reverse', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            amount: amountUsdc,
          }),
        })

        const data = await res.json()
        if (!data.success) {
          throw new Error(data.error || 'Bridge reverse failed')
        }

        setState(prev => ({ ...prev, transactionId: data.txHash }))

        // Track via LayerZero (same tracking as MetaMask path)
        await trackArbToHedera(data.txHash)
        return
      } catch (err: any) {
        console.error('[Bridge] Custodial Arb→Hedera error:', err)
        setError(err.message || 'Bridge failed')
        return
      }
    }

    // --- WALLET PATH: Original MetaMask flow ---
    if (!window.ethereum) {
      setError('MetaMask or an EVM wallet is required for Arbitrum -> Hedera bridging')
      return
    }

    setState(prev => ({
      ...prev,
      direction: 'arbitrum_to_hedera',
      status: 'quoting',
      statusMessage: 'Getting LayerZero quote...',
      error: null,
      transactionId: null,
    }))

    try {
      // Convert Hedera account to EVM address for the receiver
      const receiverEvmAddress = accountIdToEvmAddress(hederaReceiverAccountId)

      // 1. Request MetaMask accounts
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) as string[]
      const sender = accounts[0]
      if (!sender) {
        setError('No MetaMask account available')
        return
      }

      // Ensure we're on Arbitrum
      const chainId = await window.ethereum.request({ method: 'eth_chainId' })
      if (parseInt(chainId as string, 16) !== 42161) {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0xa4b1' }],
          })
        } catch {
          setError('Please switch to Arbitrum One network in MetaMask')
          return
        }
      }

      // 2. Check user's USDC balance on Arbitrum
      const amountRaw = Math.floor(parseFloat(amountUsdc) * 1_000_000)
      setStatus('quoting', 'Checking USDC balance...')
      try {
        const balRes = await fetch(`/api/bridge/arbitrum-balance?address=${sender}`)
        const balData = await balRes.json()
        if (balData.success) {
          const usdcBalance = BigInt(balData.usdcBalance || '0')
          if (usdcBalance < BigInt(amountRaw)) {
            const balanceUsdc = truncateBalance(Number(usdcBalance) / 1_000_000)
            setError(`Insufficient USDC on Arbitrum. You have ${balanceUsdc} USDC but need ${amountUsdc} USDC.`)
            return
          }
        }
      } catch {
        // Continue — the bridge contract will revert if balance is insufficient
      }

      // 3. Fetch LZ quote (reverse)
      const quoteRes = await fetch('/api/bridge/quote-v3-reverse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amountUsdc, receiver: receiverEvmAddress }),
      })
      const quoteData = await quoteRes.json()
      if (!quoteData.success) {
        setError(quoteData.error || 'Failed to get reverse quote')
        return
      }

      const nativeFeeWei = quoteData.nativeFeeWei

      // 4. Check and request USDC allowance
      setStatus('approving', 'Checking USDC allowance...')
      const allowanceRes = await fetch(
        `/api/bridge/arbitrum-allowance?owner=${sender}&spender=${BRIDGE_V3_CONFIG.ARBITRUM.ADDRESS}`
      )
      const allowanceData = await allowanceRes.json()

      const currentAllowance = BigInt(allowanceData.allowance || '0')

      if (currentAllowance < BigInt(amountRaw)) {
        setStatus('approving', 'Approve USDC in MetaMask...')
        // ERC20 approve calldata
        const approveAmount = BigInt(amountRaw) * BigInt(10) // 10x for future
        const approveData = '0x095ea7b3' +
          BRIDGE_V3_CONFIG.ARBITRUM.ADDRESS.slice(2).padStart(64, '0') +
          approveAmount.toString(16).padStart(64, '0')

        const approveTxHash = await window.ethereum.request({
          method: 'eth_sendTransaction',
          params: [{
            from: sender,
            to: ARBITRUM_CONFIG.USDC_ADDRESS,
            data: approveData,
            gas: '0x' + (100_000).toString(16),
          }],
        }) as string

        // Wait for approval to be mined (poll for receipt)
        setStatus('approving', 'Waiting for approval confirmation...')
        for (let i = 0; i < 30; i++) {
          const receipt = await window.ethereum.request({
            method: 'eth_getTransactionReceipt',
            params: [approveTxHash],
          })
          if (receipt) break
          await new Promise(r => setTimeout(r, 1000))
        }
      }

      // 5. Execute bridge on Arbitrum
      setStatus('bridging', 'Confirm bridge in MetaMask...')

      // Encode bridgeTokens calldata
      // bridgeTokens(string,uint256,address,uint32)
      // Function selector for bridgeTokens: we'll encode manually
      const { ethers } = await import('ethers')
      const iface = new ethers.utils.Interface([
        'function bridgeTokens(string symbol, uint256 amount, address receiver, uint32 targetChainId)',
      ])
      const bridgeCalldata = iface.encodeFunctionData('bridgeTokens', [
        'USDC',
        amountRaw,
        receiverEvmAddress,
        LAYER_ZERO_CONFIG.HEDERA_MAINNET_EID,
      ])

      // Add 20% buffer to LZ fee
      const feeWithBuffer = BigInt(nativeFeeWei) * BigInt(120) / BigInt(100)

      const txHash = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [{
          from: sender,
          to: BRIDGE_V3_CONFIG.ARBITRUM.ADDRESS,
          data: bridgeCalldata,
          value: '0x' + feeWithBuffer.toString(16),
          gas: '0x' + (200_000).toString(16),
        }],
      })

      setState(prev => ({ ...prev, transactionId: txHash as string }))

      // 6. Track via LayerZero Scan API
      await trackArbToHedera(txHash as string)
    } catch (error: any) {
      console.error('[Bridge] Arb->Hedera error:', error)
      const msg = error.message || 'Bridge failed'
      if (msg.includes('rejected') || msg.includes('denied')) {
        setError('Transaction rejected by user')
      } else {
        setError(msg)
      }
    }
  }, [connectionMode, session, setStatus, setError, trackArbToHedera])

  /**
   * Bridge USDT0 from Hedera to Arbitrum via OFT
   */
  const bridgeUsdt0ToArbitrum = useCallback(async (
    amount: string,
    receiverAddress: string,
    requestGasDrop: boolean = false
  ) => {
    if (!account || !isConnected) {
      setError('Wallet not connected')
      return
    }

    setState(prev => ({
      ...prev,
      direction: 'hedera_to_arbitrum',
      status: 'quoting',
      statusMessage: 'Getting USDT0 LayerZero quote...',
      error: null,
      transactionId: null,
    }))

    try {
      // 1. Fetch OFT quote
      const quote = await fetchUsdt0Quote(amount, receiverAddress, 'hedera_to_arbitrum', requestGasDrop)
      if (!quote.success) {
        setError(quote.error || 'Failed to get USDT0 quote')
        return
      }

      const lzFeeHbar = Number(quote.nativeFee) / 1e18 // weibar to HBAR

      // 2. Get initial Arbitrum USDT0 balance for tracking
      let initialBalance = '0'
      try {
        const balRes = await fetch(`/api/bridge/arbitrum-balance?address=${receiverAddress}&token=usdt0`)
        const balData = await balRes.json()
        if (balData.success) {
          initialBalance = balData.usdt0Balance || '0'
        }
      } catch {
        // Continue with 0
      }

      // 3. Sign and execute via KMS
      setStatus('approving', 'Approving USDT0 for bridge...')
      const bridgeResult = await signBridgeUsdt0(amount, receiverAddress, requestGasDrop, lzFeeHbar)
      const transactionId = bridgeResult.transactionId

      setState(prev => ({ ...prev, transactionId }))

      // 4. Track delivery (same LZ tracking)
      await trackBridge(transactionId, receiverAddress, initialBalance)
    } catch (error: any) {
      console.error('[USDT0 Bridge] Error:', error)
      const msg = error.message || 'USDT0 bridge failed'
      if (msg.includes('INSUFFICIENT_PAYER_BALANCE')) {
        setError('Insufficient HBAR to pay bridge fees.')
      } else {
        setError(msg)
      }
    }
  }, [account, isConnected, signBridgeUsdt0, setStatus, setError, trackBridge])

  /**
   * Bridge USDT0 from Arbitrum to Hedera via OFT (KMS custodial)
   */
  const bridgeUsdt0ToHedera = useCallback(async (
    amount: string,
    hederaReceiverAccountId: string
  ) => {
    if (connectionMode !== 'custodial') {
      setError('USDT0 reverse bridge requires custodial account')
      return
    }

    try {
      setState(prev => ({
        ...prev,
        direction: 'arbitrum_to_hedera',
        status: 'bridging',
        statusMessage: 'Signing USDT0 bridge via KMS...',
        error: null,
        transactionId: null,
      }))

      const token = session?.access_token
      if (!token) throw new Error('Not authenticated')

      const res = await fetch('/api/kms/sign-bridge-usdt0-reverse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amount }),
      })

      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error || 'USDT0 bridge reverse failed')
      }

      setState(prev => ({ ...prev, transactionId: data.txHash }))

      // Track via LayerZero
      await trackArbToHedera(data.txHash)
    } catch (err: any) {
      console.error('[USDT0 Bridge] Arb->Hedera error:', err)
      setError(err.message || 'USDT0 bridge failed')
    }
  }, [connectionMode, session, setStatus, setError, trackArbToHedera])

  return {
    ...state,
    isExecuting: state.status !== 'idle' && state.status !== 'success' && state.status !== 'error',
    bridgeToArbitrum,
    bridgeToHedera,
    bridgeUsdt0ToArbitrum,
    bridgeUsdt0ToHedera,
    reset,
  }
}

// Type augmentation for window.ethereum
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
      isMetaMask?: boolean
    }
  }
}
