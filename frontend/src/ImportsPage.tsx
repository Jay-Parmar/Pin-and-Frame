import { useState } from 'react'
import { api, messageFor } from './api'
import { formatDate, photoDate } from './catalog'
import type { Coordinates, PageResult, Photo, Place, Trip, TripDetail } from './catalog'
import { pageNumber } from './navigation'
import type { ChangeQuery } from './navigation'
import { Pagination } from './Pagination'
import { PhotoDialog } from './PhotoDialog'
import { useApi, useList } from './useData'
import { VisitEditor } from './VisitEditor'

const sources: Record<string, string> = { device: 'Phone photos', takeout: 'Google Takeout', instagram: 'Instagram' }

interface ImportRun {
  id: string
  source: string
  trip: string
  status: string
  created_at: string
  finished_at: string | null
  counts: { imported: number; reused: number; skipped: number; failed: number }
}

interface ImportItem {
  id: string
  name: string
  result: string
  issue: string
  captured_on: string | null
  captured_at: string | null
  latitude: number | null
  longitude: number | null
  published_at: string | null
  photo: Photo | null
  suggested_visit: string | null
  suggestion_reason: string | null
}

const reviewStates = ['pending', 'approved', 'ignored', 'failed', 'skipped', 'all'] as const
type ReviewFilter = typeof reviewStates[number]

function filterValue(value: string | null): ReviewFilter {
  return reviewStates.find((status) => status === value) ?? 'pending'
}

