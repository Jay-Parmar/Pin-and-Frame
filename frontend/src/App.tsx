import { ArrowRight, Camera, Eye, EyeOff, LogOut, MapPin, NotebookTabs, Upload } from 'lucide-react'
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
      <span className="brand-icon" aria-hidden="true"><MapPin size={21} strokeWidth={1.8} /></span>
      <span>Pin &amp; Frame</span>
    </span>
  )
}

function SignIn({ onSignIn }: { onSignIn: (session: Session) => void }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    setError('')
    setBusy(true)
    try {
      const session = await api<Session>('session/login/', {
        method: 'POST',
        body: { username: fields.get('username'), password: fields.get('password') },
      })
      onSignIn(session)
    } catch (error) {
      setError(messageFor(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-shell auth-layout">
      <div className="auth-art" aria-hidden="true" />
      <div className="auth-card auth-panel">
        <Brand />
        <div className="auth-heading">
          <h1>Sign in</h1>
          <p className="muted">Open your private travel archive.</p>
        </div>
        <form className="form-stack" onSubmit={signIn}>
          <label>Username<input autoComplete="username" name="username" required /></label>
          <div className="password-field">
            <label>Password<input autoComplete="current-password" name="password" type={showPassword ? 'text' : 'password'} required /></label>
            <button
              className="icon-button password-toggle"
              type="button"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="button primary auth-submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}<ArrowRight size={18} aria-hidden="true" />
          </button>
        </form>
      </div>
    </main>
  )
}

export function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loadError, setLoadError] = useState('')
  const [signOutError, setSignOutError] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  const { params, change } = useQueryParams()
  const requestedView = params.get('view')
  const view = requestedView === 'trips' || requestedView === 'imports' ? requestedView : 'archive'

  useEffect(() => {
    let request = new AbortController()
    function refreshSession() {
      request.abort()
      request = new AbortController()
      const { signal } = request
      api<Session>('session/', { signal }).then(setSession).catch((error) => {
        if (!signal.aborted) setLoadError(messageFor(error))
      })
    }
    function checkRestoredSession(event: PageTransitionEvent) {
      if (!event.persisted) return
      setSession(null)
      setLoadError('')
      refreshSession()
    }
    function signOutOtherTab(event: StorageEvent) {
      if (event.key !== 'pinframe:signed-out') return
      request.abort()
      setSession({ authenticated: false, username: null })
    }
    refreshSession()
    window.addEventListener('pageshow', checkRestoredSession)
    window.addEventListener('storage', signOutOtherTab)
    return () => {
      request.abort()
      window.removeEventListener('pageshow', checkRestoredSession)
      window.removeEventListener('storage', signOutOtherTab)
    }
  }, [])

  async function signOut() {
    setSignOutError('')
    setSigningOut(true)
    try {
      setSession(await api<Session>('session/logout/', { method: 'POST' }))
      try {
        localStorage.setItem('pinframe:signed-out', String(Date.now()))
      } catch {
        // The session is already closed when browser storage is blocked.
      }
    } catch (error) {
      setSignOutError(messageFor(error))
    } finally {
      setSigningOut(false)
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
      <a className="skip-link" href="#app-content">Skip to content</a>
      <header className="site-header">
        <div className="site-header-inner">
          <a className="brand-link" href="?view=archive"><Brand /></a>
          <nav className="site-nav" aria-label="Main navigation">
            <a href="?view=archive" aria-current={view === 'archive' ? 'page' : undefined}><Camera size={17} aria-hidden="true" />Archive</a>
            <a href="?view=trips" aria-current={view === 'trips' ? 'page' : undefined}><NotebookTabs size={17} aria-hidden="true" />Trips</a>
            <a href="?view=imports" aria-current={view === 'imports' ? 'page' : undefined}><Upload size={17} aria-hidden="true" />Imports</a>
          </nav>
          <button className="button quiet sign-out" onClick={signOut} disabled={signingOut}><LogOut size={17} aria-hidden="true" />Sign out</button>
        </div>
      </header>
      <main className="page" id="app-content" tabIndex={-1}>
        {signOutError && <p className="error" role="alert">{signOutError}</p>}
        {view === 'trips' && <TripsPage params={params} change={change} />}
        {view === 'imports' && <ImportsPage params={params} change={change} />}
        {view === 'archive' && <ArchivePage params={params} change={change} />}
      </main>
    </div>
  )
}
