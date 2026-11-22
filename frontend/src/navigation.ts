import { useEffect, useState } from 'react'

export type ChangeQuery = (changes: Record<string, string | null>) => void

export function useQueryParams() {
  const [params, setParams] = useState(() => new URLSearchParams(window.location.search))
  useEffect(() => {
    const sync = () => setParams(new URLSearchParams(window.location.search))
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  const change: ChangeQuery = (changes) => {
    const next = new URLSearchParams(window.location.search)
    Object.entries(changes).forEach(([key, value]) => {
      if (value === null) next.delete(key)
      else next.set(key, value)
    })
    const query = next.toString()
    if (query === new URLSearchParams(window.location.search).toString()) return
    window.history.pushState(null, '', query ? `?${query}` : window.location.pathname)
    setParams(next)
  }
  return { params, change }
}

export function pageNumber(params: URLSearchParams, key = 'page') {
  const number = Number(params.get(key))
  return Number.isSafeInteger(number) && number > 0 ? number : 1
}
