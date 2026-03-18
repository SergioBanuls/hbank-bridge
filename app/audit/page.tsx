'use client'

import { useState } from 'react'
import { useConnectionContext } from '@/contexts/ConnectionContext'
import { useAuditLogs, type AuditFilters } from '@/hooks/useAuditLogs'
import type { KMSSigningAudit, KMSTransactionType } from '@/types/kms'
import {
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  Filter,
  X,
  AlertTriangle,
} from 'lucide-react'

const TRANSACTION_TYPES: { value: string; label: string }[] = [
  { value: 'token_association', label: 'Token Association' },
  { value: 'token_approval', label: 'Token Approval' },
  { value: 'account_create', label: 'Account Create' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'bridge', label: 'Bridge' },
  { value: 'bridge_reverse', label: 'Bridge Reverse' },
  { value: 'bridge_usdt0', label: 'Bridge USDT0' },
  { value: 'bridge_usdt0_reverse', label: 'Bridge USDT0 Reverse' },
  { value: 'transfer_evm', label: 'Transfer EVM' },
  { value: 'key_rotation', label: 'Key Rotation' },
  { value: 'swap', label: 'Swap' },
] as { value: string; label: string }[]

const TYPE_COLORS: Record<string, string> = {
  token_association: 'bg-purple-500/20 text-purple-300',
  token_approval: 'bg-blue-500/20 text-blue-300',
  account_create: 'bg-emerald-500/20 text-emerald-300',
  transfer: 'bg-cyan-500/20 text-cyan-300',
  bridge: 'bg-orange-500/20 text-orange-300',
  bridge_reverse: 'bg-amber-500/20 text-amber-300',
  bridge_usdt0: 'bg-teal-500/20 text-teal-300',
  bridge_usdt0_reverse: 'bg-lime-500/20 text-lime-300',
  transfer_evm: 'bg-indigo-500/20 text-indigo-300',
  key_rotation: 'bg-rose-500/20 text-rose-300',
  swap: 'bg-sky-500/20 text-sky-300',
}

const STATUS_CONFIG = {
  success: { label: 'Success', className: 'bg-emerald-500/20 text-emerald-400', dot: 'bg-emerald-400' },
  failed: { label: 'Failed', className: 'bg-red-500/20 text-red-400', dot: 'bg-red-400' },
  pending: { label: 'Pending', className: 'bg-yellow-500/20 text-yellow-400', dot: 'bg-yellow-400' },
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded-md hover:bg-white/10 transition-colors"
      title="Copy to clipboard"
    >
      {copied ? (
        <Check className="w-3.5 h-3.5 text-emerald-400" />
      ) : (
        <Copy className="w-3.5 h-3.5 text-white/40" />
      )}
    </button>
  )
}

