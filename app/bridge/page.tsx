'use client'

import { useEffect } from 'react'
import { BridgeCard } from '@/components/BridgeCard'

function useReloadDetector() {
  useEffect(() => {
    // Log navigation type on load
    const navType = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
    if (navType) {
      const info = `[ReloadDetector] Page loaded via: ${navType.type}, redirectCount: ${navType.redirectCount}`
      console.warn(info)
      // Persist for debugging
      const log = JSON.parse(localStorage.getItem('__reload_log') || '[]')
      log.push({ type: navType.type, time: new Date().toISOString(), redirectCount: navType.redirectCount })
      if (log.length > 20) log.splice(0, log.length - 20)
      localStorage.setItem('__reload_log', JSON.stringify(log))
    }

    // Detect beforeunload to capture reload trigger
    const onBeforeUnload = () => {
      const stack = new Error('beforeunload triggered').stack
      localStorage.setItem('__last_unload', JSON.stringify({
        stack,
        time: new Date().toISOString(),
        url: window.location.href,
      }))
    }
    window.addEventListener('beforeunload', onBeforeUnload)

    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])
}

export default function BridgePage() {
  useReloadDetector()

  return (
    <div className='flex items-center justify-center mt-36 w-full'>
      <div className='max-w-md w-full'>
        <BridgeCard />
      </div>
    </div>
  )
}
