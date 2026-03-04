'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Copy, Check, ExternalLink } from 'lucide-react'

interface FundAccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  accountId: string
}

export function FundAccountDialog({ open, onOpenChange, accountId }: FundAccountDialogProps) {
  const [copied, setCopied] = useState(false)

  const network = process.env.NEXT_PUBLIC_HEDERA_NETWORK || 'mainnet'
  const hashscanBase = network === 'mainnet'
    ? 'https://hashscan.io/mainnet/account'
    : 'https://hashscan.io/testnet/account'

  useEffect(() => {
    if (copied) {
      const t = setTimeout(() => setCopied(false), 2000)
      return () => clearTimeout(t)
    }
  }, [copied])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(accountId)
      setCopied(true)
    } catch {
      // fallback
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='bg-neutral-900 border-neutral-700/60 max-w-[420px] overflow-hidden p-0'>
        {/* Top accent bar */}
        <div className='h-1 w-full bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500' />

        <div className='px-6 pt-5 pb-6'>
          <DialogHeader className='items-center text-center mb-5'>
            {/* Animated icon */}
            <div className='relative mb-3'>
              <div className='w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/20 to-yellow-600/10 border border-amber-500/20 flex items-center justify-center'>
                <svg width='32' height='32' viewBox='0 0 32 32' fill='none'>
                  <circle cx='16' cy='16' r='14' stroke='url(#hbar-grad)' strokeWidth='2' />
                  <path d='M10 11v10M22 11v10M10 14.5h12M10 17.5h12' stroke='url(#hbar-grad)' strokeWidth='2' strokeLinecap='round' />
                  <defs>
                    <linearGradient id='hbar-grad' x1='4' y1='4' x2='28' y2='28'>
                      <stop stopColor='#F59E0B' />
                      <stop offset='1' stopColor='#EAB308' />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              <div className='absolute -top-1 -right-1 w-5 h-5 rounded-full bg-green-500 border-2 border-neutral-900 flex items-center justify-center'>
                <Check className='w-3 h-3 text-white' strokeWidth={3} />
              </div>
            </div>

            <DialogTitle className='text-white text-lg font-bold'>
              Account Created
            </DialogTitle>
            <DialogDescription className='text-neutral-400 text-sm leading-relaxed max-w-[320px]'>
              Your Hedera account is ready. Send at least <span className='text-amber-400 font-semibold'>1 HBAR</span> to activate it.
            </DialogDescription>
          </DialogHeader>

          {/* Account ID card */}
          <div className='rounded-xl bg-neutral-800/80 border border-neutral-700/50 p-4 mb-4'>
            <div className='text-[11px] uppercase tracking-wider text-neutral-500 font-medium mb-2'>
              Your Account ID
            </div>
            <div className='flex items-center justify-between gap-3'>
              <span className='font-mono text-base text-white font-semibold tracking-wide'>
                {accountId}
              </span>
              <button
                onClick={handleCopy}
                className={`shrink-0 p-2 rounded-lg transition-all ${
                  copied
                    ? 'bg-green-500/15 text-green-400'
                    : 'bg-neutral-700/50 text-neutral-400 hover:text-white hover:bg-neutral-700'
                }`}
              >
                {copied ? <Check className='w-4 h-4' /> : <Copy className='w-4 h-4' />}
              </button>
            </div>
          </div>

          {/* Instructions */}
          <div className='rounded-xl bg-amber-500/[0.06] border border-amber-500/15 p-4 mb-5'>
            <div className='flex gap-3'>
              <div className='shrink-0 w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center mt-0.5'>
                <span className='text-amber-400 text-sm font-bold'>!</span>
              </div>
              <div className='text-[13px] text-neutral-300 leading-relaxed'>
                <p className='mb-1.5'>
                  Transfer <span className='text-amber-400 font-semibold'>HBAR</span> from an exchange or another wallet to the account ID above.
                </p>
                <p className='text-neutral-500 text-xs'>
                  Minimum 1 HBAR required to start using bridge and transfers.
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className='flex flex-col gap-2.5'>
            <a
              href={`${hashscanBase}/${accountId}`}
              target='_blank'
              rel='noopener noreferrer'
              className='flex items-center justify-center gap-2 h-11 rounded-xl bg-neutral-800 hover:bg-neutral-750 border border-neutral-700/50 text-neutral-300 hover:text-white text-sm font-medium transition-colors'
            >
              View on HashScan
              <ExternalLink className='w-3.5 h-3.5' />
            </a>
            <Button
              onClick={() => onOpenChange(false)}
              className='h-11 rounded-xl bg-amber-500 hover:bg-amber-600 text-neutral-900 font-semibold text-sm'
            >
              I understand, let me fund it
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
