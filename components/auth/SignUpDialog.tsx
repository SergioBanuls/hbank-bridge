'use client'

/**
 * Sign Up Dialog for Custodial Auth
 *
 * Email/password registration with OAuth buttons.
 * After sign-up, the user needs to verify their email.
 */

import { useState } from 'react'
import Image from 'next/image'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { ArrowLeft, Loader2, Mail, Eye, EyeOff, CheckCircle2 } from 'lucide-react'
import { useConnectionContext } from '@/contexts/ConnectionContext'

interface SignUpDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onBack?: () => void
}

export function SignUpDialog({ open, onOpenChange, onBack }: SignUpDialogProps) {
  const { signUpCustodial, signInWithOAuth, loading } = useConnectionContext()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      await signUpCustodial(email, password)
      setSuccess(true)
    } catch (err: any) {
      setError(err.message || 'Sign up failed')
    } finally {
      setSubmitting(false)
    }
  }

  const handleOAuth = async (provider: 'google') => {
    setError(null)
    try {
      await signInWithOAuth(provider)
    } catch (err: any) {
      setError(err.message || 'OAuth sign up failed')
    }
  }

  // Success state - email verification message
  if (success) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className='auth-modal-wrapper p-0 max-w-[400px] rounded-2xl border-0 overflow-hidden gap-0'>
          {/* Animated gradient accent bar - green for success */}
          <div className='h-[3px] w-full' style={{
            background: 'linear-gradient(90deg, #10b981, #34d399, #6ee7b7, #34d399, #10b981)',
            backgroundSize: '300% 100%',
            animation: 'auth-gradient-shift 6s ease infinite',
          }} />

          <div className='px-7 pt-10 pb-10 flex flex-col items-center text-center'>
            {/* Success icon with glow */}
            <div className='relative mb-6'>
              <div className='absolute inset-0 rounded-full bg-emerald-500/20 blur-xl scale-150' />
              <div className='relative w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border border-emerald-500/20 flex items-center justify-center'>
                <CheckCircle2 className='w-8 h-8 text-emerald-400' />
              </div>
            </div>

            <h3 className='text-[20px] font-semibold text-white tracking-tight mb-2'>
              Check your email
            </h3>
            <p className='text-[13px] text-white/35 leading-relaxed max-w-[280px]'>
              {"We've sent a verification link to "}
              <span className='text-white/70 font-medium'>{email}</span>.
              {" Click the link to verify your account, then sign in."}
            </p>

            <button
              onClick={() => onOpenChange(false)}
              className='auth-btn-primary w-full h-[46px] rounded-xl text-white font-semibold text-[14px] mt-8 cursor-pointer'
            >
              Got it
            </button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='auth-modal-wrapper p-0 max-w-[400px] rounded-2xl border-0 overflow-hidden gap-0'>
        {/* Animated gradient accent bar */}
        <div className='auth-modal-gradient-bar h-[3px] w-full' />

        <div className='px-7 pt-7 pb-8'>
          {/* Header with logo */}
          <DialogHeader className='items-center mb-6 space-y-4'>
            {onBack && (
              <button
                onClick={onBack}
                className='absolute left-5 top-6 text-white/30 hover:text-white/70 transition-colors duration-200'
              >
                <ArrowLeft className='w-4 h-4' />
              </button>
            )}

            {/* Logo with glow ring */}
            <div className='relative'>
              <div className='absolute inset-0 rounded-full bg-blue-500/20 blur-xl' style={{ animation: 'auth-pulse-ring 3s ease-in-out infinite' }} />
              <div className='relative w-14 h-14 rounded-full bg-gradient-to-br from-white/10 to-white/[0.02] border border-white/10 flex items-center justify-center'>
                <Image
                  src='/hbank-icon.png'
                  alt='Hbank'
                  width={64}
                  height={64}
                  className='rounded-full'
                />
              </div>
            </div>

            <div className='space-y-1.5 text-center'>
              <DialogTitle className='text-[22px] font-semibold text-white tracking-tight'>
                Create account
              </DialogTitle>
              <DialogDescription className='text-[13px] text-white/35 font-normal'>
                Sign up to start trading on HBank
              </DialogDescription>
            </div>
          </DialogHeader>

          {/* Google OAuth */}
          <button
            type='button'
            onClick={() => handleOAuth('google')}
            disabled={loading || submitting}
            className='auth-btn-google w-full h-[46px] rounded-xl text-gray-800 font-medium text-[14px] flex items-center justify-center gap-2.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer'
          >
            <svg className='w-[18px] h-[18px]' viewBox='0 0 24 24'>
              <path d='M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z' fill='#4285F4' />
              <path d='M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z' fill='#34A853' />
              <path d='M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z' fill='#FBBC05' />
              <path d='M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z' fill='#EA4335' />
            </svg>
            Sign up with Google
          </button>

          {/* Divider */}
          <div className='flex items-center gap-4 my-5'>
            <div className='h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent' />
            <span className='text-[11px] text-white/20 uppercase tracking-[0.15em] font-medium'>or</span>
            <div className='h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent' />
          </div>

          {/* Email/password form */}
          <form onSubmit={handleSubmit} className='flex flex-col gap-3'>
            <div className='space-y-1'>
              <label className='text-[11px] text-white/30 uppercase tracking-[0.1em] font-medium pl-1'>
                Email
              </label>
              <input
                type='email'
                placeholder='you@example.com'
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className='auth-input w-full h-[46px] px-4 rounded-xl text-white text-[14px] outline-none'
              />
            </div>

            <div className='space-y-1'>
              <label className='text-[11px] text-white/30 uppercase tracking-[0.1em] font-medium pl-1'>
                Password
              </label>
              <div className='relative'>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder='Min 6 characters'
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className='auth-input w-full h-[46px] px-4 pr-11 rounded-xl text-white text-[14px] outline-none'
                />
                <button
                  type='button'
                  onClick={() => setShowPassword(!showPassword)}
                  className='absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/50 transition-colors'
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className='w-4 h-4' /> : <Eye className='w-4 h-4' />}
                </button>
              </div>
            </div>

            {error && (
              <div className='flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20'>
                <div className='w-1.5 h-1.5 rounded-full bg-red-400 shrink-0' />
                <p className='text-[13px] text-red-400/90'>{error}</p>
              </div>
            )}

            <button
              type='submit'
              disabled={submitting || loading}
              className='auth-btn-primary w-full h-[46px] rounded-full text-white font-semibold text-[14px] flex items-center justify-center gap-2 mt-1 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer'
            >
              {submitting ? (
                <>
                  <Loader2 className='w-4 h-4 animate-spin' />
                  <span>Creating account...</span>
                </>
              ) : (
                <>
                  <Mail className='w-4 h-4' />
                  <span>Sign up with Email</span>
                </>
              )}
            </button>
          </form>

          {/* Switch to sign in */}
          <p className='text-center text-[13px] text-white/30 mt-5'>
            Already have an account?{' '}
            <button
              onClick={onBack}
              className='text-blue-400/80 hover:text-blue-400 font-medium transition-colors duration-200'
            >
              Sign in
            </button>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
