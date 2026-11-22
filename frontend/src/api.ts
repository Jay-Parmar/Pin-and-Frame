export interface Session {
  authenticated: boolean
  username: string | null
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
}

function csrfToken() {
  return document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith('csrftoken='))
    ?.slice('csrftoken='.length)
}

function errorMessage(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(errorMessage).filter(Boolean).join(' ')
  if (value && typeof value === 'object') {
    return Object.values(value).map(errorMessage).filter(Boolean).join(' ')
  }
  return ''
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options
  const headers = new Headers({ Accept: 'application/json' })
  const token = csrfToken()
  if (method !== 'GET' && token) headers.set('X-CSRFToken', token)
  if (body !== undefined) headers.set('Content-Type', 'application/json')

  const response = await fetch(`/api/v1/${path}`, {
    method,
    credentials: 'same-origin',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  })
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => null)
    throw new Error(errorMessage(data) || `Request failed (${response.status}).`)
  }
  return (response.status === 204 ? undefined : await response.json()) as T
}

export function messageFor(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Try again.'
}
