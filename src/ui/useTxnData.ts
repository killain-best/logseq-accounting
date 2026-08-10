import { useCallback, useEffect, useRef, useState } from 'react'
import { sdk } from '../logseq/sdk'
import { queryAllTxns, type Txn } from '../logseq/query'
import { errorMessage } from '../logseq/errors'

export interface TxnDataState {
  txns: Txn[]
  loading: boolean
  refreshing: boolean
  error: string
  refresh: () => void
}

/** 串行化报表查询：运行中的变更只标记 dirty，完成后尾随再查一次。 */
export function useTxnData(): TxnDataState {
  const [txns, setTxns] = useState<Txn[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const mounted = useRef(false)
  const running = useRef(false)
  const dirty = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const run = useCallback(async () => {
    if (running.current) {
      dirty.current = true
      return
    }
    running.current = true
    if (mounted.current) setRefreshing(true)
    try {
      const next = await queryAllTxns()
      if (mounted.current) {
        setTxns(next)
        setError('')
      }
    } catch (cause) {
      console.error('[logseq-accounting] query failed', cause)
      if (mounted.current) setError(`数据查询失败：${errorMessage(cause)}`)
    } finally {
      if (mounted.current) {
        setLoading(false)
        setRefreshing(false)
      }
      running.current = false
      if (dirty.current && mounted.current) {
        dirty.current = false
        void run()
      }
    }
  }, [])

  const refresh = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void run(), 400)
  }, [run])

  useEffect(() => {
    mounted.current = true
    void run()
    const off = sdk.DB.onChanged?.(refresh)
    return () => {
      mounted.current = false
      dirty.current = false
      if (timer.current) clearTimeout(timer.current)
      if (typeof off === 'function') off()
    }
  }, [refresh, run])

  return { txns, loading, refreshing, error, refresh }
}