function ReviewItems({
  results, trip, places, onVisitSaved, onUpdate,
}: {
  results: ImportItem[]
  trip: TripDetail
  places: Place[]
  onVisitSaved: () => void
  onUpdate: (message: string) => void
}) {
  const [selected, setSelected] = useState(new Set<string>())
  const [visitId, setVisitId] = useState('')
  const [dateMode, setDateMode] = useState('keep')
  const [date, setDate] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<Photo | null>(null)
  const [newStop, setNewStop] = useState<{ hint?: Coordinates } | null>(null)
  const photoIds = Array.from(new Set(results.flatMap((item) => item.photo ? [item.photo.id] : [])))
  const allSelected = photoIds.length > 0 && photoIds.every((id) => selected.has(id))

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function apply(state: Photo['state']) {
    if (!selected.size || (state === 'approved' && (!visitId || (dateMode === 'set' && !date)))) return
    setError('')
    setBusy(true)
    try {
      const body: { photo_ids: string[]; state: Photo['state']; visit: string | null; captured_on?: string | null } = {
        photo_ids: Array.from(selected), state, visit: state === 'approved' ? visitId : null,
      }
      if (state === 'approved' && dateMode !== 'keep') body.captured_on = dateMode === 'clear' ? null : date
      const response = await api<{ updated: number }>('imports/review/', { method: 'POST', body })
      setSelected(new Set())
      setDateMode('keep')
      setDate('')
      onUpdate(`${response.updated} ${response.updated === 1 ? 'photo' : 'photos'} updated.`)
    } catch (error) {
      setError(messageFor(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {photoIds.length > 0 && (
        <section className="review-actions form-stack" aria-label="Photo decisions">
          <div className="section-heading">
            <label className="check"><input type="checkbox" checked={allSelected} disabled={busy} onChange={() => setSelected(new Set(allSelected ? [] : photoIds))} />Select this page</label>
            <span className="muted">{selected.size} selected</span>
          </div>
          <div className="form-row">
            <label>Assign to stop
              <select value={visitId} onChange={(event) => setVisitId(event.target.value)}>
                <option value="">Choose a stop</option>
                {trip.visits.map((visit) => <option value={visit.id} key={visit.id}>{visit.place.name} · {formatDate(visit.visited_on)}</option>)}
              </select>
            </label>
            <label>Capture date
              <select value={dateMode} onChange={(event) => setDateMode(event.target.value)}>
                <option value="keep">Keep dates</option>
                <option value="set">Set date</option>
                <option value="clear">Clear date</option>
              </select>
            </label>
            {dateMode === 'set' && <label>New date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>}
          </div>
          <div className="actions">
            <button className="button primary" disabled={busy || !selected.size || !visitId || (dateMode === 'set' && !date)} onClick={() => apply('approved')}>Apply to selection</button>
            <button className="button" disabled={busy || !selected.size} onClick={() => apply('ignored')}>Ignore</button>
            <button className="button quiet" disabled={busy || !selected.size} onClick={() => apply('pending')}>Return to pending</button>
            <button className="button quiet" type="button" onClick={() => setNewStop({})}>Add stop</button>
          </div>
          {error && <p role="alert" className="error">{error}</p>}
        </section>
      )}
      {newStop && (
        <div className="inline-editor form-stack">
          <h3>Add a stop for {trip.title}</h3>
          <VisitEditor key={`${newStop.hint?.latitude},${newStop.hint?.longitude}`} trip={trip} places={places} hint={newStop.hint} onSave={() => { setNewStop(null); onVisitSaved() }} onCancel={() => setNewStop(null)} />
        </div>
      )}
      <ul className="review-list">
        {results.map((item) => {
          const photo = item.photo
          const sourceDate = item.captured_on ?? item.captured_at?.slice(0, 10)
          const photoCaptureDate = photo?.captured_on ?? photo?.captured_at?.slice(0, 10)
          const suggestion = trip.visits.find((visit) => visit.id === item.suggested_visit)
          const hint = item.latitude === null || item.longitude === null ? undefined : { latitude: item.latitude, longitude: item.longitude }
          return (
            <li key={item.id} className="review-item">
              {photo && (
                <button className="image-button" onClick={() => setPreview(photo)} aria-label={`Preview ${item.name}`}>
                  <img src={photo.thumbnail_url} loading="lazy" alt="" />
                </button>
              )}
              <div className="review-description">
                <strong>{item.name}</strong>
                {photo && <p className="muted">{photoDate(photo)} · {photo.state}</p>}
                {sourceDate && sourceDate !== photoCaptureDate && (
                  <p className="muted">Source capture date {formatDate(sourceDate)}</p>
                )}
                {item.published_at && <p className="muted">Posted {formatDate(item.published_at)}</p>}
                {item.issue && <p className="muted">{item.issue}</p>}
                {hint && <p className="muted">GPS {hint.latitude.toFixed(4)}, {hint.longitude.toFixed(4)}</p>}
                {suggestion && (
                  <>
                    {item.suggestion_reason && <p className="muted">Suggested by {item.suggestion_reason}</p>}
                    <button type="button" className="button quiet" disabled={busy} onClick={() => {
                      if (photo) setSelected(new Set([photo.id]))
                      setVisitId(suggestion.id)
                    }}>Use {suggestion.place.name}</button>
                  </>
                )}
                {hint && !suggestion && <button type="button" className="button quiet" onClick={() => setNewStop({ hint })}>Add stop at GPS</button>}
              </div>
              {photo && <input type="checkbox" aria-label={`Select ${item.name}`} disabled={busy} checked={selected.has(photo.id)} onChange={() => toggle(photo.id)} />}
            </li>
          )
        })}
      </ul>
      {preview && <PhotoDialog photo={preview} onClose={() => setPreview(null)} />}
    </>
  )
}

export function ImportsPage({ params, change }: { params: URLSearchParams; change: ChangeQuery }) {
  const runs = useList<ImportRun>('imports/')
  const trips = useList<Trip>('trips/')
  const places = useList<Place>('places/')
  const run = runs.data?.find((item) => item.id === params.get('run')) ?? runs.data?.[0]
  const status = filterValue(params.get('status'))
  const page = pageNumber(params)
  const trip = useApi<TripDetail>(run ? `trips/${run.trip}/` : null)
  const items = useApi<PageResult<ImportItem>>(run ? `imports/${run.id}/items/?status=${status}&page=${page}` : null)
  const [notice, setNotice] = useState('')

  function onUpdate(message: string) {
    setNotice(message)
    runs.reload()
    if (page > 1) change({ page: null })
    else items.reload()
  }

  function onVisitSaved() {
    trip.reload()
    places.reload()
    items.reload()
  }

  return (
    <>
      <div className="page-heading"><h1>Imports</h1></div>
      <section className="panel form-stack" aria-label="Import review">
        {runs.loading && <p role="status" className="muted">Loading imports…</p>}
        {[runs.error, trip.error, items.error].filter(Boolean).map((error, index) => <p className="error" role="alert" key={index}>{error}</p>)}
        {runs.data?.length === 0 && (
          <><h2>No imports yet</h2><p className="muted">Create a trip and run its import command. Your batches will appear here.</p><div><a className="button primary" href="?view=trips">Open trips</a></div></>
        )}
        {run && (
          <>
            <div className="form-row filters">
              <label>Import batch
                <select value={run.id} onChange={(event) => { setNotice(''); change({ run: event.target.value, page: null }) }}>
                  {runs.data?.map((item) => (
                    <option key={item.id} value={item.id}>
                      {sources[item.source] || item.source} · {trips.data?.find((entry) => entry.id === item.trip)?.title ?? 'Trip'} · {formatDate(item.created_at)}
                    </option>
                  ))}
                </select>
              </label>
              <label>Show
                <select value={status} onChange={(event) => { setNotice(''); change({ status: event.target.value, page: null }) }}>
                  {reviewStates.map((state) => <option key={state} value={state}>{state[0].toUpperCase() + state.slice(1)}</option>)}
                </select>
              </label>
            </div>
            <div className="section-heading">
              <p className="muted">{run.status} · {run.counts.imported} imported · {run.counts.reused} reused · {run.counts.skipped} skipped · {run.counts.failed} failed</p>
              <button className="button quiet" onClick={() => { runs.reload(); items.reload() }}>Refresh</button>
            </div>
          </>
        )}
        {notice && <p role="status" className="success">{notice}</p>}
        {(items.loading || trip.loading) && <p role="status" className="muted">Loading photos…</p>}
        {items.data?.results.length === 0 && <p className="muted">No {status === 'all' ? '' : `${status} `}items in this batch.</p>}
        {items.data && items.data.results.length > 0 && trip.data && (
          <>
            <ReviewItems key={`${run?.id}:${status}:${page}`} results={items.data.results} trip={trip.data} places={places.data ?? []} onVisitSaved={onVisitSaved} onUpdate={onUpdate} />
            <Pagination page={page} next={items.data.next} previous={items.data.previous} onPage={(number) => change({ page: number === 1 ? null : String(number) })} />
          </>
        )}
      </section>
    </>
  )
}
