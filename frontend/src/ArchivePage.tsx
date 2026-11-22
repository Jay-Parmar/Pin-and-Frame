import { lazy, Suspense, useMemo, useState } from 'react'
import { formatDate, photoDate, tripDates } from './catalog'
import type { PageResult, Photo, Pin, Trip, TripDetail, Visit } from './catalog'
import { pageNumber } from './navigation'
import type { ChangeQuery } from './navigation'
import { Pagination } from './Pagination'
import { PhotoDialog } from './PhotoDialog'
import { useApi, useList } from './useData'

const TravelMap = lazy(() => import('./TravelMap'))
const emptyPins: Pin[] = []
const emptyVisits: Visit[] = []

function tripYears(trips: Trip[]) {
  const years = new Set<string>()
  for (const trip of trips) {
    const start = Number(trip.start_date.slice(0, 4))
    const end = Number(trip.end_date.slice(0, 4))
    for (let year = start; year <= end; year += 1) years.add(String(year).padStart(4, '0'))
  }
  return Array.from(years).sort().reverse()
}

interface GalleryProps {
  place: Pin
  scope: string
  visits: Visit[]
  visitId: string | null
  page: number
  onVisit: (id: string | null) => void
  onPage: (page: number) => void
  onClose: () => void
}

function Gallery({ place, scope, visits, visitId, page, onVisit, onPage, onClose }: GalleryProps) {
  const query = new URLSearchParams(scope)
  query.set('page', String(page))
  if (visitId) query.set('visit', visitId)
  const gallery = useApi<PageResult<Photo>>(`places/${place.id}/photos/?${query}`)
  const [preview, setPreview] = useState<string | null>(null)
  const photos = gallery.data?.results ?? []
  const previewIndex = photos.findIndex((photo) => photo.id === preview)
  const name = `${place.name} gallery`

  return (
    <section className="panel form-stack gallery" aria-label={name}>
      <div className="section-heading">
        <div>
          <h2>{place.name}</h2>
          {gallery.data && <p className="muted">{gallery.data.count} {gallery.data.count === 1 ? 'photo' : 'photos'}</p>}
        </div>
        <button className="button quiet" onClick={onClose} aria-label={`Close ${name}`}>Close</button>
      </div>
      {visits.length > 0 && (
        <label className="gallery-filter">Show photos from
          <select value={visitId ?? ''} onChange={(event) => onVisit(event.target.value || null)}>
            <option value="">{scope ? 'All stops in this view' : 'All visits'}</option>
            {visits.map((visit) => <option value={visit.id} key={visit.id}>Stop {visit.position} · {formatDate(visit.visited_on)}</option>)}
          </select>
        </label>
      )}
      {gallery.loading && <p role="status" className="muted">Loading photos…</p>}
      {gallery.error && <p role="alert" className="error">{gallery.error}</p>}
      {gallery.data && !photos.length && <p className="muted">No approved photos here yet.</p>}
      {photos.length > 0 && (
        <ul className="photo-grid">
          {photos.map((photo, index) => (
            <li key={photo.id}>
              <button className="gallery-photo" onClick={() => setPreview(photo.id)} aria-label={`Open photo ${index + 1}, ${photoDate(photo)}`}>
                <img src={photo.thumbnail_url} loading="lazy" alt={photo.caption || ''} />
              </button>
              <p className="muted">{photoDate(photo)}</p>
            </li>
          ))}
        </ul>
      )}
      {gallery.data && <Pagination page={page} next={gallery.data.next} previous={gallery.data.previous} onPage={onPage} />}
      {previewIndex >= 0 && (
        <PhotoDialog
          photo={photos[previewIndex]}
          onClose={() => setPreview(null)}
          previous={previewIndex > 0 ? () => setPreview(photos[previewIndex - 1].id) : undefined}
          next={previewIndex < photos.length - 1 ? () => setPreview(photos[previewIndex + 1].id) : undefined}
        />
      )}
    </section>
  )
}

interface TimelineProps {
  trips: Trip[]
  tripId: string | null
  visits: Visit[]
  visitId: string | null
  onTrip: (id: string | null) => void
  onVisit: (visit: Visit) => void
  loading: boolean
  error?: string
}

