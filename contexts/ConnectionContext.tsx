'use client'

/**
 * Unified Connection Context
 *
 * Provides a single interface for custodial (KMS) connections.
 *
 * Auth calls go through /api/auth/* endpoints to avoid CORS issues with Supabase.
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import type { ConnectionMode } from '@/types/kms'
import { supabaseAuth } from '@/lib/supabase'

interface CustodialUser {
  id: string
  email: string
}

interface CustodialSession {
  access_token: string
  refresh_token: string
  expires_at: number
}

export interface ConnectionContextType {
  isConnected: boolean
  account: string | null
  connectionMode: ConnectionMode
  loading: boolean

  // Custodial path
  connectCustodial: (email: string, password: string) => Promise<void>
  signUpCustodial: (email: string, password: string) => Promise<void>
  signInWithOAuth: (provider: 'google') => Promise<void>

  // Unified
  disconnect: () => Promise<void>

  // Custodial-specific
  user: CustodialUser | null
  session: CustodialSession | null
  custodialAccountId: string | null
  custodialEvmAddress: string | null
  hasCustodialAccount: boolean
  createCustodialAccount: () => Promise<string>
  creatingAccount: boolean
}

const ConnectionContext = createContext<ConnectionContextType | undefined>(undefined)

export function useConnectionContext() {
  const context = useContext(ConnectionContext)
  if (context === undefined) {
    throw new Error('useConnectionContext must be used within a ConnectionProvider')
  }
  return context
}

const SESSION_KEY = 'custodial_session'

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  // Custodial auth state
  const [user, setUser] = useState<CustodialUser | null>(null)
  const [session, setSession] = useState<CustodialSession | null>(null)
  const [custodialAccountId, setCustodialAccountId] = useState<string | null>(null)
  const [custodialEvmAddress, setCustodialEvmAddress] = useState<string | null>(null)
  const [custodialLoading, setCustodialLoading] = useState(false)
  const [creatingAccount, setCreatingAccount] = useState(false)

  // Determine connection mode
  const connectionMode: ConnectionMode = user ? 'custodial' : null
  const isConnected = !!user
  const account = custodialAccountId
  const loading = custodialLoading

  // --- Persist session to localStorage ---
  const persistSession = useCallback((userData: CustodialUser, sessionData: CustodialSession) => {
    setUser(userData)
    setSession(sessionData)
    localStorage.setItem(SESSION_KEY, JSON.stringify({ user: userData, session: sessionData }))
  }, [])

  const clearSession = useCallback(() => {
    setUser(null)
    setSession(null)
    setCustodialAccountId(null)
    setCustodialEvmAddress(null)
    localStorage.removeItem(SESSION_KEY)
  }, [])

  // --- Fetch custodial account from API ---
  const fetchCustodialAccount = useCallback(async (token: string) => {
    try {
      const res = await fetch('/api/kms/account-info', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success && data.account) {
        setCustodialAccountId(data.account.hederaAccountId)
        setCustodialEvmAddress(data.account.evmAddress || null)
      }
    } catch (err) {
      console.error('Failed to fetch custodial account:', err)
    }
  }, [])

  // --- Shared guard: prevents OAuth listener from double-processing when session restore handles it ---
  const oauthHandled = useRef(false)

  // --- Restore session from localStorage on mount ---
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SESSION_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed.session?.expires_at && parsed.session.expires_at * 1000 > Date.now()) {
          oauthHandled.current = true
          setCustodialLoading(true)
          setUser(parsed.user)
          setSession(parsed.session)
          fetchCustodialAccount(parsed.session.access_token).finally(() => {
            setCustodialLoading(false)
          })
        } else {
          localStorage.removeItem(SESSION_KEY)
        }
      }
    } catch {
      localStorage.removeItem(SESSION_KEY)
    }
  }, [])

  // --- Listen for OAuth auth state changes ---
  useEffect(() => {
    const { data: { subscription } } = supabaseAuth.auth.onAuthStateChange(
      async (event, supaSession) => {
        if (event === 'SIGNED_IN' && supaSession && !oauthHandled.current) {
          // Only handle if we don't already have a session (avoids duplicate with email login)
          if (user) return
          oauthHandled.current = true

          const userData: CustodialUser = {
            id: supaSession.user.id,
            email: supaSession.user.email || '',
          }
          const sessionData: CustodialSession = {
            access_token: supaSession.access_token,
            refresh_token: supaSession.refresh_token,
            expires_at: supaSession.expires_at || 0,
          }

          setCustodialLoading(true)
          persistSession(userData, sessionData)

          try {
            // Fetch existing account or auto-create one
            const res = await fetch('/api/kms/account-info', {
              headers: { Authorization: `Bearer ${supaSession.access_token}` },
            })
            const data = await res.json()

            if (data.success && data.account) {
              setCustodialAccountId(data.account.hederaAccountId)
              setCustodialEvmAddress(data.account.evmAddress || null)
            } else {
              // Auto-create Hedera account for new OAuth users
              try {
                setCreatingAccount(true)
                const createRes = await fetch('/api/kms/create-account', {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${supaSession.access_token}` },
                })
                const createData = await createRes.json()
                if (createData.success) {
                  setCustodialAccountId(createData.hederaAccountId)
                }
              } finally {
                setCreatingAccount(false)
              }
            }
          } finally {
            setCustodialLoading(false)
          }
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [user, persistSession])

  // --- Custodial email/password login ---
  const connectCustodial = useCallback(async (email: string, password: string) => {
    setCustodialLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Login failed')

      persistSession(data.user, data.session)
      await fetchCustodialAccount(data.session.access_token)
    } finally {
      setCustodialLoading(false)
    }
  }, [persistSession, fetchCustodialAccount])

  // --- Custodial signup ---
  const signUpCustodial = useCallback(async (email: string, password: string) => {
    setCustodialLoading(true)
    try {
      const signupRes = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const signupData = await signupRes.json()
      if (!signupRes.ok) throw new Error(signupData.error || 'Signup failed')

      // Auto-login after signup
      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const loginData = await loginRes.json()
      if (!loginRes.ok) throw new Error(loginData.error || 'Auto-login failed')

      persistSession(loginData.user, loginData.session)
    } finally {
      setCustodialLoading(false)
    }
  }, [persistSession])

  // --- OAuth login (redirect-based via Supabase) ---
  const signInWithOAuth = useCallback(async (provider: 'google') => {
    const { error } = await supabaseAuth.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) throw new Error(error.message)
  }, [])

  // --- Create custodial Hedera account ---
  const createCustodialAccount = useCallback(async (): Promise<string> => {
    if (!session?.access_token) throw new Error('Not authenticated')

    setCreatingAccount(true)
    try {
      const res = await fetch('/api/kms/create-account', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      const data = await res.json()
      if (!data.success) throw new Error(data.error)

      setCustodialAccountId(data.hederaAccountId)
      return data.hederaAccountId
    } finally {
      setCreatingAccount(false)
    }
  }, [session])

  // --- Disconnect ---
  const disconnect = useCallback(async () => {
    clearSession()
  }, [clearSession])

  const value: ConnectionContextType = {
    isConnected,
    account,
    connectionMode,
    loading,
    connectCustodial,
    signUpCustodial,
    signInWithOAuth,
    disconnect,
    user,
    session,
    custodialAccountId,
    custodialEvmAddress,
    hasCustodialAccount: !!custodialAccountId,
    createCustodialAccount,
    creatingAccount,
  }

  return (
    <ConnectionContext.Provider value={value}>
      {children}
    </ConnectionContext.Provider>
  )
}
