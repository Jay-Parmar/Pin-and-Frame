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
  const [editingPlace, setEditingPlace] = useState(false)
  const [showMap, setShowMap] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const selectedPlace = places.find((place) => place.id === existingPlace)
    ?? (visit?.place.id === existingPlace ? visit.place : undefined)
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

  function editPlace() {
    if (!selectedPlace) return
    pickCoordinates(selectedPlace)
    setError('')
    setEditingPlace(true)
  }

  function cancelPlaceEdit() {
    setLatitude(hint ? String(hint.latitude) : '')
    setLongitude(hint ? String(hint.longitude) : '')
    setError('')
    setShowMap(false)
    setEditingPlace(false)
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const fields = new FormData(event.currentTarget)
    const placeValues = {
      name: String(fields.get('name') ?? '').trim(),
      latitude: Number(latitude),
      longitude: Number(longitude),
    }
    try {
      if (editingPlace) {
        await api(`places/${existingPlace}/`, { method: 'PATCH', body: placeValues })
        onSave()
        return
      }
      let place = existingPlace
      if (!place) {
        const newPlace = await api<Place>('places/', {
          method: 'POST',
          body: placeValues,
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
    <form className="form-stack workflow-visit-form" onSubmit={save} aria-busy={busy}>
      <div className="workflow-place-select">
        <label>Place
          <select value={existingPlace} disabled={editingPlace || busy} onChange={(event) => setExistingPlace(event.target.value)}>
            <option value="">New place</option>
            {existingPlace && !places.some((place) => place.id === existingPlace) && <option value={existingPlace}>{selectedPlace?.name ?? 'Saved place'}</option>}
            {places.map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}
          </select>
        </label>
        {selectedPlace && !editingPlace && (
          <button type="button" className="button" disabled={busy} onClick={editPlace}>Edit saved place</button>
        )}
      </div>
      {(!existingPlace || editingPlace) && (
        <>
          {editingPlace && <p className="muted">Changes apply to all visits to this place.</p>}
          <label>Place name<input name="name" defaultValue={editingPlace ? selectedPlace?.name : ''} maxLength={200} disabled={busy} required /></label>
          <div className="workflow-coordinate-panel form-stack">
            <div className="section-heading">
              <p className="workflow-field-title">Pin location</p>
              <button type="button" className="button" onClick={() => setShowMap(!showMap)} disabled={busy} aria-expanded={showMap}>
                {showMap ? 'Hide map' : 'Pick on map'}
              </button>
            </div>
            {showMap && (
              <Suspense fallback={<p role="status">Opening map…</p>}>
                <TravelMap points={points} onPick={pickCoordinates} />
              </Suspense>
            )}
            <div className="form-row">
              <label>Latitude<input type="number" min="-90" max="90" step="any" value={latitude} onChange={(event) => setLatitude(event.target.value)} disabled={busy} required /></label>
              <label>Longitude<input type="number" min="-180" max="180" step="any" value={longitude} onChange={(event) => setLongitude(event.target.value)} disabled={busy} required /></label>
            </div>
          </div>
        </>
      )}
      <div hidden={editingPlace}>
        <div className="form-row">
          <label>Visit date<input type="date" name="visited_on" min={trip.start_date} max={trip.end_date} defaultValue={visit?.visited_on ?? trip.start_date} disabled={editingPlace || busy} required /></label>
          <label>Stop order<input type="number" name="position" min="1" defaultValue={visit?.position ?? nextPosition} disabled={editingPlace || busy} required /></label>
        </div>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button className="button primary" disabled={busy}>{busy ? 'Saving…' : editingPlace ? 'Save place' : 'Save stop'}</button>
        {(editingPlace || onCancel) && <button type="button" className="button quiet" disabled={busy} onClick={editingPlace ? cancelPlaceEdit : onCancel}>Cancel</button>}
      </div>
    </form>
  )
}
