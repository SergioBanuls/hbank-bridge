'use client'

/**
 * Wrapper for ConnectionProvider
 * ConnectionContext uses localStorage only inside useEffect,
 * so it's safe to render during SSR without next/dynamic.
 */

import { ConnectionProvider } from './ConnectionContext'

export function ConnectionProviderWrapper({ children }: { children: React.ReactNode }) {
  return <ConnectionProvider>{children}</ConnectionProvider>
}
