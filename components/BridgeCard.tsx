'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { LoginDialog } from './auth/LoginDialog'
import { FundAccountDialog } from './FundAccountDialog'
import { Fuel, Info, Loader2, Wallet, Shield, Globe } from 'lucide-react'
import Image from 'next/image'
import { TokenSelector } from './TokenSelector'
import { useConnectionContext } from '@/contexts/ConnectionContext'
import { useBridge } from '@/hooks/useBridge'
import { useTokenBalances } from '@/hooks/useTokenBalances'
import { useCheckUserTokenAssociation } from '@/hooks/useCheckUserTokenAssociation'
import { useAssociateToken } from '@/hooks/useAssociateToken'
import { BridgeStatusTracker } from './BridgeStatusTracker'
import {
  BridgeDirection,
  calculateAmountAfterFee,
  BRIDGE_FEES,
  MIN_SPOT_BRIDGE_NO_GAS_USD,
  accountIdToEvmAddress,
  HEDERA_CONFIG,
} from '@/lib/bridge/bridgeConstants'
import { USDT0_HEDERA } from '@/lib/bridge/usdt0Constants'
import { formatAmount, truncateBalance } from '@/utils/amountValidation'

type BridgeToken = 'USDC' | 'USDT0'
const TOKEN_DISPLAY: Record<BridgeToken, string> = { USDC: 'USDC', USDT0: 'USD₮0' }

interface LiquidityInfo {
  availableBalance: string
  loading: boolean
}

// ── Inline SVG Icons ──

const USDC_ICON_URL = 'https://dwk1opv266jxs.cloudfront.net/icons/tokens/0.0.456858.png'
const USDT0_ICON_URL = 'https://assets.coingecko.com/coins/images/325/small/Tether.png'


function HederaNetworkBadge() {
  return (
    <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-black border border-neutral-700 flex items-center justify-center overflow-hidden">
      <Image src="/hbar.png" alt="Hedera" width={14} height={14} />
    </div>
  )
}

function ArbitrumNetworkBadge() {
  return (
    <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#213147] border border-neutral-700 flex items-center justify-center overflow-hidden">
      <Image src="/arbitrum-logo.png" alt="Arbitrum" width={14} height={14} />
    </div>
  )
}

function SwapArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 8H13M13 8L9.5 4.5M13 8L9.5 11.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ── Main Component ──

