import { useState } from 'react'
import type { FormEvent } from 'react'
import { api, messageFor } from './api'
import { formatDate, tripDates } from './catalog'
import type { Place, Trip, TripDetail } from './catalog'
import type { ChangeQuery } from './navigation'
import { useApi, useList } from './useData'
import { VisitEditor } from './VisitEditor'

function TripForm({ trip, onSave }: { trip?: Trip; onSave: (trip: Trip) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    setError('')
    setBusy(true)
    try {
      const saved = await api<Trip>(trip ? `trips/${trip.id}/` : 'trips/', {
        method: trip ? 'PATCH' : 'POST',
        body: {
          title: String(fields.get('title')).trim(),
          start_date: fields.get('start_date'),
          end_date: fields.get('end_date'),
        },
      })
      onSave(saved)
    } catch (error) {
      setError(messageFor(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form-stack" onSubmit={save}>
      <label>Trip name<input name="title" defaultValue={trip?.title} maxLength={160} required /></label>
      <div className="form-row">
        <label>Start date<input name="start_date" type="date" defaultValue={trip?.start_date} required /></label>
        <label>End date<input name="end_date" type="date" defaultValue={trip?.end_date} required /></label>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions"><button className="button primary" disabled={busy}>{busy ? 'Saving…' : trip ? 'Save trip' : 'Create trip'}</button></div>
    </form>
  )
}

function ImportInstructions({ trip }: { trip: Trip }) {
  const [source, setSource] = useState('instagram')
  const [status, setStatus] = useState('')
  const sources: Record<string, string> = {
    instagram: 'C:\\path\\to\\instagram-export.zip',
    device: 'C:\\path\\to\\photos',
    takeout: 'C:\\path\\to\\extracted-takeout',
  }
  const command = `.\\.venv\\Scripts\\python backend\\manage.py import_photos --source ${source} --trip ${trip.id} '${sources[source]}'`

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(command)
      setStatus('Command copied.')
    } catch {
      setStatus('Select the command text to copy it.')
    }
  }

  return (
    <details className="trip-import">
      <summary>Import photos for this trip</summary>
      <div className="form-stack">
        <label>Photo source
          <select value={source} onChange={(event) => { setSource(event.target.value); setStatus('') }}>
            <option value="instagram">Instagram export</option>
            <option value="device">Phone photos</option>
            <option value="takeout">Google Takeout</option>
          </select>
        </label>
        <p className="muted">Run this from the repo folder with the actual file or folder path.</p>
        <code className="command">{command}</code>
        <div className="actions">
          <button className="button" onClick={copyCommand}>Copy command</button>
          <a className="button quiet" href="?view=imports">Review imports</a>
          {status && <span className="muted" role="status">{status}</span>}
        </div>
      </div>
    </details>
  )
}

function TripStops({ trip, onSave }: { trip: TripDetail; onSave: () => void }) {
  const places = useList<Place>('places/')
  const [editor, setEditor] = useState<string | null>(null)
  const visit = trip.visits.find((stop) => stop.id === editor)

  function saveStop() {
    places.reload()
    onSave()
    setEditor(null)
  }

  return (
    <section className="panel form-stack">
      <div className="section-heading">
        <h2>Stops</h2>
        <button className="button" onClick={() => setEditor('new')}>Add stop</button>
      </div>
      {trip.visits.length ? (
        <ol className="stop-list">
          {trip.visits.map((item) => (
            <li key={item.id}>
              <div><strong>{item.place.name}</strong><p className="muted">{formatDate(item.visited_on)}</p></div>
              <button className="button quiet" onClick={() => setEditor(item.id)} aria-label={`Edit ${item.place.name} stop`}>Edit</button>
            </li>
          ))}
        </ol>
      ) : <p className="muted">Add your stops here or while reviewing photos.</p>}
      {editor && (
        <div className="inline-editor form-stack">
          <h3>{visit ? `Edit ${visit.place.name} stop` : 'Add a stop'}</h3>
          {places.error && <p role="alert" className="error">{places.error}</p>}
          <VisitEditor key={editor} trip={trip} places={places.data ?? []} visit={visit} onSave={saveStop} onCancel={() => setEditor(null)} />
        </div>
      )}
    </section>
  )
}

export function TripsPage({ params, change }: { params: URLSearchParams; change: ChangeQuery }) {
  const tripId = params.get('trip')
  const trips = useList<Trip>('trips/')
  const trip = useApi<TripDetail>(tripId ? `trips/${encodeURIComponent(tripId)}/` : null)

  function onSave(saved: Trip) {
    trips.reload()
    if (tripId === saved.id) trip.reload()
    else change({ trip: saved.id })
  }

  return (
    <>
      <div className="page-heading"><h1>Trips</h1></div>
      <div className="split-layout">
        <aside className="panel form-stack" aria-label="Trip list">
          <div className="section-heading">
            <h2>Your trips</h2>
            <button className="button" onClick={() => change({ trip: null })}>New trip</button>
          </div>
          {trips.loading && <p role="status" className="muted">Loading trips…</p>}
          {trips.error && <p role="alert" className="error">{trips.error}</p>}
          {trips.data?.length === 0 && <p className="muted">Your trips will appear here.</p>}
          {trips.data && trips.data.length > 0 && (
            <ul className="choice-list">
              {trips.data.map((item) => (
                <li key={item.id}>
                  <button type="button" aria-pressed={tripId === item.id} onClick={() => change({ trip: item.id })}>
                    <strong>{item.title}</strong><span>{tripDates(item)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
        <div className="stack">
          {!tripId && <section className="panel form-stack"><h2>New trip</h2><TripForm onSave={onSave} /></section>}
          {trip.loading && <p role="status" className="muted">Loading trip…</p>}
          {trip.error && <p role="alert" className="error">{trip.error}</p>}
          {trip.data && (
            <>
              <section className="panel form-stack">
                <div className="section-heading">
                  <h2>{trip.data.title}</h2>
                  <a className="button" href={`?trip=${encodeURIComponent(trip.data.id)}`}>View in archive</a>
                </div>
                <TripForm key={trip.data.id} trip={trip.data} onSave={onSave} />
                <ImportInstructions key={`import-${trip.data.id}`} trip={trip.data} />
              </section>
              <TripStops key={trip.data.id} trip={trip.data} onSave={trip.reload} />
            </>
          )}
        </div>
      </div>
    </>
  )
}