function Timeline({ trips, tripId, visits, visitId, onTrip, onVisit, loading, error }: TimelineProps) {
  return (
    <aside className="panel timeline form-stack" aria-label="Trip timeline">
      <div className="section-heading">
        <h2>Timeline</h2>
        {tripId && <button className="button quiet" onClick={() => onTrip(null)}>All trips</button>}
      </div>
      {loading && <p role="status" className="muted">Loading trips…</p>}
      {error && <p role="alert" className="error">{error}</p>}
      {!loading && !error && trips.length === 0 && <p className="muted">No trips in this view.</p>}
      <ol className="timeline-trips">
        {trips.map((trip) => (
          <li key={trip.id}>
            <button className="timeline-trip" aria-pressed={tripId === trip.id} onClick={() => onTrip(trip.id)}>
              <strong>{trip.title}</strong>
              <span>{tripDates(trip)}</span>
            </button>
            {tripId === trip.id && (
              <ol className="timeline-stops">
                {visits.map((visit) => (
                  <li key={visit.id}>
                    <button className="timeline-stop" aria-pressed={visitId === visit.id} onClick={() => onVisit(visit)}>
                      <strong>{visit.place.name}</strong>
                      <span>{formatDate(visit.visited_on)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </li>
        ))}
      </ol>
    </aside>
  )
}

export function ArchivePage({ params, change }: { params: URLSearchParams; change: ChangeQuery }) {
  const year = params.get('year')
  const tripId = params.get('trip')
  const placeId = params.get('place')
  const visitId = params.get('visit')
  const page = pageNumber(params)
  const trips = useList<Trip>('trips/')
  const trip = useApi<TripDetail>(tripId ? `trips/${encodeURIComponent(tripId)}/` : null)
  const pinQuery = new URLSearchParams()
  if (tripId) pinQuery.set('trip', tripId)
  if (year) pinQuery.set('year', year)
  const pins = useApi<Pin[]>(`places/map/?${pinQuery}`)
  const allTrips = trips.data ?? []
  const visibleTrips = year
    ? allTrips.filter((item) => item.start_date.slice(0, 4) <= year && item.end_date.slice(0, 4) >= year)
    : allTrips
  const visits = trip.data?.visits ?? emptyVisits
  const visibleVisits = year ? visits.filter((visit) => visit.visited_on.startsWith(`${year}-`)) : visits
  const activePlace = pins.data?.find((pin) => pin.id === placeId)
  const placeVisits = visibleVisits.filter((visit) => visit.place.id === activePlace?.id)
  const years = useMemo(() => tripYears(trips.data ?? []), [trips.data])

  function choosePlace(id: string) {
    change({ place: id, visit: null, page: null })
  }

  function chooseTrip(id: string | null) {
    change({ trip: id, place: null, visit: null, page: null })
  }

  return (
    <>
      <div className="page-heading archive-heading">
        <h1>Travel archive</h1>
        <div className="actions">
          {years.length > 0 && (
            <select className="year-select" aria-label="Filter by year" value={year ?? ''} onChange={(event) => (
              change({ year: event.target.value || null, trip: null, place: null, visit: null, page: null })
            )}>
              <option value="">All years</option>
              {years.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          )}
          <a className="button primary" href="?view=trips">Add a trip</a>
        </div>
      </div>
      <div className="archive-layout">
        <div className="stack">
          <section className="map-panel" aria-label="Places on the map">
            <Suspense fallback={<p className="map-frame map-loading muted" role="status">Opening map…</p>}>
              <TravelMap points={pins.data ?? emptyPins} selected={placeId} onSelect={choosePlace} />
            </Suspense>
            <div className="place-directory">
              {pins.loading && <p role="status" className="muted">Loading places…</p>}
              {pins.error && <p role="alert" className="error">{pins.error}</p>}
              {pins.data?.length === 0 && (
                <p className="muted">{tripId || year ? 'No places in this view.' : 'Add a stop to a trip to place a pin on the map.'}</p>
              )}
              {pins.data && pins.data.length > 0 && (
                <ul className="place-list" aria-label="Places">
                  {pins.data.map((pin) => (
                    <li key={pin.id}>
                      <button className="button" aria-pressed={placeId === pin.id} onClick={() => choosePlace(pin.id)}>
                        {pin.name}<span>{pin.photo_count}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
          {activePlace && (
            <Gallery
              key={`${activePlace.id}:${visitId ?? ''}:${page}`}
              place={activePlace}
              scope={pinQuery.toString()}
              visits={placeVisits}
              visitId={visitId}
              page={page}
              onVisit={(id) => change({ visit: id, page: null })}
              onPage={(number) => change({ page: number === 1 ? null : String(number) })}
              onClose={() => change({ place: null, visit: null, page: null })}
            />
          )}
        </div>
        <Timeline
          trips={visibleTrips}
          tripId={tripId}
          visits={visibleVisits}
          visitId={visitId}
          loading={trips.loading || trip.loading}
          error={trips.error || trip.error}
          onTrip={chooseTrip}
          onVisit={(visit) => change({ place: visit.place.id, visit: visit.id, page: null })}
        />
      </div>
    </>
  )
}
