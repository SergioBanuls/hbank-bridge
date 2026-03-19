'use client'

import { useEffect, useState } from 'react'
import {
  CheckCircle2,
  Loader2,
  XCircle,
  Clock,
  ShieldCheck,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react'
import Image from 'next/image'
import type { BridgeStatus, BridgeDirection } from '@/lib/bridge/bridgeConstants'

interface BridgeStatusTrackerProps {
  status: BridgeStatus
  direction: BridgeDirection
  statusMessage: string
  transactionId: string | null
  hederaTxHash: string | null
  error: string | null
}

// ── Inline Network Icons ──

function HederaIcon() {
  return (
    <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center bg-black">
      <Image src="/hbar.png" alt="Hedera" width={28} height={28} />
    </div>
  )
}

function LayerZeroIcon() {
  return (
    <div className="w-8 h-8 flex items-center justify-center">
      <Image src="/LZ.png" alt="LayerZero" width={28} height={28} />
    </div>
  )
}

function ArbitrumIcon() {
  return (
    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#213147] overflow-hidden">
      <Image src="/arbitrum-logo.png" alt="Arbitrum" width={22} height={22} />
    </div>
  )
}

// ── Step Status Logic ──

interface ThreeStepState {
  source: StepStatus
  layerzero: StepStatus
  destination: StepStatus
  connectorA: 'completed' | 'active' | 'pending'
  connectorB: 'completed' | 'active' | 'pending'
}

type StepStatus = 'completed' | 'active' | 'pending' | 'error'

function getThreeStepState(currentStatus: BridgeStatus): ThreeStepState {
  if (currentStatus === 'error') {
    return {
      source: 'error',
      layerzero: 'pending',
      destination: 'pending',
      connectorA: 'pending',
      connectorB: 'pending',
    }
  }
  if (currentStatus === 'success') {
    return {
      source: 'completed',
      layerzero: 'completed',
      destination: 'completed',
      connectorA: 'completed',
      connectorB: 'completed',
    }
  }
  if (['quoting', 'checking_balance', 'approving', 'bridging'].includes(currentStatus)) {
    return {
      source: 'active',
      layerzero: 'pending',
      destination: 'pending',
      connectorA: 'pending',
      connectorB: 'pending',
    }
  }
  if (currentStatus === 'waiting_lz') {
    return {
      source: 'completed',
      layerzero: 'active',
      destination: 'pending',
      connectorA: 'active',
      connectorB: 'pending',
    }
  }
  if (currentStatus === 'confirming') {
    return {
      source: 'completed',
      layerzero: 'completed',
      destination: 'active',
      connectorA: 'completed',
      connectorB: 'active',
    }
  }
  return {
    source: 'pending',
    layerzero: 'pending',
    destination: 'pending',
    connectorA: 'pending',
    connectorB: 'pending',
  }
}

// ── Sub-components ──

function StepNode({
  status,
  icon,
  label,
}: {
  status: StepStatus
  icon: React.ReactNode
  label: string
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`relative w-14 h-14 rounded-2xl border-2 flex items-center justify-center transition-colors ${
          status === 'completed'
            ? 'border-emerald-500/50 bg-emerald-500/10'
            : status === 'active'
              ? 'border-cyan-500/50 bg-cyan-500/10'
              : status === 'error'
                ? 'border-red-500/50 bg-red-500/10'
                : 'border-white/10 bg-neutral-800'
        }`}
      >
        {/* Pulse ring on active */}
        {status === 'active' && (
          <div className="absolute inset-0 rounded-2xl border-2 border-cyan-400/30 animate-ping" />
        )}

        <div className={status === 'pending' ? 'opacity-30 grayscale' : ''}>
          {icon}
        </div>

        {/* Status badge */}
        <div
          className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center ${
            status === 'completed'
              ? 'bg-emerald-500'
              : status === 'active'
                ? 'bg-cyan-500'
                : status === 'error'
                  ? 'bg-red-500'
                  : 'bg-neutral-700 border border-white/10'
          }`}
        >
          {status === 'completed' && <CheckCircle2 className="w-3 h-3 text-white" />}
          {status === 'active' && <Loader2 className="w-3 h-3 text-white animate-spin" />}
          {status === 'error' && <XCircle className="w-3 h-3 text-white" />}
        </div>
      </div>

      <span
        className={`text-xs font-medium ${
          status === 'completed'
            ? 'text-emerald-400'
            : status === 'active'
              ? 'text-cyan-400'
              : status === 'error'
                ? 'text-red-400'
                : 'text-white/40'
        }`}
      >
        {label}
      </span>
    </div>
  )
}

function ProgressConnector({ status }: { status: 'completed' | 'active' | 'pending' }) {
  return (
    <div className="w-16 h-1 bg-white/10 rounded-full relative overflow-hidden self-center mb-5">
      {status === 'completed' && (
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full" />
      )}
      {status === 'active' && (
        <>
          <div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full" />
          <div className="absolute top-[-2px] w-2 h-2 rounded-full bg-cyan-400 shadow-lg shadow-cyan-400/50 animate-[slideProgress_1.5s_ease-in-out_infinite]" />
        </>
      )}
    </div>
  )
}

// ── Main Component ──

export function BridgeStatusTracker({
  status,
  direction,
  statusMessage,
  transactionId,
  hederaTxHash,
  error,
}: BridgeStatusTrackerProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [isClosing, setIsClosing] = useState(false)

  const isActive = status !== 'idle' && status !== 'checking_balance'

  useEffect(() => {
    if (isActive) {
      setIsVisible(true)
      setIsClosing(false)
    }
  }, [isActive])

  if (!isVisible) return null

  const stepState = getThreeStepState(status)

  const sourceLabel = direction === 'hedera_to_arbitrum' ? 'Hedera' : 'Arbitrum'
  const destLabel = direction === 'hedera_to_arbitrum' ? 'Arbitrum' : 'Hedera'
  const sourceIcon = direction === 'hedera_to_arbitrum' ? <HederaIcon /> : <ArbitrumIcon />
  const destIcon = direction === 'hedera_to_arbitrum' ? <ArbitrumIcon /> : <HederaIcon />

  const isTerminal = status === 'success' || status === 'error'
  const isTimeout = error?.toLowerCase().includes('timeout')

  // Gradient accent color
  const accentGradient =
    status === 'error'
      ? 'from-transparent via-red-500/50 to-transparent'
      : status === 'success'
        ? 'from-transparent via-emerald-500/50 to-transparent'
        : 'from-transparent via-cyan-500/50 to-transparent'

  const handleClose = () => {
    if (!isTerminal) return
    setIsClosing(true)
    setTimeout(() => setIsVisible(false), 200)
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${
          isClosing ? 'animate-[backdropOut_200ms_ease-in_forwards]' : 'animate-[backdropIn_300ms_ease-out_forwards]'
        }`}
        onClick={isTerminal ? handleClose : undefined}
      >
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

        {/* Modal */}
        <div
          className={`relative w-full max-w-sm ${
            isClosing ? 'animate-[modalOut_200ms_ease-in_forwards]' : 'animate-[modalIn_300ms_ease-out_forwards]'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-gradient-to-b from-neutral-900/95 to-neutral-950/95 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl shadow-black/50 overflow-hidden">
            {/* Gradient accent line */}
            <div className={`h-px bg-gradient-to-r ${accentGradient}`} />

            <div className="p-6">
              {/* Title */}
              <h3 className="text-lg font-bold text-white text-center mb-6">
                {status === 'success'
                  ? 'Bridge Complete'
                  : status === 'error'
                    ? 'Bridge Failed'
                    : 'Bridging in Progress'}
              </h3>

              {/* 3-step progress */}
              <div className="flex items-start justify-center">
                <StepNode status={stepState.source} icon={sourceIcon} label={sourceLabel} />
                <ProgressConnector status={stepState.connectorA} />
                <StepNode status={stepState.layerzero} icon={<LayerZeroIcon />} label="LayerZero" />
                <ProgressConnector status={stepState.connectorB} />
                <StepNode status={stepState.destination} icon={destIcon} label={destLabel} />
              </div>

              {/* Status messages */}
              <div className="mt-6 space-y-2">
                {/* Active status messages */}
                {!isTerminal && statusMessage && (
                  <div className="flex items-center gap-2 text-xs rounded-xl p-2.5 bg-cyan-500/5 border border-cyan-500/10">
                    <Clock className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                    <span className="text-cyan-300">{statusMessage}</span>
                  </div>
                )}

                {/* Safe to close hint during LZ wait */}
                {(status === 'waiting_lz' || status === 'confirming') && (
                  <div className="flex items-center gap-2 text-xs rounded-xl p-2.5 bg-emerald-500/5 border border-emerald-500/10">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                    <span className="text-emerald-300">Safe to close — delivery will continue</span>
                  </div>
                )}

                {/* Error message */}
                {status === 'error' && error && !isTimeout && (
                  <div className="flex items-center gap-2 text-xs rounded-xl p-2.5 bg-red-500/5 border border-red-500/10">
                    <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                    <span className="text-red-300">{error}</span>
                  </div>
                )}

                {/* Timeout message */}
                {isTimeout && (
                  <div className="flex items-center gap-2 text-xs rounded-xl p-2.5 bg-amber-500/5 border border-amber-500/10">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                    <span className="text-amber-300">{error}</span>
                  </div>
                )}

                {/* Success message */}
                {status === 'success' && (
                  <div className="flex items-center gap-2 text-xs rounded-xl p-2.5 bg-emerald-500/5 border border-emerald-500/10">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                    <span className="text-emerald-300">{statusMessage || 'USDC delivered successfully!'}</span>
                  </div>
                )}
              </div>

              {/* Explorer links */}
              {transactionId && (
                <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                  {direction === 'hedera_to_arbitrum' && (
                    <>
                      <a
                        href={`https://hashscan.io/mainnet/transaction/${transactionId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-white/50 hover:text-cyan-400 transition-colors"
                      >
                        HashScan <ExternalLink className="w-3 h-3" />
                      </a>
                      {hederaTxHash && (
                        <a
                          href={`https://layerzeroscan.com/tx/${hederaTxHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-white/50 hover:text-cyan-400 transition-colors"
                        >
                          LayerZero Scan <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </>
                  )}
                  {direction === 'arbitrum_to_hedera' && (
                    <>
                      <a
                        href={`https://arbiscan.io/tx/${transactionId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-white/50 hover:text-cyan-400 transition-colors"
                      >
                        Arbiscan <ExternalLink className="w-3 h-3" />
                      </a>
                      <a
                        href={`https://layerzeroscan.com/tx/${transactionId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-white/50 hover:text-cyan-400 transition-colors"
                      >
                        LayerZero Scan <ExternalLink className="w-3 h-3" />
                      </a>
                    </>
                  )}
                </div>
              )}

              {/* Close button for terminal states */}
              {isTerminal && (
                <button
                  onClick={handleClose}
                  className="w-full mt-5 rounded-full font-semibold text-sm py-2.5 px-6 bg-white/10 hover:bg-white/15 text-white transition-colors"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Custom keyframe animations */}
      <style jsx global>{`
        @keyframes slideProgress {
          0% { left: 0; }
          50% { left: calc(100% - 8px); }
          100% { left: 0; }
        }
        @keyframes modalIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        @keyframes modalOut {
          from {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
          to {
            opacity: 0;
            transform: scale(0.95) translateY(10px);
          }
        }
        @keyframes backdropIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes backdropOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
      `}</style>
    </>
  )
}
