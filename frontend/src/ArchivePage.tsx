import { CalendarDays, Camera, ChevronRight, MapPin, Plus, Search, X } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { formatDate, photoDate, tripDates } from './catalog'
import type { PageResult, Photo, Pin, Trip, TripDetail, Visit } from './catalog'
import { pageNumber } from './navigation'
import type { ChangeQuery } from './navigation'
import { Pagination } from './Pagination'
import { PhotoDialog } from './PhotoDialog'
import { useApi, useList } from './useData'
import './archive.css'

const TravelMap = lazy(() => import('./TravelMap'))
const emptyPins: Pin[] = []
const emptyVisits: Visit[] = []

function scrollToGallery(element: HTMLElement | null) {
  if (window.matchMedia('(max-width: 860px)').matches) {
    element?.scrollIntoView({ block: 'start' })
  }
}

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
        <div className="gallery-heading">
          <h2>{place.name}</h2>
          {gallery.data && <p className="muted">{gallery.data.count} {gallery.data.count === 1 ? 'photo' : 'photos'}</p>}
        </div>
        <button className="icon-button" onClick={onClose} aria-label={`Close ${name}`}><X size={19} aria-hidden="true" /></button>
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
                <img src={photo.thumbnail_url} loading="lazy" decoding="async" alt={photo.caption || ''} />
                <span className="gallery-photo-icon"><Camera size={16} aria-hidden="true" /></span>
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
        {tripId && <button className="button quiet timeline-clear" onClick={() => onTrip(null)}>All trips</button>}
      </div>
      {loading && <p role="status" className="muted">Loading trips…</p>}
      {error && <p role="alert" className="error">{error}</p>}
      {!loading && !error && trips.length === 0 && <p className="muted">No trips in this view.</p>}
      <ol className="timeline-trips">
        {trips.map((trip) => (
          <li key={trip.id}>
            <button className="timeline-trip" aria-pressed={tripId === trip.id} onClick={() => onTrip(trip.id)}>
              <span className="timeline-trip-icon"><CalendarDays size={18} aria-hidden="true" /></span>
              <span className="timeline-trip-details"><strong>{trip.title}</strong><small>{tripDates(trip)}</small></span>
              <ChevronRight size={16} className="timeline-chevron" aria-hidden="true" />
            </button>
            {tripId === trip.id && (
              <ol className="timeline-stops">
                {visits.map((visit) => (
                  <li key={visit.id}>
                    <button className="timeline-stop" aria-pressed={visitId === visit.id} onClick={() => onVisit(visit)}>
                      <span><strong>{visit.place.name}</strong><small>{formatDate(visit.visited_on)}</small></span>
                      <ChevronRight size={15} aria-hidden="true" />
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

function PlaceDirectory({ pins, selected, onSelect }: {
  pins: Pin[]
  selected: string | null
  onSelect: (id: string) => void
}) {
  const [search, setSearch] = useState('')
  const query = search.trim().toLocaleLowerCase()
  const visible = pins.filter((pin) => pin.name.toLocaleLowerCase().includes(query))

  return (
    <div className="place-directory">
      <div className="place-directory-header">
        <h3>Places</h3>
        <div className="place-search">
          <Search size={16} aria-hidden="true" />
          <input aria-label="Search places" placeholder="Search places" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
      </div>
      {visible.length > 0 ? (
        <ul className="place-list" aria-label="Places">
          {visible.map((pin) => (
            <li key={pin.id}>
              <button className="button" aria-pressed={selected === pin.id} onClick={() => onSelect(pin.id)}>
                <MapPin size={15} aria-hidden="true" />
                <span className="place-name">{pin.name}</span>
                <span className="place-count"><Camera size={13} aria-hidden="true" />{pin.photo_count}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="muted" role="status">No places match your search.</p>}
    </div>
  )
}

export function ArchivePage({ params, change }: { params: URLSearchParams; change: ChangeQuery }) {
  const year = params.get('year')
  const tripId = params.get('trip')
  const placeId = params.get('place')
  const visitId = params.get('visit')
  const page = pageNumber(params)
  const galleryAnchor = useRef<HTMLDivElement>(null)
  const revealGallery = useRef(false)
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
  const photoCount = pins.data?.reduce((total, pin) => total + pin.photo_count, 0)
  const tripCount = tripId ? Number(visibleTrips.some((item) => item.id === tripId)) : visibleTrips.length

  useEffect(() => {
    if (!activePlace || !revealGallery.current) return
    revealGallery.current = false
    scrollToGallery(galleryAnchor.current)
  }, [activePlace, visitId])

  function choosePlace(id: string, visit: string | null = null) {
    if (id === placeId && visit === visitId) scrollToGallery(galleryAnchor.current)
    else revealGallery.current = true
    change({ place: id, visit, page: null })
  }

  function chooseTrip(id: string | null) {
    change({ trip: id, place: null, visit: null, page: null })
  }

  return (
    <>
      <header className="page-heading archive-heading">
        <div className="archive-intro">
          <h1>Travel archive</h1>
          {trips.data && pins.data && (
            <dl className="archive-stats">
              <div><dt>Trips</dt><dd>{tripCount}</dd></div>
              <div><dt>Places</dt><dd>{pins.data.length}</dd></div>
              <div><dt>Photos</dt><dd>{photoCount}</dd></div>
            </dl>
          )}
        </div>
        <a className="button primary add-trip" href="?view=trips"><Plus size={18} aria-hidden="true" />Add a trip</a>
      </header>
      <div className="archive-layout">
        <section className="map-panel" aria-label="Places on the map">
          <div className="archive-map-header">
            <h2>Map</h2>
            {years.length > 0 && (
              <div className="map-year-filter">
                <CalendarDays size={16} aria-hidden="true" />
                <select className="year-select" aria-label="Filter by year" value={year ?? ''} onChange={(event) => (
                  change({ year: event.target.value || null, trip: null, place: null, visit: null, page: null })
                )}>
                  <option value="">All years</option>
                  {years.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
            )}
          </div>
          <Suspense fallback={<p className="map-frame map-loading muted" role="status">Opening map…</p>}>
            <TravelMap points={pins.data ?? emptyPins} selected={placeId} onSelect={choosePlace} />
          </Suspense>
          {pins.loading && <p role="status" className="muted map-footer">Loading places…</p>}
          {pins.error && <p role="alert" className="error map-footer">{pins.error}</p>}
          {pins.data?.length === 0 && (
            <p className="muted map-footer">{tripId || year ? 'No places in this view.' : 'Add a stop to a trip to place a pin on the map.'}</p>
          )}
          {pins.data && pins.data.length > 0 && <PlaceDirectory pins={pins.data} selected={placeId} onSelect={choosePlace} />}
        </section>
        <div className="archive-sidebar">
          {activePlace && (
            <div ref={galleryAnchor} className="gallery-anchor">
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
            </div>
          )}
          <Timeline
            trips={visibleTrips}
            tripId={tripId}
            visits={visibleVisits}
            visitId={visitId}
            loading={trips.loading || trip.loading}
            error={trips.error || trip.error}
            onTrip={chooseTrip}
            onVisit={(visit) => choosePlace(visit.place.id, visit.id)}
          />
        </div>
      </div>
    </>
  )
}
