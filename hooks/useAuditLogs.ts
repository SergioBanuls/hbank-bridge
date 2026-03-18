'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { KMSSigningAudit, KMSTransactionType } from '@/types/kms'

export interface AuditFilters {
  type: KMSTransactionType | ''
  status: 'success' | 'failed' | 'pending' | ''
  dateFrom: string
  dateTo: string
}

interface AuditPagination {
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

const PAGE_SIZE = 20

export function useAuditLogs(accessToken: string | undefined) {
  const [logs, setLogs] = useState<KMSSigningAudit[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pagination, setPagination] = useState<AuditPagination>({
    total: 0, limit: PAGE_SIZE, offset: 0, hasMore: false,
  })
  const [filters, setFilters] = useState<AuditFilters>({
    type: '', status: '', dateFrom: '', dateTo: '',
  })
  const hasFetchedRef = useRef(false)

  const fetchLogs = useCallback(async (offset = 0, append = false) => {
    if (!accessToken) return
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      })
      if (filters.type) params.set('type', filters.type)
      if (filters.status) params.set('status', filters.status)
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom)
      if (filters.dateTo) params.set('dateTo', filters.dateTo)

      const res = await fetch(`/api/audit-logs?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      if (!res.ok) throw new Error('Failed to fetch audit logs')

      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Unknown error')

      setLogs(prev => append ? [...prev, ...data.logs] : data.logs)
      setPagination(data.pagination)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error fetching logs')
    } finally {
      setLoading(false)
    }
  }, [accessToken, filters])

  const loadMore = useCallback(() => {
    if (pagination.hasMore && !loading) {
      fetchLogs(pagination.offset + pagination.limit, true)
    }
  }, [fetchLogs, pagination, loading])

  const applyFilters = useCallback((newFilters: AuditFilters) => {
    setFilters(newFilters)
  }, [])

  const resetFilters = useCallback(() => {
    setFilters({ type: '', status: '', dateFrom: '', dateTo: '' })
  }, [])

  // Fetch on mount and when filters change
  useEffect(() => {
    if (!accessToken) return
    hasFetchedRef.current = true
    fetchLogs(0, false)
  }, [fetchLogs, accessToken])

  return {
    logs,
    loading,
    error,
    pagination,
    filters,
    applyFilters,
    resetFilters,
    loadMore,
    refresh: () => fetchLogs(0, false),
  }
}
