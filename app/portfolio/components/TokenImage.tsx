'use client'

import { useState } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'

const networkIcons: Record<string, string> = {
  hedera: '/hedera-logo.png',
  arbitrum: '/arbitrum-logo.png',
}

interface TokenImageProps {
  src: string | undefined | null
  alt: string
  size?: number
  priority?: boolean
  network?: string
  className?: string
}

/**
 * Optimized token image component with:
 * - Animated skeleton while loading
 * - Smooth opacity transition
 * - Fallback to NotFound.png on error
 * - Optional network badge
 */
export function TokenImage({
  src,
  alt,
  size = 40,
  priority = false,
  network,
  className,
}: TokenImageProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  const imageSrc = hasError || !src || src.trim() === '' ? '/NotFound.png' : src

  return (
    <div
      className={cn('relative shrink-0', className)}
      style={{ width: size, height: size }}
    >
      {/* Skeleton placeholder */}
      {isLoading && (
        <div
          className="absolute inset-0 rounded-full bg-white/10 animate-pulse"
          style={{ width: size, height: size }}
        />
      )}

      {/* Token image */}
      <div
        className={cn(
          'relative rounded-full overflow-hidden transition-opacity duration-300',
          isLoading ? 'opacity-0' : 'opacity-100'
        )}
        style={{ width: size, height: size }}
      >
        <Image
          src={imageSrc}
          alt={alt}
          fill
          sizes={`${size}px`}
          className="object-cover"
          priority={priority}
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setHasError(true)
            setIsLoading(false)
          }}
        />
      </div>
      
      {/* Network badge */}
      {network && networkIcons[network] && (
        <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-neutral-800 p-0.5">
          <Image
            src={networkIcons[network]}
            alt={network}
            width={16}
            height={16}
            className="rounded-full"
          />
        </div>
      )}
    </div>
  )
}
