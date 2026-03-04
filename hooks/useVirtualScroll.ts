/**
 * useVirtualScroll Hook
 *
 * Implements efficient virtual scrolling without external dependencies.
 * Only renders items that are visible in the viewport + buffer.
 */

import { useState, useEffect, useRef, useMemo } from 'react'

interface UseVirtualScrollOptions {
    itemCount: number
    itemHeight: number
    containerHeight: number
    overscan?: number // Number of items to render above/below viewport
}

interface VirtualScrollResult {
    virtualItems: Array<{ index: number; start: number }>
    totalHeight: number
    containerRef: React.RefObject<HTMLDivElement | null>
}

export function useVirtualScroll({
    itemCount,
    itemHeight,
    containerHeight,
    overscan = 5,
}: UseVirtualScrollOptions): VirtualScrollResult {
    const [scrollTop, setScrollTop] = useState(0)
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        const handleScroll = () => {
            setScrollTop(container.scrollTop)
        }

        container.addEventListener('scroll', handleScroll, { passive: true })
        return () => container.removeEventListener('scroll', handleScroll)
    }, [])

    const virtualItems = useMemo(() => {
        const startIndex = Math.max(
            0,
            Math.floor(scrollTop / itemHeight) - overscan
        )
        const endIndex = Math.min(
            itemCount - 1,
            Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
        )

        const items = []
        for (let i = startIndex; i <= endIndex; i++) {
            items.push({
                index: i,
                start: i * itemHeight,
            })
        }

        return items
    }, [scrollTop, itemCount, itemHeight, containerHeight, overscan])

    const totalHeight = itemCount * itemHeight

    return {
        virtualItems,
        totalHeight,
        containerRef,
    }
}