export function BridgeCard() {
  const { account, isConnected, connectionMode, custodialEvmAddress } = useConnectionContext()
  const bridge = useBridge()

  type WalletMode = 'native' | 'external'

  const [direction, setDirection] = useState<BridgeDirection>('hedera_to_arbitrum')
  const [walletMode, setWalletMode] = useState<WalletMode>('native')
  const [selectedToken, setSelectedToken] = useState<BridgeToken>('USDC')
  const [loginOpen, setLoginOpen] = useState(false)
  const [showFundDialog, setShowFundDialog] = useState(false)
  const [amount, setAmount] = useState('')
  const [receiverAddress, setReceiverAddress] = useState('')
  const [useGasDrop, setUseGasDrop] = useState(false)
  const [liquidity, setLiquidity] = useState<LiquidityInfo>({ availableBalance: '0', loading: true })
  const [lzFeeEstimate, setLzFeeEstimate] = useState<string | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)

  // Fetch user's Hedera token balances (for USDC balance display)
  const { balances: hederaBalances, loading: hederaBalancesLoading } = useTokenBalances(
    isConnected ? account : null
  )
  const USDC_DECIMALS = 6
  const rawUsdcBalance = hederaBalances[HEDERA_CONFIG.USDC_TOKEN_ID]
  const formattedUsdcBalance = rawUsdcBalance
    ? formatAmount(rawUsdcBalance, USDC_DECIMALS)
    : null
  const rawUsdt0Balance = hederaBalances[USDT0_HEDERA.TOKEN_ID]
  const formattedUsdt0Balance = rawUsdt0Balance
    ? formatAmount(rawUsdt0Balance, USDC_DECIMALS)
    : null
  const rawHbarBalance = hederaBalances['HBAR']
  const hbarBalance = rawHbarBalance ? parseInt(rawHbarBalance) / 1e8 : 0

  // USDT0 auto-association: check and associate when user selects USDT0
  const usdt0TokenId = selectedToken === 'USDT0' ? USDT0_HEDERA.TOKEN_ID : null
  const { isAssociated: isUsdt0Associated, isChecking: isCheckingAssoc, refresh: refreshAssoc } = useCheckUserTokenAssociation(
    isConnected ? account : null,
    usdt0TokenId
  )
  const { associateToken, isAssociating } = useAssociateToken()

  // Track whether we already showed the fund dialog for this token selection
  const fundDialogShownRef = useRef(false)

  // Reset the flag when user switches away from USDT0
  useEffect(() => {
    if (selectedToken !== 'USDT0') {
      fundDialogShownRef.current = false
    }
  }, [selectedToken])

  // Auto-associate USDT0 when selected and not yet associated
  // Requires HBAR balance to pay for the on-chain transaction
  useEffect(() => {
    if (selectedToken !== 'USDT0' || !isConnected || isCheckingAssoc || isUsdt0Associated || isAssociating || hederaBalancesLoading) return
    if (hbarBalance < 1) {
      if (!fundDialogShownRef.current) {
        fundDialogShownRef.current = true
        setShowFundDialog(true)
      }
      return
    }
    associateToken(USDT0_HEDERA.TOKEN_ID).then((success) => {
      if (success) refreshAssoc()
    })
  }, [selectedToken, isConnected, isCheckingAssoc, isUsdt0Associated, isAssociating, associateToken, refreshAssoc, hbarBalance, hederaBalancesLoading])

  // Active balance based on selected token
  const activeHederaBalance = selectedToken === 'USDT0' ? formattedUsdt0Balance : formattedUsdcBalance
  const tokenIcon = selectedToken === 'USDT0' ? USDT0_ICON_URL : USDC_ICON_URL

  // MetaMask connection state (Arb -> Hedera, wallet mode only)
  const [evmAccount, setEvmAccount] = useState<string | null>(null)
  const [evmBalance, setEvmBalance] = useState<{ usdc: string; usdt0: string; eth: string } | null>(null)
  const [evmConnecting, setEvmConnecting] = useState(false)
  const hasEthereum = typeof window !== 'undefined' && !!window.ethereum
  const isCustodial = connectionMode === 'custodial'

  // For custodial users in native mode: fetch Arbitrum balances using their derived EVM address
  const [custodialEvmBalance, setCustodialEvmBalance] = useState<{ usdc: string; usdt0: string; eth: string } | null>(null)
  useEffect(() => {
    if (!isCustodial || !custodialEvmAddress || direction !== 'arbitrum_to_hedera' || walletMode !== 'native') {
      setCustodialEvmBalance(null)
      return
    }
    fetch(`/api/bridge/arbitrum-balance?address=${custodialEvmAddress}`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setCustodialEvmBalance({
            usdc: truncateBalance(parseInt(data.usdcBalance || '0') / 1_000_000),
            usdt0: truncateBalance(parseInt(data.usdt0Balance || '0') / 1_000_000),
            eth: truncateBalance(parseInt(data.ethBalance || '0') / 1e18, 4),
          })
        }
      })
      .catch(() => {})
  }, [isCustodial, custodialEvmAddress, direction, walletMode])

  const connectMetaMask = useCallback(async () => {
    if (!window.ethereum) {
      window.open('https://metamask.io/download/', '_blank')
      return
    }
    setEvmConnecting(true)
    try {
      // Request accounts
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) as string[]
      const addr = accounts[0]
      if (!addr) return

      // Ensure Arbitrum network
      const chainId = await window.ethereum.request({ method: 'eth_chainId' })
      if (parseInt(chainId as string, 16) !== 42161) {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0xa4b1' }],
        })
      }

      setEvmAccount(addr)

      // Fetch balances
      const res = await fetch(`/api/bridge/arbitrum-balance?address=${addr}`)
      const data = await res.json()
      if (data.success) {
        const usdcFormatted = truncateBalance(parseInt(data.usdcBalance || '0') / 1_000_000)
        const usdt0Formatted = truncateBalance(parseInt(data.usdt0Balance || '0') / 1_000_000)
        const ethFormatted = truncateBalance(parseInt(data.ethBalance || '0') / 1e18, 4)
        setEvmBalance({ usdc: usdcFormatted, usdt0: usdt0Formatted, eth: ethFormatted })
      }
    } catch {
      // User rejected or network error
    } finally {
      setEvmConnecting(false)
    }
  }, [])

  // Listen for MetaMask account/chain changes
  useEffect(() => {
    if (!window.ethereum || !evmAccount) return

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        setEvmAccount(null)
        setEvmBalance(null)
      } else if (accounts[0] !== evmAccount) {
        setEvmAccount(accounts[0])
        // Refresh balance for new account
        fetch(`/api/bridge/arbitrum-balance?address=${accounts[0]}`)
          .then(r => r.json())
          .then(data => {
            if (data.success) {
              setEvmBalance({
                usdc: truncateBalance(parseInt(data.usdcBalance || '0') / 1_000_000),
                usdt0: truncateBalance(parseInt(data.usdt0Balance || '0') / 1_000_000),
                eth: truncateBalance(parseInt(data.ethBalance || '0') / 1e18, 4),
              })
            }
          })
          .catch(() => {})
      }
    }

    const eth = window.ethereum as any
    eth.on?.('accountsChanged', handleAccountsChanged)
    return () => { eth.removeListener?.('accountsChanged', handleAccountsChanged) }
  }, [evmAccount])

  // Fetch bridge liquidity
  const initialFetchDone = useRef(false)

  const fetchLiquidity = useCallback(async (isBackground = false) => {
    // Only show loading spinner on initial fetch, not background refreshes
    if (!isBackground) {
      setLiquidity(prev => ({ ...prev, loading: true }))
    }
    try {
      const endpoint = direction === 'hedera_to_arbitrum'
        ? '/api/bridge/available-balance'
        : '/api/bridge/available-balance-hedera'
      const res = await fetch(endpoint)
      const data = await res.json()
      if (data.success) {
        setLiquidity({ availableBalance: data.availableBalance, loading: false })
      } else {
        setLiquidity({ availableBalance: '0', loading: false })
      }
    } catch {
      if (!isBackground) {
        setLiquidity({ availableBalance: '0', loading: false })
      }
    }
  }, [direction])

  useEffect(() => {
    initialFetchDone.current = false
    fetchLiquidity()
    initialFetchDone.current = true

    const interval = setInterval(() => fetchLiquidity(true), 30000)
    return () => clearInterval(interval)
  }, [fetchLiquidity])

  // Fetch LZ fee estimate when amount changes
  useEffect(() => {
    if (!amount || parseFloat(amount) <= 0 || !isConnected) {
      setLzFeeEstimate(null)
      return
    }

    const timeout = setTimeout(async () => {
      setQuoteLoading(true)
      try {
        const receiver = direction === 'hedera_to_arbitrum'
          ? (receiverAddress || '0x0000000000000000000000000000000000000001')
          : (account ? accountIdToEvmAddress(account) : '0x0000000000000000000000000000000000000001')

        if (selectedToken === 'USDT0') {
          // USDT0 quote via OFT
          const res = await fetch('/api/bridge/quote-usdt0', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, receiver, direction, requestGasDrop: useGasDrop }),
          })
          const data = await res.json()
          if (data.success) {
            setLzFeeEstimate(data.nativeFeeFormatted)
          }
        } else if (direction === 'hedera_to_arbitrum') {
          const res = await fetch('/api/bridge/quote-v3', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, receiver, requestGasDrop: useGasDrop }),
          })
          const data = await res.json()
          if (data.success) {
            setLzFeeEstimate(`${truncateBalance(parseFloat(data.nativeFeeHbar))} HBAR`)
          }
        } else {
          const res = await fetch('/api/bridge/quote-v3-reverse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, receiver }),
          })
          const data = await res.json()
          if (data.success) {
            setLzFeeEstimate(`${truncateBalance(parseFloat(data.nativeFeeEth), 6)} ETH`)
          }
        }
      } catch {
        setLzFeeEstimate(null)
      }
      setQuoteLoading(false)
    }, 800)

    return () => clearTimeout(timeout)
  }, [amount, direction, useGasDrop, receiverAddress, account, isConnected, selectedToken])


  const toggleDirection = () => {
    setDirection(prev =>
      prev === 'hedera_to_arbitrum' ? 'arbitrum_to_hedera' : 'hedera_to_arbitrum'
    )
    setAmount('')
    setReceiverAddress('')
    setLzFeeEstimate(null)
    setUseGasDrop(false)
    setWalletMode('native')
    setEvmAccount(null)
    setEvmBalance(null)
    bridge.reset()
  }

  const switchToken = (token: BridgeToken) => {
    setSelectedToken(token)
    setAmount('')
    setLzFeeEstimate(null)
  }

  const handleBridge = async () => {
    if (!amount || parseFloat(amount) <= 0) return

    if (selectedToken === 'USDT0') {
      if (direction === 'hedera_to_arbitrum') {
        const receiver = (isCustodial && walletMode === 'native' && custodialEvmAddress) || receiverAddress
        if (!receiver || !/^0x[a-fA-F0-9]{40}$/.test(receiver)) return
        await bridge.bridgeUsdt0ToArbitrum(amount, receiver, useGasDrop)
      } else {
        if (!account) return
        const forceExternal = isCustodial && walletMode === 'external'
        await bridge.bridgeUsdt0ToHedera(amount, account, forceExternal ? { forceExternal: true } : undefined)
      }
    } else {
      if (direction === 'hedera_to_arbitrum') {
        const receiver = (isCustodial && walletMode === 'native' && custodialEvmAddress) || receiverAddress
        if (!receiver || !/^0x[a-fA-F0-9]{40}$/.test(receiver)) return
        await bridge.bridgeToArbitrum(amount, receiver, useGasDrop)
      } else {
        if (!account) return
        const forceExternal = isCustodial && walletMode === 'external'
        await bridge.bridgeToHedera(amount, account, forceExternal ? { forceExternal: true } : undefined)
      }
    }
  }

  const amountFloat = parseFloat(amount) || 0
  const { amountAfterFee, feeAmount } = calculateAmountAfterFee(amountFloat)
  // USDT0 has no bridge fee — user receives the full amount (only LZ fee)
  const effectiveAmountAfterFee = selectedToken === 'USDT0' ? amountFloat : amountAfterFee
  const isValidAmount = amountFloat >= MIN_SPOT_BRIDGE_NO_GAS_USD
  // USDT0 uses OFT (no liquidity pool), USDC uses bridge contract liquidity
  const hasEnoughLiquidity = selectedToken === 'USDT0' ? true : amountAfterFee <= parseFloat(liquidity.availableBalance)

  const isReceiverValid = direction === 'hedera_to_arbitrum'
    ? (isCustodial && walletMode === 'native' && !!custodialEvmAddress) || /^0x[a-fA-F0-9]{40}$/.test(receiverAddress)
    : !!account

  const isArbToHedera = direction === 'arbitrum_to_hedera'
  // In native mode, custodial users use KMS; in external mode, they need MetaMask
  const useNativeWallet = isCustodial && walletMode === 'native'
  const needsMetaMask = isArbToHedera && !useNativeWallet && !evmAccount
  const activeEvmBalance = useNativeWallet ? custodialEvmBalance : evmBalance
  const activeEvmTokenBalance = activeEvmBalance ? (selectedToken === 'USDT0' ? activeEvmBalance.usdt0 : activeEvmBalance.usdc) : null
  const hasEnoughEvmBalance = !isArbToHedera || !activeEvmTokenBalance || amountFloat <= parseFloat(activeEvmTokenBalance)
  const lowEthForGas = isArbToHedera && activeEvmBalance && parseFloat(activeEvmBalance.eth) < 0.0001

  // Check Hedera balance for Hedera -> Arb direction (token-aware)
  const hasInsufficientHederaBalance = direction === 'hedera_to_arbitrum'
    && activeHederaBalance !== null
    && amountFloat > 0
    && amountFloat > parseFloat(activeHederaBalance)

  const canBridge = isConnected && isValidAmount && isReceiverValid && hasEnoughLiquidity
    && hasEnoughEvmBalance && !hasInsufficientHederaBalance && !needsMetaMask && !bridge.isExecuting

  const fromNetwork = direction === 'hedera_to_arbitrum' ? 'Hedera' : 'Arbitrum'
  const toNetwork = direction === 'hedera_to_arbitrum' ? 'Arbitrum' : 'Hedera'

  return (
    <div className="bg-neutral-900 rounded-3xl p-6 min-h-[410px] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-2xl font-bold text-white">Bridge</h2>
        <div className="flex items-center gap-1.5 text-xs text-neutral-500">
          <span>Powered by</span>
          <span className="font-medium text-neutral-400">LayerZero</span>
        </div>
      </div>

      {/* Token Slide Toggle */}
      <div className="flex justify-center mb-5">
        <div className="relative flex bg-neutral-800/80 backdrop-blur-sm rounded-full p-1 border border-white/[0.04] overflow-hidden">
          {/* Sliding backdrop */}
          <div
            className="absolute top-1 bottom-1 rounded-full transition-all duration-400 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
            style={{
              left: selectedToken === 'USDC' ? '4px' : 'calc(50% + 2px)',
              right: selectedToken === 'USDC' ? 'calc(50% + 2px)' : '4px',
              background: 'linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.06) 100%)',
              boxShadow: selectedToken === 'USDC'
                ? '0 0 20px rgba(39,117,202,0.15), inset 0 1px 0 rgba(255,255,255,0.08)'
                : '0 0 20px rgba(38,161,123,0.15), inset 0 1px 0 rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          />
          {/* USDC option */}
          <button
            onClick={() => switchToken('USDC')}
            disabled={bridge.isExecuting}
            className="relative z-10 flex-1 flex items-center justify-center gap-2 px-5 py-2 rounded-full transition-all duration-300 disabled:opacity-50 group"
          >
            <div className={`relative w-6 h-6 rounded-full overflow-hidden ring-1 transition-all duration-300 ${
              selectedToken === 'USDC' ? 'ring-white/20 shadow-[0_0_8px_rgba(39,117,202,0.3)]' : 'ring-transparent opacity-50 group-hover:opacity-80'
            }`}>
              <Image src={USDC_ICON_URL} alt="USDC" width={24} height={24} className="w-full h-full object-cover" />
            </div>
            <span className={`text-sm font-semibold tracking-wide transition-all duration-300 ${
              selectedToken === 'USDC' ? 'text-white' : 'text-white/40 group-hover:text-white/60'
            }`}>
              USDC
            </span>
          </button>
          {/* USDT0 option */}
          <button
            onClick={() => switchToken('USDT0')}
            disabled={bridge.isExecuting}
            className="relative z-10 flex-1 flex items-center justify-center gap-2 px-5 py-2 rounded-full transition-all duration-300 disabled:opacity-50 group"
          >
            <div className={`relative w-6 h-6 rounded-full overflow-hidden bg-[#26A17B] ring-1 transition-all duration-300 ${
              selectedToken === 'USDT0' ? 'ring-white/20 shadow-[0_0_8px_rgba(38,161,123,0.3)]' : 'ring-transparent opacity-50 group-hover:opacity-80'
            }`}>
              <Image src={USDT0_ICON_URL} alt="USDT0" width={24} height={24} className="w-full h-full object-cover scale-110" />
            </div>
            <span className={`text-sm font-semibold tracking-wide transition-all duration-300 ${
              selectedToken === 'USDT0' ? 'text-white' : 'text-white/40 group-hover:text-white/60'
            }`}>
              USD₮0
            </span>
          </button>
        </div>
      </div>

      {/* USDT0 association status */}
      {selectedToken === 'USDT0' && isConnected && (isAssociating || isCheckingAssoc) && (
        <div className="flex items-center gap-2 text-blue-400 text-xs bg-blue-500/10 p-2.5 rounded-2xl mb-3">
          <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
          <span>{isAssociating ? 'Associating USD₮0 to your account...' : 'Checking USD₮0 association...'}</span>
        </div>
      )}

      {/* Token selectors — side by side */}
      <div className="relative flex items-center gap-0">
        <div className="flex-1 pr-4">
          <TokenSelector
            label="From"
            selectedToken={{ icon: tokenIcon, symbol: TOKEN_DISPLAY[selectedToken], name: fromNetwork } as any}
            badge={direction === 'hedera_to_arbitrum' ? <HederaNetworkBadge /> : <ArbitrumNetworkBadge />}
          />
        </div>

        <div className="absolute left-1/2 -translate-x-1/2 z-10">
          <button
            onClick={toggleDirection}
            disabled={bridge.isExecuting}
            className="bg-neutral-800 hover:bg-neutral-700 p-3 rounded-full border-2 border-neutral-900 transition-colors disabled:opacity-50 text-white"
          >
            <SwapArrowIcon />
          </button>
        </div>

        <div className="flex-1 pl-4">
          <TokenSelector
            label="To"
            selectedToken={{ icon: tokenIcon, symbol: TOKEN_DISPLAY[selectedToken], name: toNetwork } as any}
            badge={direction === 'hedera_to_arbitrum' ? <ArbitrumNetworkBadge /> : <HederaNetworkBadge />}
          />
        </div>
      </div>

      {/* Amount input — HBANK style */}
      <div className="bg-neutral-800 rounded-2xl px-4 py-3 group text-left mt-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-bold text-white/70">Amount</span>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            {[25, 50, 75, 100].map((pct) => (
              <button
                key={pct}
                onClick={() => {
                  let userMax = Infinity
                  if (isArbToHedera && activeEvmTokenBalance) {
                    userMax = parseFloat(activeEvmTokenBalance)
                  } else if (direction === 'hedera_to_arbitrum' && activeHederaBalance) {
                    userMax = parseFloat(activeHederaBalance)
                  }
                  const poolMax = selectedToken === 'USDT0' ? Infinity : (parseFloat(liquidity.availableBalance) || 0)
                  const maxAmount = Math.min(poolMax, userMax)
                  const value = truncateBalance(maxAmount * pct / 100)
                  setAmount(value)
                }}
                disabled={bridge.isExecuting || liquidity.loading}
                className="text-xs font-semibold text-white bg-gray-300/10 hover:bg-gray-300/20 py-1 px-2 rounded-lg transition-colors disabled:opacity-50"
              >
                {pct === 100 ? 'MAX' : `${pct}%`}
              </button>
            ))}
          </div>
        </div>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          min="0"
          step="0.01"
          disabled={bridge.isExecuting}
          className="w-full bg-transparent text-2xl font-semibold text-white placeholder:text-white/30 focus:outline-none disabled:opacity-50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <div className="flex items-center justify-between mt-1">
          <span className="text-white/50 text-xs">{TOKEN_DISPLAY[selectedToken]}</span>
          <div className="flex items-center gap-2 text-xs">
            {/* User's balance */}
            {isConnected && direction === 'hedera_to_arbitrum' && (
              <span className="text-white/50">
                {hederaBalancesLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin inline" />
                ) : activeHederaBalance !== null ? (
                  <>
                    Bal: <span className={`font-semibold ${hasInsufficientHederaBalance ? 'text-red-400' : 'text-white/70'}`}>
                      {truncateBalance(parseFloat(activeHederaBalance))} {TOKEN_DISPLAY[selectedToken]}
                    </span>
                  </>
                ) : (
                  'Bal: 0.00'
                )}
              </span>
            )}
            {isConnected && isArbToHedera && activeEvmTokenBalance && (
              <span className="text-white/50">
                Bal: <span className={`font-semibold ${!hasEnoughEvmBalance ? 'text-red-400' : 'text-white/70'}`}>
                  {activeEvmTokenBalance} {TOKEN_DISPLAY[selectedToken]}
                </span>
              </span>
            )}
            {selectedToken === 'USDC' && (
              <>
                {isConnected && (direction === 'hedera_to_arbitrum' || (isArbToHedera && activeEvmBalance)) && (
                  <span className="text-white/20">|</span>
                )}
                <span className="text-green-400">
                  {liquidity.loading ? (
                    <Loader2 className="w-3 h-3 animate-spin inline" />
                  ) : (
                    `${liquidity.availableBalance} available`
                  )}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Warnings */}
      {amount && !isValidAmount && (
        <div className="flex items-center gap-2 text-yellow-500 text-xs bg-yellow-500/10 p-2.5 rounded-2xl mt-3">
          <Info className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Minimum bridge amount: ${MIN_SPOT_BRIDGE_NO_GAS_USD} USDC</span>
        </div>
      )}

      {hasInsufficientHederaBalance && (
        <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 p-2.5 rounded-2xl mt-3">
          <Info className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Insufficient {TOKEN_DISPLAY[selectedToken]} balance. You have {truncateBalance(parseFloat(activeHederaBalance!))} {TOKEN_DISPLAY[selectedToken]}.</span>
        </div>
      )}

      {amountFloat > 0 && !hasEnoughLiquidity && !hasInsufficientHederaBalance && !liquidity.loading && (
        <div className="flex items-center gap-2 text-orange-500 text-xs bg-orange-500/10 p-2.5 rounded-2xl mt-3">
          <Info className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Insufficient bridge liquidity. Try a smaller amount.</span>
        </div>
      )}

      {direction === 'hedera_to_arbitrum' && isConnected && hbarBalance < 1 && !hederaBalancesLoading && (
        <div className="flex items-center gap-2 text-yellow-500 text-xs bg-yellow-500/10 p-2.5 rounded-2xl mt-3">
          <Info className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Low HBAR balance ({truncateBalance(hbarBalance)} HBAR). You need HBAR to pay bridge fees (~5-15 HBAR).</span>
        </div>
      )}

      {/* Wallet mode selector (custodial users, Arb -> Hedera) */}
      {isArbToHedera && isCustodial && (
        <div className="relative flex bg-neutral-800 rounded-2xl p-1 mt-3">
          <div
            className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-xl bg-white/[0.08] border border-white/[0.06] transition-transform duration-300 ease-out"
            style={{ transform: walletMode === 'external' ? 'translateX(calc(100% + 8px))' : 'translateX(0)' }}
          />
          <button
            type="button"
            onClick={() => { setWalletMode('native'); setEvmAccount(null); setEvmBalance(null) }}
            disabled={bridge.isExecuting}
            className="relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl transition-colors disabled:opacity-50"
          >
            <Shield className={`w-4 h-4 transition-colors ${walletMode === 'native' ? 'text-white' : 'text-white/40'}`} />
            <span className={`text-sm font-medium transition-colors ${walletMode === 'native' ? 'text-white' : 'text-white/40'}`}>
              Native Wallet
            </span>
          </button>
          <button
            type="button"
            onClick={() => setWalletMode('external')}
            disabled={bridge.isExecuting}
            className="relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl transition-colors disabled:opacity-50"
          >
            <Globe className={`w-4 h-4 transition-colors ${walletMode === 'external' ? 'text-white' : 'text-white/40'}`} />
            <span className={`text-sm font-medium transition-colors ${walletMode === 'external' ? 'text-white' : 'text-white/40'}`}>
              External Wallet
            </span>
          </button>
        </div>
      )}

      {/* Source wallet (Arb -> Hedera) */}
      {isArbToHedera && (
        <div className="bg-neutral-800 rounded-2xl px-4 py-3 mt-3">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="w-4 h-4 text-white/50" />
            <span className="text-xs font-bold text-white/70">Source Wallet (Arbitrum)</span>
          </div>
          {useNativeWallet && custodialEvmAddress ? (
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-white font-mono truncate">
                  {custodialEvmAddress.slice(0, 6)}...{custodialEvmAddress.slice(-4)}
                </span>
                <span className="text-xs text-green-400 flex-shrink-0 ml-2">
                  {custodialEvmBalance ? `${selectedToken === 'USDT0' ? custodialEvmBalance.usdt0 : custodialEvmBalance.usdc} ${TOKEN_DISPLAY[selectedToken]}` : <Loader2 className="w-3 h-3 animate-spin inline" />}
                </span>
              </div>
              <p className="text-xs text-white/30 mt-1">KMS-managed wallet</p>
            </div>
          ) : evmAccount ? (
            <div className="flex items-center justify-between">
              <span className="text-sm text-white font-mono truncate">
                {evmAccount.slice(0, 6)}...{evmAccount.slice(-4)}
              </span>
              <span className="text-xs text-green-400 flex-shrink-0 ml-2">
                {evmBalance ? `${selectedToken === 'USDT0' ? evmBalance.usdt0 : evmBalance.usdc} ${TOKEN_DISPLAY[selectedToken]}` : <Loader2 className="w-3 h-3 animate-spin inline" />}
              </span>
            </div>
          ) : !useNativeWallet ? (
            <button
              onClick={connectMetaMask}
              disabled={evmConnecting}
              className="w-full text-sm text-white/30 hover:text-white/50 transition-colors text-left flex items-center gap-2"
            >
              {evmConnecting ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin text-white/50" /> Connecting...</>
              ) : (
                hasEthereum ? 'Connect EVM wallet...' : 'Install MetaMask...'
              )}
            </button>
          ) : null}
          {activeEvmBalance && amountFloat > 0 && !hasEnoughEvmBalance && (
            <p className="text-xs text-red-400 mt-1">Insufficient {TOKEN_DISPLAY[selectedToken]} balance</p>
          )}
          {lowEthForGas && (
            <p className="text-xs text-yellow-500 mt-1">Low ETH for gas fees</p>
          )}
        </div>
      )}

      {/* Wallet mode selector (custodial users, Hedera -> Arb) */}
      {direction === 'hedera_to_arbitrum' && isCustodial && (
        <div className="relative flex bg-neutral-800 rounded-2xl p-1 mt-3">
          <div
            className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-xl bg-white/[0.08] border border-white/[0.06] transition-transform duration-300 ease-out"
            style={{ transform: walletMode === 'external' ? 'translateX(calc(100% + 8px))' : 'translateX(0)' }}
          />
          <button
            type="button"
            onClick={() => { setWalletMode('native'); if (custodialEvmAddress) setReceiverAddress(custodialEvmAddress) }}
            disabled={bridge.isExecuting}
            className="relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl transition-colors disabled:opacity-50"
          >
            <Shield className={`w-4 h-4 transition-colors ${walletMode === 'native' ? 'text-white' : 'text-white/40'}`} />
            <span className={`text-sm font-medium transition-colors ${walletMode === 'native' ? 'text-white' : 'text-white/40'}`}>
              Native Wallet
            </span>
          </button>
          <button
            type="button"
            onClick={() => { setWalletMode('external'); setReceiverAddress('') }}
            disabled={bridge.isExecuting}
            className="relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl transition-colors disabled:opacity-50"
          >
            <Globe className={`w-4 h-4 transition-colors ${walletMode === 'external' ? 'text-white' : 'text-white/40'}`} />
            <span className={`text-sm font-medium transition-colors ${walletMode === 'external' ? 'text-white' : 'text-white/40'}`}>
              External Wallet
            </span>
          </button>
        </div>
      )}

      {/* Destination address (Hedera -> Arb) */}
      {direction === 'hedera_to_arbitrum' && (
        <div className="bg-neutral-800 rounded-2xl px-4 py-3 mt-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="relative">
              <Wallet className="w-4 h-4 text-white/50" />
            </div>
            <span className="text-xs font-bold text-white/70">Destination (Arbitrum)</span>
          </div>
          {isCustodial && walletMode === 'native' && custodialEvmAddress ? (
            <div>
              <span className="text-sm text-white font-mono truncate block">
                {custodialEvmAddress.slice(0, 6)}...{custodialEvmAddress.slice(-4)}
              </span>
              <p className="text-xs text-white/30 mt-1">Your KMS-managed EVM address</p>
            </div>
          ) : (
            <>
              <input
                type="text"
                value={receiverAddress}
                onChange={(e) => setReceiverAddress(e.target.value)}
                placeholder="0x..."
                disabled={bridge.isExecuting}
                className="w-full bg-transparent text-sm text-white font-mono placeholder:text-white/30 focus:outline-none disabled:opacity-50 truncate"
              />
              {receiverAddress && !isReceiverValid && (
                <p className="text-xs text-red-400 mt-1">Invalid Ethereum address</p>
              )}
            </>
          )}
        </div>
      )}

      {/* Gas drop toggle (Hedera -> Arb only) */}
      {direction === 'hedera_to_arbitrum' && (
        <div className="rounded-2xl p-4 bg-blue-500/10 border border-blue-500/30 mt-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/20">
                <Fuel className="w-4 h-4 text-blue-500" />
              </div>
              <div>
                <div className="text-sm font-medium text-white">Gas Drop</div>
                <div className="text-xs text-white/50">Receive ~$2 ETH on Arbitrum</div>
              </div>
            </div>
            <button
              onClick={() => setUseGasDrop(!useGasDrop)}
              disabled={bridge.isExecuting}
              className={`h-6 w-11 rounded-full transition-colors relative disabled:opacity-50 ${
                useGasDrop ? 'bg-blue-500' : 'bg-neutral-700'
              }`}
            >
              <div
                className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  useGasDrop ? 'left-6' : 'left-1'
                }`}
              />
            </button>
          </div>
        </div>
      )}

      {/* Fee breakdown */}
      {amountFloat > 0 && (
        <div className="bg-neutral-800/30 rounded-2xl p-3 space-y-2 text-sm mt-3">
          {selectedToken === 'USDC' && (
            <div className="flex justify-between">
              <span className="text-white/40">Bridge fee ({BRIDGE_FEES.FEE_BASIS_POINTS / 100}%)</span>
              <span className="text-white/70">{truncateBalance(feeAmount)} USDC</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-white/40">LayerZero fee</span>
            <span className="text-white/70">
              {quoteLoading ? (
                <Loader2 className="w-3 h-3 animate-spin inline" />
              ) : lzFeeEstimate || '—'}
            </span>
          </div>
          <div className="flex justify-between border-t border-white/5 pt-2 font-medium">
            <span className="text-white/70">You Receive</span>
            <span className="text-green-400">{truncateBalance(effectiveAmountAfterFee)} {TOKEN_DISPLAY[selectedToken]}</span>
          </div>
        </div>
      )}

      {/* Spacer to push button down */}
      <div className="flex-1" />

      {/* Action button */}
      <div className="mt-4">
        {!isConnected ? (
          <>
            <button
              onClick={() => setLoginOpen(true)}
              className="w-full rounded-full font-semibold text-lg py-3 px-6 bg-neutral-100 hover:bg-neutral-300 text-neutral-900 transition-colors"
            >
              Login
            </button>
            <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
          </>
        ) : (
          <button
            onClick={handleBridge}
            disabled={!canBridge}
            className={`w-full rounded-full font-semibold text-lg py-3 px-6 transition-colors ${
              canBridge
                ? 'bg-neutral-100 hover:bg-neutral-300 text-neutral-900'
                : 'bg-neutral-500 text-neutral-900 cursor-not-allowed'
            }`}
          >
            {bridge.isExecuting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Bridging...
              </span>
            ) : hasInsufficientHederaBalance ? (
              `Insufficient ${TOKEN_DISPLAY[selectedToken]}`
            ) : !hasEnoughEvmBalance ? (
              `Insufficient ${TOKEN_DISPLAY[selectedToken]}`
            ) : (
              `Bridge ${amountFloat > 0 ? truncateBalance(amountFloat) + ' ' : ''}${TOKEN_DISPLAY[selectedToken]}`
            )}
          </button>
        )}
      </div>

      {/* Reset button after completion/error */}
      {(bridge.status === 'success' || bridge.status === 'error') && (
        <button
          onClick={() => {
            bridge.reset()
            setAmount('')
          }}
          className="w-full rounded-full font-medium text-sm py-2.5 px-6 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors mt-2"
        >
          {bridge.status === 'success' ? 'Bridge Again' : 'Try Again'}
        </button>
      )}

      {/* Status tracker modal */}
      <BridgeStatusTracker
        status={bridge.status}
        direction={bridge.direction}
        statusMessage={bridge.statusMessage}
        transactionId={bridge.transactionId}
        hederaTxHash={bridge.hederaTxHash}
        error={bridge.error}
      />

      {/* Fund account dialog — shown when HBAR is needed for token association */}
      {account && (
        <FundAccountDialog
          open={showFundDialog}
          onOpenChange={setShowFundDialog}
          accountId={account}
        />
      )}
    </div>
  )
}
