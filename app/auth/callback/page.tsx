'use client'

import { useEffect } from 'react'
import { supabaseAuth } from '@/lib/supabase'
import { Loader2 } from 'lucide-react'

const SESSION_KEY = 'custodial_session'

export default function AuthCallbackPage() {
  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Parse tokens from the URL hash fragment
        const hash = window.location.hash.substring(1)
        const params = new URLSearchParams(hash)
        const accessToken = params.get('access_token')
        const refreshToken = params.get('refresh_token')

        if (!accessToken || !refreshToken) {
          console.error('[OAuth Callback] No tokens found in URL hash')
          window.location.href = '/'
          return
        }

        // Establish the session in Supabase with the tokens
        const { data, error } = await supabaseAuth.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })

        if (error || !data.session) {
          console.error('[OAuth Callback] setSession failed:', error?.message)
          window.location.href = '/'
          return
        }

        const session = data.session

        // Persist to localStorage for ConnectionContext
        localStorage.setItem(SESSION_KEY, JSON.stringify({
          user: {
            id: session.user.id,
            email: session.user.email || '',
          },
          session: {
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            expires_at: session.expires_at || 0,
          },
        }))

        // Auto-create Hedera account if needed
        const accountRes = await fetch('/api/kms/account-info', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        const accountData = await accountRes.json()

        if (!accountData.success || !accountData.account) {
          const createRes = await fetch('/api/kms/create-account', {
            method: 'POST',
            headers: { Authorization: `Bearer ${session.access_token}` },
          })
          const createData = await createRes.json()
          if (createData.success && createData.hederaAccountId) {
            // Flag for SessionActionButtons to show the fund dialog
            localStorage.setItem('pending_fund_account', createData.hederaAccountId)
          }
        }

        window.location.href = '/'
      } catch (err) {
        console.error('[OAuth Callback] Error:', err)
        window.location.href = '/'
      }
    }

    handleCallback()
  }, [])

  return (
    <div className='flex flex-col items-center justify-center min-h-screen bg-neutral-950 text-white gap-4'>
      <Loader2 className='w-8 h-8 animate-spin text-blue-500' />
      <p className='text-neutral-400'>Signing you in...</p>
    </div>
  )
}
