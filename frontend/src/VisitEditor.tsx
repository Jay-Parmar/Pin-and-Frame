import { lazy, Suspense, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { api, messageFor } from './api'
import type { Coordinates, Place, TripDetail, Visit } from './catalog'

const TravelMap = lazy(() => import('./TravelMap'))

interface VisitEditorProps {
  trip: TripDetail
  places: Place[]
  visit?: Visit
  hint?: Coordinates
  onSave: () => void
  onCancel?: () => void
}

export function VisitEditor({ trip, places, visit, hint, onSave, onCancel }: VisitEditorProps) {
  const [existingPlace, setExistingPlace] = useState(visit?.place.id ?? '')
  const [latitude, setLatitude] = useState(hint ? String(hint.latitude) : '')
  const [longitude, setLongitude] = useState(hint ? String(hint.longitude) : '')
  const [showMap, setShowMap] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const nextPosition = trip.visits.reduce((last, item) => Math.max(last, item.position), 0) + 1
  const points = useMemo(() => {
    const lat = Number(latitude)
    const lon = Number(longitude)
    return latitude && longitude && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
      ? [{ id: 'new', name: 'New place', latitude: lat, longitude: lon }]
      : []
  }, [latitude, longitude])

  function pickCoordinates(coordinates: Coordinates) {
    setLatitude(String(coordinates.latitude))
    setLongitude(String(coordinates.longitude))
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const fields = new FormData(event.currentTarget)
    try {
      let place = existingPlace
      if (!place) {
        const newPlace = await api<Place>('places/', {
          method: 'POST',
          body: { name: String(fields.get('name')).trim(), latitude: Number(latitude), longitude: Number(longitude) },
        })
        place = newPlace.id
        setExistingPlace(newPlace.id)
      }
      await api(visit ? `visits/${visit.id}/` : 'visits/', {
        method: visit ? 'PATCH' : 'POST',
        body: { trip: trip.id, place, visited_on: fields.get('visited_on'), position: Number(fields.get('position')) },
      })
      onSave()
    } catch (error) {
      setError(messageFor(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form-stack" onSubmit={save}>
      <label>Place
        <select value={existingPlace} onChange={(event) => setExistingPlace(event.target.value)}>
          <option value="">New place</option>
          {existingPlace && !places.some((place) => place.id === existingPlace) && <option value={existingPlace}>Saved place</option>}
          {places.map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}
        </select>
      </label>
      {!existingPlace && (
        <>
          <label>Place name<input name="name" maxLength={160} required /></label>
          <button type="button" className="button" onClick={() => setShowMap(!showMap)} aria-expanded={showMap}>
            {showMap ? 'Hide map' : 'Pick on map'}
          </button>
          {showMap && (
            <Suspense fallback={<p role="status">Opening map…</p>}>
              <TravelMap points={points} onPick={pickCoordinates} />
            </Suspense>
          )}
          <div className="form-row">
            <label>Latitude<input type="number" min="-90" max="90" step="any" value={latitude} onChange={(event) => setLatitude(event.target.value)} required /></label>
            <label>Longitude<input type="number" min="-180" max="180" step="any" value={longitude} onChange={(event) => setLongitude(event.target.value)} required /></label>
          </div>
        </>
      )}
      <div className="form-row">
        <label>Visit date<input type="date" name="visited_on" min={trip.start_date} max={trip.end_date} defaultValue={visit?.visited_on ?? trip.start_date} required /></label>
        <label>Stop order<input type="number" name="position" min="1" defaultValue={visit?.position ?? nextPosition} required /></label>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Save stop'}</button>
        {onCancel && <button type="button" className="button quiet" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  )
}
