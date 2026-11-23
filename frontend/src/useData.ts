import { useEffect, useState } from 'react'
import { api, messageFor } from './api'
import type { PageResult } from './catalog'

interface Result<T> {
  path: string
  data?: T
  error?: string
}

function fetchOne<T>(path: string, signal: AbortSignal) {
  return api<T>(path, { signal })
}

async function fetchList<T>(path: string, signal: AbortSignal) {
  const results: T[] = []
  const endpoint = path.split('?')[0]
  let next: string | null = path
  while (next) {
    const page: PageResult<T> = await api<PageResult<T>>(next, { signal })
    results.push(...page.results)
    next = page.next ? `${endpoint}${new URL(page.next, window.location.origin).search}` : null
  }
  return results
}

function useRequest<T>(path: string | null, load: (path: string, signal: AbortSignal) => Promise<T>) {
  const [result, setResult] = useState<Result<T>>()
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (!path) return
    const controller = new AbortController()
    load(path, controller.signal).then((data) => {
      if (!controller.signal.aborted) setResult({ path, data })
    }).catch((error) => {
      if (!controller.signal.aborted) setResult({ path, error: messageFor(error) })
    })
    return () => controller.abort()
  }, [path, load, revision])

  const current = path && result?.path === path ? result : undefined
  return {
    data: current?.data,
    error: current?.error,
    loading: Boolean(path && !current),
    reload: () => setRevision((value) => value + 1),
  }
}

export function useApi<T>(path: string | null) {
  return useRequest<T>(path, fetchOne)
}

export function useList<T>(path: string | null) {
  return useRequest<T[]>(path, fetchList)
}
