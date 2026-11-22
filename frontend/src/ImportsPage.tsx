import { useEffect, useRef, useState } from 'react'
import { api, messageFor } from './api'
import { formatDate, photoDate } from './catalog'
import type { Coordinates, PageResult, Photo, Place, Trip, TripDetail } from './catalog'
import { pageNumber } from './navigation'
import type { ChangeQuery } from './navigation'
import { Pagination } from './Pagination'
import { PhotoDialog } from './PhotoDialog'
import { useApi, useList } from './useData'
import { VisitEditor } from './VisitEditor'
import './workflow.css'

const sources: Record<string, string> = { device: 'Phone photos', takeout: 'Google Takeout', instagram: 'Instagram' }
const batchDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

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
const reviewLabels: Record<ReviewFilter, string> = {
  pending: 'To review', approved: 'Approved', ignored: 'Ignored', failed: 'Failed', skipped: 'Skipped', all: 'All items',
}

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
  const assignmentTitle = useRef<HTMLHeadingElement>(null)
  const stopTitle = useRef<HTMLHeadingElement>(null)
  const photoIds = Array.from(new Set(results.flatMap((item) => item.photo ? [item.photo.id] : [])))
  const allSelected = photoIds.length > 0 && photoIds.every((id) => selected.has(id))

  useEffect(() => {
    if (newStop) stopTitle.current?.focus()
  }, [newStop])

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
      {newStop && (
        <section className="panel workflow-card workflow-stop-editor form-stack">
          <h2 ref={stopTitle} tabIndex={-1}>Add a stop for {trip.title}</h2>
          <VisitEditor key={`${newStop.hint?.latitude},${newStop.hint?.longitude}`} trip={trip} places={places} hint={newStop.hint} onSave={() => { setNewStop(null); onVisitSaved() }} onCancel={() => setNewStop(null)} />
        </section>
      )}
      <div className={photoIds.length ? 'review-workspace has-photos' : 'review-workspace'}>
        <section className="review-photo-stream" aria-label="Import items">
          {photoIds.length > 0 && (
            <div className="review-select-bar">
              <label className="check">
                <input
                  type="checkbox"
                  checked={allSelected}
                  disabled={busy}
                  ref={(input) => { if (input) input.indeterminate = selected.size > 0 && !allSelected }}
                  onChange={() => setSelected(new Set(allSelected ? [] : photoIds))}
                />
                Select this page
              </label>
              <span role="status" className="review-selected-count">{selected.size} selected</span>
              {selected.size > 0 && <button type="button" className="button review-jump" onClick={() => assignmentTitle.current?.focus()}>Review selection</button>}
            </div>
          )}
          <ul className="review-list" role="list">
            {results.map((item) => {
              const photo = item.photo
              const sourceDate = item.captured_on ?? item.captured_at?.slice(0, 10)
              const photoCaptureDate = photo?.captured_on ?? photo?.captured_at?.slice(0, 10)
              const suggestion = trip.visits.find((visit) => visit.id === item.suggested_visit)
              const hint = item.latitude === null || item.longitude === null ? undefined : { latitude: item.latitude, longitude: item.longitude }
              return (
                <li key={item.id} className="review-item review-record" data-selected={photo && selected.has(photo.id) ? 'true' : undefined}>
                  {photo && (
                    <button className="image-button" onClick={() => setPreview(photo)} aria-label={`Preview ${item.name}`}>
                      <img src={photo.thumbnail_url} loading="lazy" decoding="async" alt="" />
                    </button>
                  )}
                  <div className="review-description">
                    <strong>{item.name}</strong>
                    {photo && <p className="muted">{photoDate(photo)} · {reviewLabels[photo.state]}</p>}
                    {sourceDate && sourceDate !== photoCaptureDate && (
                      <p className="muted">Source capture date {formatDate(sourceDate)}</p>
                    )}
                    {item.published_at && <p className="muted">Posted {formatDate(item.published_at)}</p>}
                    {item.issue && <p className="muted">{item.issue}</p>}
                    {hint && <p className="muted">GPS {hint.latitude.toFixed(4)}, {hint.longitude.toFixed(4)}</p>}
                    {suggestion && (
                      <>
                        {item.suggestion_reason && <p className="muted">Suggested by {item.suggestion_reason}</p>}
                        <button type="button" className="button review-inline-action" disabled={busy} onClick={() => {
                          if (photo) setSelected(new Set([photo.id]))
                          setVisitId(suggestion.id)
                          assignmentTitle.current?.focus()
                        }}>Use {suggestion.place.name}</button>
                      </>
                    )}
                    {hint && !suggestion && <button type="button" className="button review-inline-action" disabled={busy} onClick={() => setNewStop({ hint })}>Add stop at GPS</button>}
                  </div>
                  {photo && (
                    <label className="review-item-check">
                      <input type="checkbox" aria-label={`Select ${item.name}`} disabled={busy} checked={selected.has(photo.id)} onChange={() => toggle(photo.id)} />
                    </label>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
        {photoIds.length > 0 && (
          <section className="panel workflow-card review-controls form-stack" aria-labelledby="review-assignment-title" aria-busy={busy}>
            <h2 id="review-assignment-title" ref={assignmentTitle} tabIndex={-1}>Assign photos</h2>
            <label>Assign to stop
              <select value={visitId} disabled={busy} onChange={(event) => setVisitId(event.target.value)}>
                <option value="">Choose a stop</option>
                {trip.visits.map((visit) => <option value={visit.id} key={visit.id}>{visit.place.name} · {formatDate(visit.visited_on)}</option>)}
              </select>
            </label>
            <button type="button" className="button quiet review-add-stop" disabled={busy} onClick={() => setNewStop({})}>Add stop</button>
            <details className="workflow-disclosure review-date-options">
              <summary>{dateMode === 'keep' ? 'Adjust capture date' : dateMode === 'clear' ? 'Clear capture date' : 'Set capture date'}</summary>
              <div className="form-stack">
                <label>Capture date
                  <select value={dateMode} disabled={busy} onChange={(event) => setDateMode(event.target.value)}>
                    <option value="keep">Keep dates</option>
                    <option value="set">Set date</option>
                    <option value="clear">Clear date</option>
                  </select>
                </label>
                {dateMode === 'set' && <label>New date<input type="date" value={date} disabled={busy} onChange={(event) => setDate(event.target.value)} /></label>}
              </div>
            </details>
            <button type="button" className="button primary" disabled={busy || !selected.size || !visitId || (dateMode === 'set' && !date)} onClick={() => apply('approved')}>{busy ? 'Saving…' : 'Apply to selection'}</button>
            <div className="actions review-secondary-actions">
              <button type="button" className="button quiet" disabled={busy || !selected.size} onClick={() => apply('ignored')}>Ignore</button>
              <button type="button" className="button quiet" disabled={busy || !selected.size} onClick={() => apply('pending')}>Return to pending</button>
            </div>
            {error && <p role="alert" className="error">{error}</p>}
          </section>
        )}
      </div>
      {preview && <PhotoDialog photo={preview} onClose={() => setPreview(null)} />}
    </>
  )
}

export function ImportsPage({ params, change }: { params: URLSearchParams; change: ChangeQuery }) {
  const runs = useList<ImportRun>('imports/')
  const trips = useList<Trip>('trips/')
  const places = useList<Place>('places/')
  const tripScope = params.get('trip')
  const visibleRuns = tripScope ? runs.data?.filter((item) => item.trip === tripScope) : runs.data
  const run = visibleRuns?.find((item) => item.id === params.get('run')) ?? visibleRuns?.[0]
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
    <div className="workflow-imports">
      <div className="page-heading workflow-heading">
        <h1>Imports</h1>
        {run && <a className="button" href={`?view=trips&trip=${encodeURIComponent(run.trip)}`}>Open trip</a>}
      </div>
      <section className="form-stack" aria-label="Import review">
        {runs.loading && <p role="status" className="muted">Loading imports…</p>}
        {[runs.error, trip.error, items.error].filter(Boolean).map((error, index) => <p className="error" role="alert" key={index}>{error}</p>)}
        {visibleRuns?.length === 0 && (
          <section className="panel workflow-card form-stack">
            <h2>{tripScope ? 'No imports for this trip yet' : 'No imports yet'}</h2>
            <p className="muted">{tripScope ? 'Copy the import command from the trip to start a batch.' : 'Create a trip and run its import command to add photos.'}</p>
            <div className="actions">
              <a className="button primary" href={tripScope ? `?view=trips&trip=${encodeURIComponent(tripScope)}` : '?view=trips'}>{tripScope ? 'Open trip' : 'Open trips'}</a>
              {tripScope && <a className="button" href="?view=imports">Show all batches</a>}
            </div>
          </section>
        )}
        {run && (
          <section className="panel workflow-card review-batch form-stack" aria-label="Import batch">
            <div className="review-batch-filter">
              <label>Import batch
                <select value={run.id} onChange={(event) => { setNotice(''); change({ run: event.target.value, page: null }) }}>
                  {visibleRuns?.map((item) => (
                    <option key={item.id} value={item.id}>
                      {sources[item.source] || item.source} · {trips.data?.find((entry) => entry.id === item.trip)?.title ?? 'Trip'} · {batchDate.format(new Date(item.created_at))}
                    </option>
                  ))}
                </select>
              </label>
              <div className="actions">
                <button className="button" onClick={() => { runs.reload(); items.reload() }}>Refresh</button>
                {tripScope && <a className="button quiet" href="?view=imports">Show all batches</a>}
              </div>
            </div>
            <dl className="review-run-summary">
              <div><dt>Imported</dt><dd>{run.counts.imported}</dd></div>
              <div><dt>Reused</dt><dd>{run.counts.reused}</dd></div>
              <div><dt>Skipped</dt><dd>{run.counts.skipped}</dd></div>
              <div data-failed={run.counts.failed > 0 || undefined}><dt>Failed</dt><dd>{run.counts.failed}</dd></div>
            </dl>
            <div className="section-heading">
              <div className="review-filters" role="group" aria-label="Filter import items">
                {reviewStates.map((state) => (
                  <button type="button" key={state} className="review-filter" aria-pressed={status === state} onClick={() => { setNotice(''); change({ status: state, page: null }) }}>
                    {reviewLabels[state]}
                  </button>
                ))}
              </div>
              <p className="review-run-status" data-status={run.status}>{run.status}</p>
            </div>
          </section>
        )}
        {notice && <p role="status" className="success">{notice}</p>}
        {(items.loading || trip.loading) && <p role="status" className="muted">Loading photos…</p>}
        {items.data?.results.length === 0 && (
          <section className="panel workflow-card">
            <p className="muted">{status === 'pending' ? 'No photos are waiting for review.' : 'No items match this filter.'}</p>
          </section>
        )}
        {items.data && items.data.results.length > 0 && trip.data && (
          <>
            <ReviewItems key={`${run?.id}:${status}:${page}`} results={items.data.results} trip={trip.data} places={places.data ?? []} onVisitSaved={onVisitSaved} onUpdate={onUpdate} />
            <Pagination page={page} next={items.data.next} previous={items.data.previous} onPage={(number) => change({ page: number === 1 ? null : String(number) })} />
          </>
        )}
      </section>
    </div>
  )
}
