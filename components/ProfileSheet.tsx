'use client'

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import {
  Copy, LogOut, Check,
  Shield, RotateCcw, AlertTriangle, CheckCircle2, XCircle,
  User,
} from 'lucide-react'
import Image from 'next/image'
import { useState, useEffect } from 'react'
import { useConnectionContext } from '@/contexts/ConnectionContext'

interface ProfileSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  accountId: string
}

export function ProfileSheet({
  open,
  onOpenChange,
  accountId,
}: ProfileSheetProps) {
  const { disconnect, session, custodialAccountId, custodialEvmAddress } = useConnectionContext()
  const [isCopied, setIsCopied] = useState(false)

  // Key rotation state
  const [isRotating, setIsRotating] = useState(false)
  const [rotationWarning, setRotationWarning] = useState<{ eth: string; usdc: string } | null>(null)
  const [showRotateConfirm, setShowRotateConfirm] = useState(false)
  const [rotationSuccess, setRotationSuccess] = useState<string | null>(null)
  const [rotationError, setRotationError] = useState<string | null>(null)

  const handleRotateKey = async () => {
    if (!session?.access_token) return
    setIsRotating(true)
    setRotationWarning(null)
    setRotationSuccess(null)
    setRotationError(null)

    try {
      const res = await fetch('/api/kms/rotate-key', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      })
      const data = await res.json()

      if (data.warning) {
        setRotationWarning(data.balances)
        setShowRotateConfirm(false)
      } else if (data.success) {
        setRotationSuccess(data.newEvmAddress)
        setShowRotateConfirm(false)
      } else {
        const errorMsg = data.error || data.details || 'Rotation failed'
        setShowRotateConfirm(false)
        setRotationError(errorMsg)
      }
    } catch (err) {
      console.error('Key rotation failed:', err)
      setShowRotateConfirm(false)
      setRotationError(err instanceof Error ? err.message : 'Rotation failed')
    } finally {
      setIsRotating(false)
    }
  }

  const handleDisconnect = async () => {
    try {
      await disconnect()
      onOpenChange(false)
    } catch (error) {
      console.error('Error disconnecting:', error)
    }
  }

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(accountId)
      setIsCopied(true)
    } catch (error) {
      console.error('Error copying to clipboard:', error)
    }
  }

  useEffect(() => {
    if (isCopied) {
      const timer = setTimeout(() => setIsCopied(false), 1000)
      return () => clearTimeout(timer)
    }
  }, [isCopied])

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className='w-full sm:max-w-md border-l border-white/10 bg-[#0a0a0a] p-0 overflow-hidden flex flex-col'>
          {/* Background Effects */}
          <div className='absolute inset-0 pointer-events-none overflow-hidden'>
            <div className='absolute top-[-20%] right-[-20%] w-[400px] h-[400px] bg-blue-600/20 rounded-full blur-[100px]' />
            <div className='absolute bottom-[-20%] left-[-20%] w-[300px] h-[300px] bg-blue-600/10 rounded-full blur-[80px]' />
          </div>

          {/* Header */}
          <div className='relative z-10 p-6 pb-4 border-b border-white/5 backdrop-blur-xl bg-black/20'>
            {/* Profile Card */}
            <div className='relative group overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-4 transition-all'>
              <div className='absolute inset-0 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 opacity-0 transition-opacity duration-500' />

              <div className='relative flex items-center gap-4'>
                <div className='relative'>
                  <div className='w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-cyan-600 p-[2px]'>
                    <div className='w-full h-full rounded-full bg-black flex items-center justify-center overflow-hidden'>
                      <div className='w-full h-full bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center'>
                        <span className='text-lg font-bold text-white'>
                          <User className='w-5 h-5 text-blue-500' />
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className='absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-4 border-[#0a0a0a] flex items-center justify-center'>
                    <div className='w-1.5 h-1.5 bg-white rounded-full animate-pulse' />
                  </div>
                </div>

                <div className='flex-1 min-w-0'>
                  <p className='text-xs text-neutral-400 font-medium mb-0.5'>Connected Account</p>
                  <p className='text-sm font-mono text-white font-semibold truncate'>
                    {accountId}
                  </p>
                  {custodialEvmAddress && (
                    <p className='text-[11px] font-mono text-white truncate mt-0.5'>
                      {custodialEvmAddress.slice(0, 10)}...{custodialEvmAddress.slice(-8)}
                    </p>
                  )}
                </div>
              </div>

              <div className='relative mt-4 flex gap-2'>
                <Button
                  onClick={handleCopyAddress}
                  variant='ghost'
                  size='sm'
                  className={`flex-1 h-8 text-xs font-medium transition-all duration-300 ${isCopied
                      ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                      : 'bg-white/5 text-neutral-300 hover:bg-white/10 hover:text-white'
                    }`}
                >
                  {isCopied ? (
                    <>
                      <Check className='w-3 h-3 mr-2' />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className='w-3 h-3 mr-2' />
                      Copy ID
                    </>
                  )}
                </Button>

                <Button
                  onClick={handleDisconnect}
                  variant='ghost'
                  size='sm'
                  className='flex-1 h-8 text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300'
                >
                  <LogOut className='w-3 h-3 mr-2' />
                  Disconnect
                </Button>
              </div>
            </div>
          </div>

          {/* Scrollable Content */}
          <div className='relative z-10 flex-1 overflow-y-auto p-6 pt-2 space-y-6'>
            {/* ─── Security Section ─── */}
            <div className='space-y-4'>
              <div className='flex items-center justify-between'>
                <h3 className='text-sm font-bold text-white flex items-center gap-2'>
                  <Shield className='w-4 h-4 text-amber-400' />
                  Security
                </h3>
              </div>

              {/* Key Rotation Card */}
              <div className='relative overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-b from-amber-950/30 to-black/40 p-1'>
                <div className='absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-transparent' />

                <div className='relative bg-[#0a0a0a]/80 backdrop-blur-sm rounded-xl p-4 space-y-4'>
                  <div className='flex items-start gap-4'>
                    <div className='relative group'>
                      <div className='absolute inset-0 bg-amber-500 blur-lg opacity-20 group-hover:opacity-40 transition-opacity' />
                      <div className='relative w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/80 to-orange-600/80 flex items-center justify-center shadow-xl'>
                        <RotateCcw className='w-5 h-5 text-white' />
                      </div>
                    </div>

                    <div className='flex-1'>
                      <h4 className='text-base font-bold text-white mb-1'>
                        Key Rotation
                      </h4>
                      <p className='text-xs text-neutral-400 leading-relaxed'>
                        Generate a new signing key. Your <span className='text-amber-300 font-medium'>Hedera ID stays the same</span>, but your EVM address will change.
                      </p>
                    </div>
                  </div>

                  {/* Current addresses */}
                  {(custodialAccountId || custodialEvmAddress) && (
                    <>
                      <div className='h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent' />
                      <div className='space-y-2'>
                        {custodialAccountId && (
                          <div className='flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2'>
                            <span className='text-[11px] text-neutral-500'>Hedera</span>
                            <span className='text-[11px] font-mono text-neutral-300'>{custodialAccountId}</span>
                          </div>
                        )}
                        {custodialEvmAddress && (
                          <div className='flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2'>
                            <span className='text-[11px] text-neutral-500'>EVM</span>
                            <span className='text-[11px] font-mono text-neutral-300 truncate ml-3'>
                              {custodialEvmAddress.slice(0, 8)}...{custodialEvmAddress.slice(-6)}
                            </span>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  <button
                    onClick={() => setShowRotateConfirm(true)}
                    disabled={isRotating}
                    className='w-full flex items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm font-semibold text-amber-300 transition-all hover:bg-amber-500/20 hover:border-amber-500/40 hover:shadow-[0_0_20px_rgba(245,158,11,0.08)] disabled:opacity-50 disabled:cursor-not-allowed'
                  >
                    <RotateCcw className={`w-4 h-4 ${isRotating ? 'animate-spin' : ''}`} />
                    {isRotating ? 'Rotating...' : 'Rotate Signing Key'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ─── Key Rotation Modals (inside SheetContent for correct z-index stacking) ─── */}

          {/* Confirm Modal */}
          {showRotateConfirm && (
            <div className='fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md'>
              <div className='mx-4 w-full max-w-md rounded-3xl bg-neutral-900 p-6 sm:p-8 animate-in fade-in zoom-in-95 duration-200'>
                <div className='flex items-start gap-4'>
                  <div className='flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10'>
                    <RotateCcw className='h-5 w-5 text-amber-400' />
                  </div>
                  <div>
                    <h3 className='text-lg font-bold text-white tracking-tight'>Rotate Signing Key</h3>
                    <p className='mt-1 text-sm text-neutral-400 leading-relaxed'>
                      A new cryptographic key will be created in AWS KMS and your Hedera account will be updated.
                    </p>
                  </div>
                </div>

                <div className='mt-5 space-y-2'>
                  <div className='flex items-center gap-3 rounded-2xl bg-neutral-800/60 px-4 py-3'>
                    <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-500/10'>
                      <CheckCircle2 className='h-4 w-4 text-green-400' />
                    </div>
                    <div>
                      <p className='text-sm font-medium text-white'>Hedera Account ID</p>
                      <p className='text-xs text-neutral-500'>Stays the same</p>
                    </div>
                  </div>
                  <div className='flex items-center gap-3 rounded-2xl bg-neutral-800/60 px-4 py-3'>
                    <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/10'>
                      <RotateCcw className='h-4 w-4 text-amber-400' />
                    </div>
                    <div>
                      <p className='text-sm font-medium text-white'>EVM Address</p>
                      <p className='text-xs text-neutral-500'>Will change (derived from new key)</p>
                    </div>
                  </div>
                </div>

                <div className='mt-4 flex items-center gap-2 rounded-xl bg-amber-500/8 px-3.5 py-2.5'>
                  <AlertTriangle className='h-4 w-4 shrink-0 text-amber-400' />
                  <p className='text-xs text-neutral-400'>
                    Ensure you have <span className='text-white font-medium'>no funds on Arbitrum</span> before rotating.
                  </p>
                </div>

                <div className='mt-6 flex gap-3'>
                  <button
                    onClick={() => setShowRotateConfirm(false)}
                    className='flex-1 rounded-full bg-neutral-800 px-4 py-2.5 text-sm font-medium text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-white'
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRotateKey}
                    disabled={isRotating}
                    className='flex-1 rounded-full bg-neutral-100 px-4 py-2.5 text-sm font-semibold text-neutral-900 transition-colors hover:bg-neutral-300 disabled:opacity-50 disabled:cursor-wait'
                  >
                    {isRotating ? 'Rotating...' : 'Confirm Rotation'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Warning Modal - Arbitrum funds detected */}
          {rotationWarning && (
            <div className='fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md'>
              <div className='mx-4 w-full max-w-md rounded-3xl bg-neutral-900 p-6 sm:p-8 animate-in fade-in zoom-in-95 duration-200'>
                <div className='flex items-start gap-4'>
                  <div className='flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10'>
                    <AlertTriangle className='h-5 w-5 text-amber-400' />
                  </div>
                  <div>
                    <h3 className='text-lg font-bold text-white tracking-tight'>Rotation Blocked</h3>
                    <p className='mt-1 text-sm text-neutral-400 leading-relaxed'>
                      Active balances on Arbitrum would become inaccessible. Bridge them to Hedera first.
                    </p>
                  </div>
                </div>

                <div className='mt-5 rounded-2xl bg-neutral-800/60 divide-y divide-white/5'>
                  {parseFloat(rotationWarning.eth) > 0 && (
                    <div className='flex items-center justify-between px-4 py-3.5'>
                      <div className='flex items-center gap-3'>
                        <Image src='/EthLogo.png' alt='ETH' width={32} height={32} className='rounded-full' />
                        <div>
                          <p className='text-sm font-medium text-white'>ETH</p>
                          <p className='text-xs text-neutral-500'>Ethereum</p>
                        </div>
                      </div>
                      <p className='text-sm font-medium text-white font-mono tabular-nums'>{rotationWarning.eth}</p>
                    </div>
                  )}
                  {parseFloat(rotationWarning.usdc) > 0 && (
                    <div className='flex items-center justify-between px-4 py-3.5'>
                      <div className='flex items-center gap-3'>
                        <Image src='https://dwk1opv266jxs.cloudfront.net/icons/tokens/0.0.456858.png' alt='USDC' width={32} height={32} className='rounded-full' />
                        <div>
                          <p className='text-sm font-medium text-white'>USDC</p>
                          <p className='text-xs text-neutral-500'>USD Coin</p>
                        </div>
                      </div>
                      <p className='text-sm font-medium text-white font-mono tabular-nums'>{rotationWarning.usdc}</p>
                    </div>
                  )}
                </div>

                <div className='mt-4 flex items-center gap-2 rounded-xl bg-blue-500/8 px-3.5 py-2.5'>
                  <Image src='/arbitrum-logo.png' alt='Arbitrum' width={16} height={16} className='rounded-full' />
                  <p className='text-xs text-neutral-400'>
                    Funds detected on <span className='text-white font-medium'>Arbitrum One</span>
                  </p>
                </div>

                <button
                  onClick={() => setRotationWarning(null)}
                  className='mt-5 w-full rounded-full bg-neutral-100 px-4 py-2.5 text-sm font-semibold text-neutral-900 transition-colors hover:bg-neutral-300'
                >
                  Understood
                </button>
              </div>
            </div>
          )}

          {/* Success Modal */}
          {rotationSuccess && (
            <div className='fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md'>
              <div className='mx-4 w-full max-w-md rounded-3xl bg-neutral-900 p-6 sm:p-8 animate-in fade-in zoom-in-95 duration-200'>
                <div className='flex items-start gap-4'>
                  <div className='flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-green-500/10'>
                    <CheckCircle2 className='h-5 w-5 text-green-400' />
                  </div>
                  <div>
                    <h3 className='text-lg font-bold text-white tracking-tight'>Key Rotated Successfully</h3>
                    <p className='mt-1 text-sm text-neutral-400 leading-relaxed'>
                      Your signing key has been rotated. Your Hedera account remains the same.
                    </p>
                  </div>
                </div>
                <div className='mt-5 rounded-2xl bg-neutral-800/60 px-4 py-3.5'>
                  <p className='text-xs text-neutral-500'>New EVM Address</p>
                  <p className='mt-1 font-mono text-sm text-white break-all'>{rotationSuccess}</p>
                </div>
                <button
                  onClick={() => setRotationSuccess(null)}
                  className='mt-5 w-full rounded-full bg-neutral-100 px-4 py-2.5 text-sm font-semibold text-neutral-900 transition-colors hover:bg-neutral-300'
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {/* Error Modal */}
          {rotationError && (
            <div className='fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md'>
              <div className='mx-4 w-full max-w-md rounded-3xl bg-neutral-900 p-6 sm:p-8 animate-in fade-in zoom-in-95 duration-200'>
                <div className='flex items-start gap-4'>
                  <div className='flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-500/10'>
                    <XCircle className='h-5 w-5 text-red-400' />
                  </div>
                  <div>
                    <h3 className='text-lg font-bold text-white tracking-tight'>Rotation Failed</h3>
                    <p className='mt-1 text-sm text-neutral-400 leading-relaxed'>
                      {rotationError.includes('INSUFFICIENT_PAYER_BALANCE')
                        ? 'Your Hedera account does not have enough HBAR to pay the transaction fee.'
                        : 'Something went wrong while rotating your key.'}
                    </p>
                  </div>
                </div>

                {rotationError.includes('INSUFFICIENT_PAYER_BALANCE') ? (
                  <div className='mt-5 space-y-2'>
                    <div className='flex items-center gap-3 rounded-2xl bg-neutral-800/60 px-4 py-3'>
                      <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/10'>
                        <Image src='/hedera-logo.png' alt='HBAR' width={16} height={16} className='rounded-full' />
                      </div>
                      <div>
                        <p className='text-sm font-medium text-white'>Send HBAR to your account</p>
                        <p className='text-xs text-neutral-500'>At least 1 HBAR is needed for the rotation fee</p>
                      </div>
                    </div>
                    {custodialAccountId && (
                      <div className='rounded-2xl bg-neutral-800/60 px-4 py-3'>
                        <p className='text-xs text-neutral-500'>Your Hedera Account</p>
                        <p className='mt-1 font-mono text-sm text-white'>{custodialAccountId}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className='mt-5 rounded-2xl bg-neutral-800/60 px-4 py-3'>
                    <p className='text-xs text-neutral-500'>Error details</p>
                    <p className='mt-1 text-sm text-neutral-400 break-all'>{rotationError}</p>
                  </div>
                )}

                <button
                  onClick={() => setRotationError(null)}
                  className='mt-5 w-full rounded-full bg-neutral-100 px-4 py-2.5 text-sm font-semibold text-neutral-900 transition-colors hover:bg-neutral-300'
                >
                  Got it
                </button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
