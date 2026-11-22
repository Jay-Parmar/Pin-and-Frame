import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { api, messageFor } from './api'
import type { Session } from './api'
import { ArchivePage } from './ArchivePage'
import { ImportsPage } from './ImportsPage'
import { useQueryParams } from './navigation'
import { TripsPage } from './TripsPage'

function Brand() {
  return (
    <span className="brand">
      <span className="brand-icon" aria-hidden="true"><span /></span>
      <span>Pin &amp; Frame</span>
    </span>
  )
}

function SignIn({ onSignIn }: { onSignIn: (session: Session) => void }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    setError('')
    setBusy(true)
    try {
      await api('session/login/', {
        method: 'POST',
        body: { username: fields.get('username'), password: fields.get('password') },
      })
      onSignIn(await api<Session>('session/'))
    } catch (error) {
      setError(messageFor(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-shell">
      <div className="auth-art" aria-hidden="true" />
      <div className="auth-card">
        <Brand />
        <h1>Sign in</h1>
        <form className="form-stack" onSubmit={signIn}>
          <label>Username<input autoComplete="username" name="username" required /></label>
          <label>Password<input autoComplete="current-password" name="password" type="password" required /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="button primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
      </div>
    </main>
  )
}

export function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loadError, setLoadError] = useState('')
  const [signOutError, setSignOutError] = useState('')
  const { params, change } = useQueryParams()
  const requestedView = params.get('view')
  const view = requestedView === 'trips' || requestedView === 'imports' ? requestedView : 'archive'

  useEffect(() => {
    const request = new AbortController()
    api<Session>('session/', { signal: request.signal }).then(setSession).catch((error) => {
      if (!request.signal.aborted) setLoadError(messageFor(error))
    })
    return () => request.abort()
  }, [])

  async function signOut() {
    setSignOutError('')
    try {
      await api('session/logout/', { method: 'POST' })
      setSession(await api<Session>('session/'))
    } catch (error) {
      setSignOutError(messageFor(error))
    }
  }

  if (loadError) {
    return (
      <main className="auth-shell">
        <div className="auth-card">
          <Brand />
          <h1>Unable to connect</h1>
          <p className="error" role="alert">{loadError}</p>
          <button className="button" onClick={() => window.location.reload()}>Retry</button>
        </div>
      </main>
    )
  }
  if (!session) return <main className="auth-shell"><p role="status">Opening Pin &amp; Frame…</p></main>
  if (!session.authenticated) return <SignIn onSignIn={setSession} />

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand-link" href="?view=archive"><Brand /></a>
        <nav className="site-nav" aria-label="Main navigation">
          <a href="?view=archive" aria-current={view === 'archive' ? 'page' : undefined}>Archive</a>
          <a href="?view=trips" aria-current={view === 'trips' ? 'page' : undefined}>Trips</a>
          <a href="?view=imports" aria-current={view === 'imports' ? 'page' : undefined}>Imports</a>
        </nav>
        <button className="button quiet" onClick={signOut}>Sign out</button>
      </header>
      <main className="page">
        {signOutError && <p className="error" role="alert">{signOutError}</p>}
        {view === 'trips' && <TripsPage params={params} change={change} />}
        {view === 'imports' && <ImportsPage params={params} change={change} />}
        {view === 'archive' && <ArchivePage params={params} change={change} />}
      </main>
    </div>
  )
}