function TxLink({ txId, type }: { txId: string; type: KMSTransactionType }) {
  const isEvm = type === 'transfer_evm' || type === 'bridge' || type === 'bridge_usdt0'
  const baseUrl = isEvm
    ? 'https://arbiscan.io/tx/'
    : 'https://hashscan.io/mainnet/transaction/'

  return (
    <a
      href={`${baseUrl}${txId}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors"
    >
      <span className="font-mono text-xs">{txId.length > 20 ? `${txId.slice(0, 10)}...${txId.slice(-8)}` : txId}</span>
      <ExternalLink className="w-3 h-3" />
    </a>
  )
}

function AuditRow({ log }: { log: KMSSigningAudit }) {
  const [expanded, setExpanded] = useState(false)
  const statusConfig = STATUS_CONFIG[log.status]

  const formattedDate = new Date(log.created_at).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })

  const typeLabel = TRANSACTION_TYPES.find(t => t.value === log.transaction_type)?.label || log.transaction_type
  const typeColor = TYPE_COLORS[log.transaction_type] || 'bg-neutral-500/20 text-neutral-300'

  return (
    <>
      <tr
        onClick={() => setExpanded(!expanded)}
        className="border-b border-white/[0.04] hover:bg-white/[0.02] cursor-pointer transition-colors"
      >
        {/* Expand icon */}
        <td className="px-4 py-3">
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-white/40" />
          ) : (
            <ChevronRight className="w-4 h-4 text-white/40" />
          )}
        </td>

        {/* Date */}
        <td className="px-4 py-3">
          <span className="text-sm text-white/70 whitespace-nowrap">{formattedDate}</span>
        </td>

        {/* Type */}
        <td className="px-4 py-3">
          <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${typeColor}`}>
            {typeLabel}
          </span>
        </td>

        {/* Status */}
        <td className="px-4 py-3">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.className}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`} />
            {statusConfig.label}
          </span>
        </td>

        {/* Transaction ID */}
        <td className="px-4 py-3">
          {log.transaction_id ? (
            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
              <TxLink txId={log.transaction_id} type={log.transaction_type} />
              <CopyButton text={log.transaction_id} />
            </div>
          ) : (
            <span className="text-xs text-white/20">—</span>
          )}
        </td>

        {/* IP */}
        <td className="px-4 py-3 hidden lg:table-cell">
          <span className="font-mono text-xs text-white/40">{log.ip_address || '—'}</span>
        </td>
      </tr>

      {/* Expanded details */}
      {expanded && (
        <tr className="border-b border-white/[0.04] bg-white/[0.01]">
          <td colSpan={6} className="px-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 ml-8">
              {/* KMS Key ID */}
              <div>
                <p className="text-[11px] uppercase tracking-wider text-white/30 font-medium mb-1">KMS Key ID</p>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-xs text-white/60 break-all">{log.kms_key_id}</span>
                  <CopyButton text={log.kms_key_id} />
                </div>
              </div>

              {/* IP Address */}
              <div className="lg:hidden">
                <p className="text-[11px] uppercase tracking-wider text-white/30 font-medium mb-1">IP Address</p>
                <span className="font-mono text-xs text-white/60">{log.ip_address || '—'}</span>
              </div>

              {/* Error Message */}
              {log.error_message && (
                <div className="col-span-full">
                  <p className="text-[11px] uppercase tracking-wider text-red-400/60 font-medium mb-1">Error</p>
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                    <p className="text-xs text-red-300 font-mono">{log.error_message}</p>
                  </div>
                </div>
              )}

              {/* Transaction Params */}
              {log.transaction_params && Object.keys(log.transaction_params).length > 0 && (
                <div className="col-span-full">
                  <p className="text-[11px] uppercase tracking-wider text-white/30 font-medium mb-1">Transaction Parameters</p>
                  <pre className="bg-neutral-800/50 border border-white/[0.06] rounded-xl px-3 py-2 text-xs text-white/60 font-mono overflow-x-auto">
                    {JSON.stringify(log.transaction_params, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function FiltersBar({
  filters,
  onApply,
  onReset,
}: {
  filters: AuditFilters
  onApply: (f: AuditFilters) => void
  onReset: () => void
}) {
  const [local, setLocal] = useState(filters)
  const [open, setOpen] = useState(false)

  const hasActiveFilters = filters.type || filters.status || filters.dateFrom || filters.dateTo

  const handleApply = () => {
    onApply(local)
    setOpen(false)
  }

  const handleReset = () => {
    const empty: AuditFilters = { type: '', status: '', dateFrom: '', dateTo: '' }
    setLocal(empty)
    onReset()
    setOpen(false)
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
          hasActiveFilters
            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
            : 'bg-white/[0.05] text-white/60 border border-white/[0.06] hover:bg-white/[0.08]'
        }`}
      >
        <Filter className="w-4 h-4" />
        Filters
        {hasActiveFilters && (
          <span className="bg-blue-500/30 text-blue-200 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
            ON
          </span>
        )}
      </button>

      {open && (
        <div className="bg-neutral-900/90 border border-white/[0.06] rounded-2xl p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Type filter */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-white/30 font-medium mb-1.5 block">
                Transaction Type
              </label>
              <select
                value={local.type}
                onChange={e => setLocal({ ...local, type: e.target.value as KMSTransactionType | '' })}
                className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2 text-sm text-white/80 appearance-none cursor-pointer"
              >
                <option value="">All types</option>
                {TRANSACTION_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* Status filter */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-white/30 font-medium mb-1.5 block">
                Status
              </label>
              <select
                value={local.status}
                onChange={e => setLocal({ ...local, status: e.target.value as AuditFilters['status'] })}
                className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2 text-sm text-white/80 appearance-none cursor-pointer"
              >
                <option value="">All statuses</option>
                <option value="success">Success</option>
                <option value="failed">Failed</option>
                <option value="pending">Pending</option>
              </select>
            </div>

            {/* Date from */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-white/30 font-medium mb-1.5 block">
                From
              </label>
              <input
                type="date"
                value={local.dateFrom}
                onChange={e => setLocal({ ...local, dateFrom: e.target.value })}
                className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2 text-sm text-white/80"
              />
            </div>

            {/* Date to */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-white/30 font-medium mb-1.5 block">
                To
              </label>
              <input
                type="date"
                value={local.dateTo}
                onChange={e => setLocal({ ...local, dateTo: e.target.value })}
                className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2 text-sm text-white/80"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleApply}
              className="px-4 py-2 bg-blue-500/20 text-blue-300 rounded-xl text-sm font-medium hover:bg-blue-500/30 transition-colors"
            >
              Apply Filters
            </button>
            {hasActiveFilters && (
              <button
                onClick={handleReset}
                className="px-4 py-2 text-white/40 hover:text-white/60 text-sm transition-colors inline-flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" />
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function AuditPage() {
  const { isConnected, session } = useConnectionContext()
  const {
    logs,
    loading,
    error,
    pagination,
    filters,
    applyFilters,
    resetFilters,
    loadMore,
    refresh,
  } = useAuditLogs(session?.access_token)

  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="relative max-w-md w-full">
          <div className="absolute -inset-[1px] rounded-[28px] bg-gradient-to-br from-white/[0.08] to-transparent" />
          <div className="relative bg-neutral-900/80 rounded-[28px] p-8 text-center">
            <ShieldCheck className="w-12 h-12 text-white/20 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Audit Log</h2>
            <p className="text-sm text-white/50">Sign in to view your KMS signing audit trail.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen pt-28 pb-12 px-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 rounded-2xl">
              <ShieldCheck className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Audit Log</h1>
              <p className="text-sm text-white/40">
                KMS signing operations &middot; {pagination.total} total records
              </p>
            </div>
          </div>

          <button
            onClick={refresh}
            disabled={loading}
            className="p-2.5 rounded-xl bg-white/[0.05] border border-white/[0.06] hover:bg-white/[0.08] transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 text-white/60 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Filters */}
        <FiltersBar filters={filters} onApply={applyFilters} onReset={resetFilters} />

        {/* Table */}
        <div className="relative">
          <div className="absolute -inset-[1px] rounded-[28px] bg-gradient-to-br from-white/[0.08] to-transparent" />
          <div className="relative bg-neutral-900/80 rounded-[28px] overflow-hidden">
            {error && (
              <div className="flex items-center gap-2 px-6 py-3 bg-red-500/10 border-b border-red-500/20">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="px-4 py-3 w-10" />
                    <th className="px-4 py-3 text-left text-[11px] uppercase tracking-wider text-white/30 font-medium">Date</th>
                    <th className="px-4 py-3 text-left text-[11px] uppercase tracking-wider text-white/30 font-medium">Type</th>
                    <th className="px-4 py-3 text-left text-[11px] uppercase tracking-wider text-white/30 font-medium">Status</th>
                    <th className="px-4 py-3 text-left text-[11px] uppercase tracking-wider text-white/30 font-medium">Transaction ID</th>
                    <th className="px-4 py-3 text-left text-[11px] uppercase tracking-wider text-white/30 font-medium hidden lg:table-cell">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && logs.length === 0 ? (
                    // Skeleton loading
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b border-white/[0.04]">
                        <td className="px-4 py-3"><div className="w-4 h-4 bg-white/[0.05] rounded animate-pulse" /></td>
                        <td className="px-4 py-3"><div className="w-32 h-4 bg-white/[0.05] rounded animate-pulse" /></td>
                        <td className="px-4 py-3"><div className="w-24 h-6 bg-white/[0.05] rounded-full animate-pulse" /></td>
                        <td className="px-4 py-3"><div className="w-20 h-6 bg-white/[0.05] rounded-full animate-pulse" /></td>
                        <td className="px-4 py-3"><div className="w-40 h-4 bg-white/[0.05] rounded animate-pulse" /></td>
                        <td className="px-4 py-3 hidden lg:table-cell"><div className="w-24 h-4 bg-white/[0.05] rounded animate-pulse" /></td>
                      </tr>
                    ))
                  ) : logs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-16 text-center">
                        <ShieldCheck className="w-10 h-10 text-white/10 mx-auto mb-3" />
                        <p className="text-sm text-white/30">No signing operations found</p>
                        <p className="text-xs text-white/20 mt-1">Operations will appear here after your first KMS-signed transaction.</p>
                      </td>
                    </tr>
                  ) : (
                    logs.map(log => <AuditRow key={log.id} log={log} />)
                  )}
                </tbody>
              </table>
            </div>

            {/* Load more */}
            {pagination.hasMore && (
              <div className="px-6 py-4 border-t border-white/[0.04] text-center">
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="px-6 py-2 bg-white/[0.05] hover:bg-white/[0.08] text-sm text-white/60 rounded-xl transition-colors disabled:opacity-50"
                >
                  {loading ? 'Loading...' : `Load more (${pagination.total - logs.length} remaining)`}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
