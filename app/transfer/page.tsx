'use client'

import { useState, useRef, useMemo } from 'react'
import { useConnectionContext } from '@/contexts/ConnectionContext'
import { useCustodialConnection } from '@/hooks/useCustodialConnection'
import { useTokenBalances } from '@/hooks/useTokenBalances'
import { useEVMBalances } from '@/hooks/useEVMBalances'
import { useTokens } from '@/hooks/useTokens'
import { formatAmount, truncateBalance } from '@/utils/amountValidation'
import { Token } from '@/types/token'
import Image from 'next/image'
import { ArrowUpRight, CheckCircle2, ExternalLink, AlertCircle, Send, Copy, Check, ChevronDown } from 'lucide-react'

type NetworkTab = 'hedera' | 'arbitrum'

export default function TransferPage() {
  const { isConnected, connectionMode, account, custodialEvmAddress, session } = useConnectionContext()
  const { signTransfer } = useCustodialConnection()
  const { balances, loading: balancesLoading } = useTokenBalances(account || null)
  const { eth: evmEth, usdc: evmUsdc, usdt0: evmUsdt0, ethPriceUsd, isLoading: evmLoading } = useEVMBalances(custodialEvmAddress)
  const { data: allTokens } = useTokens()

  const [network, setNetwork] = useState<NetworkTab>('hedera')
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [selectedToken, setSelectedToken] = useState<Token | null>(null)
  const [showTokenPicker, setShowTokenPicker] = useState(false)
  const [tokenSearch, setTokenSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ transactionId: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const isHbar = selectedToken?.address === ''
  const isArbitrum = network === 'arbitrum'

  // Arbitrum virtual tokens for the picker
  const arbTokens = useMemo<Token[]>(() => [
    { symbol: 'ETH', name: 'Ethereum', address: 'arb:eth', decimals: 18, icon: '/EthLogo.png' } as Token,
    { symbol: 'USDC', name: 'USD Coin', address: 'arb:usdc', decimals: 6, icon: 'https://dwk1opv266jxs.cloudfront.net/icons/tokens/0.0.456858.png' } as Token,
    { symbol: 'USD₮0', name: 'Tether (OFT)', address: 'arb:usdt0', decimals: 6, icon: 'https://assets.coingecko.com/coins/images/325/small/Tether.png' } as Token,
  ], [])

  // All tokens (including HBAR) with balance > 0
  const tokensWithBalance = useMemo(() => {
    if (isArbitrum) {
      const list: Token[] = []
      if (parseFloat(evmEth) > 0) list.push(arbTokens[0])
      if (parseFloat(evmUsdc) > 0) list.push(arbTokens[1])
      if (parseFloat(evmUsdt0) > 0) list.push(arbTokens[2])
      // Show all if no balance yet (still loading)
      if (list.length === 0 && evmLoading) return arbTokens
      return list.length > 0 ? list : arbTokens
    }
    if (!allTokens) return []
    return allTokens.filter(token => {
      const key = token.address === '' ? 'HBAR' : token.address
      const raw = balances[key]
      return raw && BigInt(raw) > BigInt(0)
    })
  }, [allTokens, balances, isArbitrum, evmEth, evmUsdc, evmUsdt0, evmLoading, arbTokens])

  const filteredTokens = useMemo(() => {
    if (!tokenSearch) return tokensWithBalance
    const q = tokenSearch.toLowerCase()
    return tokensWithBalance.filter(t =>
      t.symbol.toLowerCase().includes(q) ||
      t.name.toLowerCase().includes(q) ||
      t.address.includes(q)
    )
  }, [tokensWithBalance, tokenSearch])

  // Balance for selected token (network-aware)
  const formattedBalance = useMemo(() => {
    if (!selectedToken) return null
    if (isArbitrum) {
      if (selectedToken.address === 'arb:eth') return truncateBalance(parseFloat(evmEth), 6)
      if (selectedToken.address === 'arb:usdc') return truncateBalance(parseFloat(evmUsdc))
      if (selectedToken.address === 'arb:usdt0') return truncateBalance(parseFloat(evmUsdt0))
      return null
    }
    const balanceKey = isHbar ? 'HBAR' : selectedToken.address
    const rawBalance = balances[balanceKey]
    return rawBalance ? formatAmount(rawBalance, selectedToken.decimals) : null
  }, [selectedToken, isArbitrum, evmEth, evmUsdc, evmUsdt0, isHbar, balances])

  const rawBalance = selectedToken && !isArbitrum
    ? balances[isHbar ? 'HBAR' : selectedToken.address]
    : undefined

  const handleMaxClick = () => {
    if (!selectedToken) return
    if (isArbitrum) {
      if (selectedToken.address === 'arb:eth') {
        const bal = parseFloat(evmEth)
        const reserve = 0.0005 // ETH gas reserve
        setAmount(truncateBalance(Math.max(bal - reserve, 0), 6))
      } else if (selectedToken.address === 'arb:usdc') {
        setAmount(truncateBalance(parseFloat(evmUsdc)))
      } else if (selectedToken.address === 'arb:usdt0') {
        setAmount(truncateBalance(parseFloat(evmUsdt0)))
      }
      return
    }
    if (!rawBalance) return
    let maxRaw = rawBalance
    if (isHbar) {
      const bal = BigInt(rawBalance)
      const reserve = BigInt('100000000') // 1 HBAR gas reserve
      maxRaw = bal > reserve ? (bal - reserve).toString() : '0'
    }
    setAmount(formatAmount(maxRaw, selectedToken.decimals))
  }

  const handleSelectToken = (token: Token) => {
    setSelectedToken(token)
    setShowTokenPicker(false)
    setTokenSearch('')
    setAmount('')
  }

  const handleNetworkSwitch = (tab: NetworkTab) => {
    if (tab === network) return
    setNetwork(tab)
    setSelectedToken(null)
    setAmount('')
    setRecipient('')
    setError(null)
  }

  const hederaNetwork = process.env.NEXT_PUBLIC_HEDERA_NETWORK || 'mainnet'
  const hashscanBase = hederaNetwork === 'mainnet'
    ? 'https://hashscan.io/mainnet/transaction'
    : 'https://hashscan.io/testnet/transaction'

  const displayAddress = isArbitrum ? custodialEvmAddress : account
  const handleCopyAccount = () => {
    if (displayAddress) {
      navigator.clipboard.writeText(displayAddress)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setResult(null)
    setLoading(true)

    try {
      if (!selectedToken) throw new Error('Select a token')

      if (isArbitrum) {
        // EVM transfer via KMS
        if (!/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
          throw new Error('Invalid Ethereum address (0x...)')
        }

        const token = selectedToken.address === 'arb:eth' ? 'eth' : selectedToken.address === 'arb:usdt0' ? 'usdt0' : 'usdc'
        const res = await fetch('/api/kms/sign-transfer-evm', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ to: recipient, amount, token }),
        })

        const data = await res.json()
        if (!data.success) throw new Error(data.error || 'EVM transfer failed')

        setResult({ transactionId: data.txHash })
        return
      }

      const dec = selectedToken.decimals
      const raw = Math.floor(parseFloat(amount) * 10 ** dec)
      if (isNaN(raw) || raw <= 0) {
        throw new Error(`Invalid ${selectedToken.symbol} amount`)
      }
      const rawAmount = raw.toString()

      const data = await signTransfer(
        recipient,
        rawAmount,
        isHbar ? undefined : selectedToken.address,
        isHbar ? undefined : selectedToken.decimals
      )

      setResult({ transactionId: data.transactionId })
    } catch (err: any) {
      setError(err.message || 'Transfer failed')
    } finally {
      setLoading(false)
    }
  }

  const handleNewTransfer = () => {
    setResult(null)
    setError(null)
    setRecipient('')
    setAmount('')
    setSelectedToken(null)
  }

  if (!isConnected || connectionMode !== 'custodial') {
    return (
      <main className='min-h-screen bg-neutral-950 flex items-center justify-center p-4'>
        <div className='relative max-w-md w-full'>
          <div className='absolute -inset-[1px] rounded-[28px] bg-gradient-to-br from-white/[0.08] to-transparent' />
          <div className='relative bg-neutral-900/80 backdrop-blur-xl rounded-[28px] p-10 text-center'>
            <div className='w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mx-auto mb-6'>
              <Send className='w-7 h-7 text-white/30' />
            </div>
            <h1 className='text-xl font-medium text-white/90 mb-3 tracking-tight'>Transfer</h1>
            <p className='text-white/40 text-sm leading-relaxed'>
              {!isConnected
                ? 'Connect with a custodial account to send assets.'
                : 'Transfers are only available for custodial accounts.'}
            </p>
          </div>
        </div>
      </main>
    )
  }

  // Success state
  if (result) {
    return (
      <main className='min-h-screen bg-neutral-950 flex items-center justify-center p-4'>
        <div className='relative max-w-md w-full'>
          {/* Animated glow */}
          <div className='absolute -inset-[1px] rounded-[28px] bg-gradient-to-br from-blue-500/20 via-transparent to-blue-500/10 animate-[pulse_3s_ease-in-out_infinite]' />
          <div className='relative bg-neutral-900/80 backdrop-blur-xl rounded-[28px] p-10'>
            {/* Success icon */}
            <div className='flex justify-center mb-8'>
              <div className='relative'>
                <div className='absolute inset-0 rounded-full bg-blue-500/20 blur-xl animate-[pulse_2s_ease-in-out_infinite]' />
                <div className='relative w-20 h-20 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center'>
                  <CheckCircle2 className='w-10 h-10 text-white' />
                </div>
              </div>
            </div>

            <h2 className='text-center text-xl font-medium text-white/90 mb-2 tracking-tight'>
              Transfer sent
            </h2>
            <p className='text-center text-white/40 text-sm mb-8'>
              {amount} {selectedToken?.symbol || 'tokens'} to {recipient}
            </p>

            {/* Transaction link */}
            <a
              href={
                result.transactionId.startsWith('0x')
                  ? `https://arbiscan.io/tx/${result.transactionId}`
                  : `${hashscanBase}/${result.transactionId}`
              }
              target='_blank'
              rel='noopener noreferrer'
              className='group flex items-center gap-3 w-full p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-blue-500/30 hover:bg-blue-500/[0.03] transition-all duration-300'
            >
              <div className='w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0'>
                <ExternalLink className='w-4 h-4 text-blue-400' />
              </div>
              <div className='min-w-0 flex-1'>
                <p className='text-xs text-white/40 mb-0.5'>Transaction</p>
                <p className='text-sm text-white/70 font-mono truncate group-hover:text-blue-300 transition-colors'>
                  {result.transactionId}
                </p>
              </div>
              <ArrowUpRight className='w-4 h-4 text-white/20 group-hover:text-blue-400 transition-colors shrink-0' />
            </a>

            <button
              onClick={handleNewTransfer}
              className='w-full mt-6 py-3.5 rounded-2xl text-sm font-medium text-white/60 bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] hover:text-white/80 transition-all duration-300'
            >
              New transfer
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className='min-h-screen bg-neutral-950 flex items-center justify-center p-4'>
      <style jsx>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .transfer-card {
          animation: fadeSlideUp 0.5s ease-out;
        }
        .input-field {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .input-field:focus-within {
          border-color: rgba(59, 130, 246, 0.3);
          box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.05);
        }
        .send-btn {
          background: linear-gradient(135deg, #2563eb, #3b82f6, #60a5fa);
          background-size: 200% 200%;
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .send-btn:hover:not(:disabled) {
          background-position: 100% 100%;
          box-shadow: 0 8px 32px rgba(59, 130, 246, 0.3);
          transform: translateY(-1px);
        }
        .send-btn:active:not(:disabled) {
          transform: translateY(0);
        }
        .send-btn:disabled {
          background: linear-gradient(135deg, #2563eb, #3b82f6, #60a5fa);
          background-size: 300% 100%;
          animation: shimmer 2s linear infinite;
        }
      `}</style>

      <div className='relative max-w-md w-full transfer-card'>
        {/* Card border glow */}
        <div className='absolute -inset-[1px] rounded-[28px] bg-gradient-to-br from-white/[0.08] via-transparent to-blue-500/[0.05]' />

        <div className='relative bg-neutral-900/80 backdrop-blur-xl rounded-[28px] overflow-hidden'>
          {/* Header */}
          <div className='px-8 pt-8 pb-0'>
            <div className='flex items-center justify-between mb-3'>
              <h1 className='text-lg font-medium text-white/90 tracking-tight'>Send</h1>
              <div className='flex items-center gap-2'>
                <button
                  onClick={handleCopyAccount}
                  className='flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] transition-all duration-200 group'
                >
                  <span className='text-[11px] text-white/40 font-mono group-hover:text-white/60 transition-colors'>
                    {displayAddress
                      ? `${displayAddress.slice(0, 6)}...${displayAddress.slice(-4)}`
                      : '—'}
                  </span>
                  {copied ? (
                    <Check className='w-3 h-3 text-blue-400' />
                  ) : (
                    <Copy className='w-3 h-3 text-white/30 group-hover:text-white/50 transition-colors' />
                  )}
                </button>
              </div>
            </div>

            {/* Network slider */}
            {custodialEvmAddress && (
              <div className='relative flex bg-white/[0.04] rounded-2xl p-1 border border-white/[0.06]'>
                {/* Sliding indicator */}
                <div
                  className='absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-xl bg-white/[0.08] border border-white/[0.06] transition-transform duration-300 ease-out'
                  style={{ transform: network === 'arbitrum' ? 'translateX(calc(100% + 8px))' : 'translateX(0)' }}
                />
                <button
                  type='button'
                  onClick={() => handleNetworkSwitch('hedera')}
                  className='relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl transition-colors'
                >
                  <Image src='/hedera-logo.png' alt='Hedera' width={18} height={18} className='rounded-full' />
                  <span className={`text-sm font-medium transition-colors ${network === 'hedera' ? 'text-white' : 'text-white/40'}`}>
                    Hedera
                  </span>
                </button>
                <button
                  type='button'
                  onClick={() => handleNetworkSwitch('arbitrum')}
                  className='relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl transition-colors'
                >
                  <Image src='/arbitrum-logo.png' alt='Arbitrum' width={18} height={18} className='rounded-full' />
                  <span className={`text-sm font-medium transition-colors ${network === 'arbitrum' ? 'text-white' : 'text-white/40'}`}>
                    Arbitrum
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className='mx-8 mt-4 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent' />

          <form ref={formRef} onSubmit={handleSubmit} className='px-8 pt-6 pb-8'>
            <div className='space-y-4'>
              {/* Token selector */}
              <div>
                <label className='text-[11px] uppercase tracking-wider text-white/30 font-medium mb-2 block'>
                  Asset
                </label>
                <div className='relative'>
                  <button
                    type='button'
                    onClick={() => setShowTokenPicker(!showTokenPicker)}
                    className='input-field w-full rounded-2xl bg-white/[0.03] border border-white/[0.06] px-4 py-3.5 flex items-center gap-3 hover:bg-white/[0.05] transition-colors'
                  >
                    {selectedToken ? (
                      <>
                        <div className='relative w-7 h-7 rounded-full overflow-hidden bg-white/10 shrink-0'>
                          <Image
                            src={selectedToken.icon || '/NotFound.png'}
                            alt={selectedToken.symbol}
                            fill
                            className='object-cover'
                            unoptimized
                          />
                        </div>
                        <div className='flex-1 text-left min-w-0'>
                          <span className='text-sm font-medium text-white/90'>{selectedToken.symbol}</span>
                          <span className='text-xs text-white/30 ml-2 truncate'>{selectedToken.name}</span>
                        </div>
                        {formattedBalance && (
                          <span className='text-xs text-white/40 shrink-0'>
                            {truncateBalance(parseFloat(formattedBalance))}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className='text-sm text-white/20 flex-1 text-left'>Select asset</span>
                    )}
                    <ChevronDown className={`w-4 h-4 text-white/30 shrink-0 transition-transform ${showTokenPicker ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Token picker dropdown */}
                  {showTokenPicker && (
                    <div className='absolute z-50 top-full left-0 right-0 mt-2 rounded-2xl bg-neutral-800 border border-white/[0.08] overflow-hidden shadow-xl shadow-black/40'>
                      {/* Search */}
                      <div className='p-3 border-b border-white/[0.06]'>
                        <input
                          type='text'
                          placeholder='Search tokens...'
                          value={tokenSearch}
                          onChange={(e) => setTokenSearch(e.target.value)}
                          className='w-full bg-white/[0.04] rounded-xl px-3 py-2 text-sm text-white/90 placeholder-white/20 outline-none border border-white/[0.06] focus:border-blue-500/30'
                          autoFocus
                        />
                      </div>
                      {/* Token list */}
                      <div className='max-h-[240px] overflow-y-auto'>
                        {filteredTokens.length === 0 ? (
                          <div className='px-4 py-6 text-center text-sm text-white/30'>
                            {tokensWithBalance.length === 0 ? 'No tokens with balance' : 'No matches'}
                          </div>
                        ) : (
                          filteredTokens.map(token => {
                            let fmtBal = '0'
                            if (isArbitrum) {
                              if (token.address === 'arb:eth') fmtBal = truncateBalance(parseFloat(evmEth), 6)
                              else if (token.address === 'arb:usdc') fmtBal = truncateBalance(parseFloat(evmUsdc))
                            } else {
                              const key = token.address === '' ? 'HBAR' : token.address
                              const tokenBal = balances[key]
                              fmtBal = tokenBal ? formatAmount(tokenBal, token.decimals) : '0'
                            }
                            return (
                              <button
                                key={token.address || token.symbol}
                                type='button'
                                onClick={() => handleSelectToken(token)}
                                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] transition-colors ${
                                  selectedToken?.address === token.address ? 'bg-blue-500/[0.06]' : ''
                                }`}
                              >
                                <div className='relative w-8 h-8 rounded-full overflow-hidden bg-white/10 shrink-0'>
                                  <Image
                                    src={token.icon || '/NotFound.png'}
                                    alt={token.symbol}
                                    fill
                                    className='object-cover'
                                    unoptimized
                                  />
                                </div>
                                <div className='flex-1 text-left min-w-0'>
                                  <p className='text-sm font-medium text-white/90'>{token.symbol}</p>
                                  <p className='text-[11px] text-white/30 truncate'>{token.name}</p>
                                </div>
                                <div className='text-right shrink-0'>
                                  <p className='text-sm text-white/70 font-medium'>{truncateBalance(parseFloat(fmtBal))}</p>
                                  {token.address && (
                                    <p className='text-[11px] text-white/30 font-mono'>{token.address}</p>
                                  )}
                                </div>
                              </button>
                            )
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Recipient */}
              <div>
                <label className='text-[11px] uppercase tracking-wider text-white/30 font-medium mb-2 block'>
                  Recipient
                </label>
                <div className='input-field rounded-2xl bg-white/[0.03] border border-white/[0.06] overflow-hidden'>
                  <input
                    type='text'
                    placeholder={isArbitrum ? '0x...' : '0.0.12345'}
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    className='w-full bg-transparent px-4 py-3.5 text-white/90 placeholder-white/20 outline-none font-mono text-sm'
                    required
                    pattern={isArbitrum ? '0x[a-fA-F0-9]{40}' : '0\\.0\\.\\d+'}
                  />
                </div>
              </div>

              {/* Amount */}
              <div>
                <div className='flex items-center justify-between mb-2'>
                  <label className='text-[11px] uppercase tracking-wider text-white/30 font-medium'>
                    Amount
                  </label>
                  {displayAddress && selectedToken && (
                    <div className='flex items-center gap-2'>
                      {(isArbitrum ? evmLoading : balancesLoading) ? (
                        <span className='text-[11px] text-white/20'>Loading...</span>
                      ) : formattedBalance !== null ? (
                        <>
                          <span className='text-[11px] text-white/30'>
                            Bal: <span className='text-white/50 font-medium'>{truncateBalance(parseFloat(formattedBalance))}</span>
                          </span>
                          <button
                            type='button'
                            onClick={handleMaxClick}
                            className='text-[10px] font-semibold text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 py-0.5 px-2 rounded-lg transition-colors uppercase tracking-wider'
                          >
                            Max
                          </button>
                        </>
                      ) : (
                        <span className='text-[11px] text-white/20'>0.0000</span>
                      )}
                    </div>
                  )}
                </div>
                <div className='input-field rounded-2xl bg-white/[0.03] border border-white/[0.06] overflow-hidden'>
                  <div className='flex items-center'>
                    <input
                      type='number'
                      step='any'
                      min='0'
                      placeholder='0.00'
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className='w-full bg-transparent px-4 py-3.5 text-white/90 placeholder-white/20 outline-none text-lg font-light tracking-tight'
                      required
                    />
                    {selectedToken && (
                      <span className='pr-4 text-sm text-white/30 font-medium shrink-0'>
                        {selectedToken.symbol}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className='mt-4 flex items-start gap-3 p-4 rounded-2xl bg-red-500/[0.06] border border-red-500/15'>
                <AlertCircle className='w-4 h-4 text-red-400 mt-0.5 shrink-0' />
                <p className='text-red-300/80 text-sm leading-relaxed'>{error}</p>
              </div>
            )}

            {/* Submit button */}
            <button
              type='submit'
              disabled={loading}
              className='send-btn w-full mt-6 py-4 rounded-2xl font-medium text-[15px] text-white flex items-center justify-center gap-2.5 disabled:opacity-90'
            >
              {loading ? (
                <>
                  <svg className='w-4 h-4 animate-spin' viewBox='0 0 24 24' fill='none'>
                    <circle className='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='3' />
                    <path className='opacity-75' fill='currentColor' d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z' />
                  </svg>
                  Sending...
                </>
              ) : (
                <>
                  Send
                  <ArrowUpRight className='w-4 h-4' />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
