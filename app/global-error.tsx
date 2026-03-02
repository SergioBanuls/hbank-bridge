'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Global Error Boundary]', error)
  }, [error])

  return (
    <html>
      <body className="bg-black text-white">
        <div className="flex items-center justify-center min-h-screen">
          <div className="max-w-md w-full px-4 text-center">
            <h2 className="text-xl font-bold text-red-400 mb-2">Something went wrong</h2>
            <p className="text-sm text-neutral-300 mb-4 font-mono break-all">
              {error.message}
            </p>
            <button
              onClick={reset}
              className="px-4 py-2 bg-neutral-700 hover:bg-neutral-600 rounded-lg text-white text-sm"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
