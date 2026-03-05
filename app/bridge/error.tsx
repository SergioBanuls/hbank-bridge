'use client'

import { useEffect } from 'react'

// Persist error to localStorage so we can read it after reload
function persistError(error: Error) {
  try {
    localStorage.setItem('__bridge_error_debug', JSON.stringify({
      message: error.message,
      stack: error.stack,
      time: new Date().toISOString(),
    }))
  } catch {}
}

export default function BridgeError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // Persist immediately (not in useEffect) to survive reload
  persistError(error)

  useEffect(() => {
    console.error('[Bridge Error Boundary]', error)
  }, [error])

  // Check for previously captured errors
  const prevError = typeof window !== 'undefined'
    ? localStorage.getItem('__bridge_error_debug')
    : null

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-200px)] w-full">
      <div className="max-w-md w-full px-4">
        <div className="bg-red-900/30 border border-red-500/50 rounded-2xl p-6 text-center">
          <h2 className="text-xl font-bold text-red-400 mb-2">Bridge Error</h2>
          <p className="text-sm text-neutral-300 mb-4 font-mono break-all">
            {error.message}
          </p>
          {prevError && (
            <pre className="text-xs text-left text-yellow-300 bg-black/50 p-3 rounded mb-4 overflow-auto max-h-40">
              {prevError}
            </pre>
          )}
          <button
            onClick={reset}
            className="px-4 py-2 bg-neutral-700 hover:bg-neutral-600 rounded-lg text-white text-sm"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  )
}
