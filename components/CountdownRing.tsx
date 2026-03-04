/**
 * Countdown Ring Component
 *
 * Displays a circular progress ring that counts down from duration to 0.
 * Shows a loading spinner when refetching.
 */

'use client'

import { useEffect, useState } from 'react'

interface CountdownRingProps {
    duration: number // Duration in milliseconds (e.g., 60000 for 60s)
    isRefetching: boolean // Whether data is currently being refetched
    onComplete: () => void // Callback when countdown completes
}

export function CountdownRing({
    duration,
    isRefetching,
    onComplete,
}: CountdownRingProps) {
    const [timeRemaining, setTimeRemaining] = useState(duration)
    const [startTime, setStartTime] = useState(Date.now())

    // Reset timer when duration changes or when refetching completes
    useEffect(() => {
        if (!isRefetching) {
            console.log(`⏱️  CountdownRing: Starting ${duration / 1000}s countdown`)
            setStartTime(Date.now())
            setTimeRemaining(duration)
        }
    }, [duration, isRefetching])

    // Countdown timer
    useEffect(() => {
        if (isRefetching) {
            return // Don't count down while refetching
        }

        const interval = setInterval(() => {
            const elapsed = Date.now() - startTime
            const remaining = Math.max(0, duration - elapsed)

            setTimeRemaining(remaining)

            if (remaining === 0) {
                clearInterval(interval)
                console.log('⏰ CountdownRing: Timer reached 0, calling onComplete()')
                onComplete()
            }
        }, 100) // Update every 100ms for smooth animation

        return () => clearInterval(interval)
    }, [startTime, duration, isRefetching, onComplete])

    // Calculate progress (0 to 1)
    const progress = 1 - timeRemaining / duration

    // SVG circle properties
    const size = 28
    const strokeWidth = 2
    const radius = (size - strokeWidth) / 2
    const circumference = 2 * Math.PI * radius
    const strokeDashoffset = circumference * (1 - progress)

    if (isRefetching) {
        return (
            <div className="animate-spin rounded-full border-b-2 border-blue-500" style={{ width: size, height: size }}></div>
        )
    }

    return (
        <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
            {/* Background circle */}
            <svg
                width={size}
                height={size}
                className="transform -rotate-90"
            >
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="rgba(255, 255, 255, 0.1)"
                    strokeWidth={strokeWidth}
                    fill="none"
                />
                {/* Progress circle */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="rgb(59, 130, 246)" // blue-500
                    strokeWidth={strokeWidth}
                    fill="none"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    className="transition-all duration-100 ease-linear"
                />
            </svg>
        </div>
    )
}

