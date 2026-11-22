import { LngLatBounds, Map as MapLibre, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef, useState } from 'react'
import type { Coordinates, Place } from './catalog'

setWorkerUrl(workerUrl)

const mapStyle = import.meta.env.VITE_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty'

interface MapPoint extends Place {
  photo_count?: number
}

interface TravelMapProps {
  points: MapPoint[]
  selected?: string | null
  onSelect?: (id: string) => void
  onPick?: (coordinates: Coordinates) => void
}

export default function TravelMap({ points, selected, onSelect, onPick }: TravelMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const instance = useRef<MapLibre | null>(null)
  const markers = useRef(new Map<string, Marker>())
  const initialPoint = useRef(points[0])
  const selectPoint = useRef(onSelect)
  const pickCoordinates = useRef(onPick)
  const [status, setStatus] = useState<'opening' | 'ready' | 'unavailable'>('opening')

  useEffect(() => { selectPoint.current = onSelect }, [onSelect])
  useEffect(() => { pickCoordinates.current = onPick }, [onPick])

  useEffect(() => {
    if (!container.current) return
    const point = initialPoint.current
    let map: MapLibre
    try {
      map = new MapLibre({
        container: container.current,
        style: mapStyle,
        center: point ? [point.longitude, point.latitude] : [0, 22],
        zoom: point ? 7 : 1.3,
      })
    } catch {
      setStatus('unavailable')
      return
    }
    instance.current = map
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    const timeout = window.setTimeout(() => setStatus('unavailable'), 12_000)
    map.on('load', () => {
      window.clearTimeout(timeout)
      setStatus('ready')
    })
    map.on('click', ({ lngLat }) => {
      const position = lngLat.wrap()
      pickCoordinates.current?.({
        latitude: Number(position.lat.toFixed(6)),
        longitude: Number(position.lng.toFixed(6)),
      })
    })
    const resize = new ResizeObserver(() => map.resize())
    resize.observe(container.current)
    return () => {
      resize.disconnect()
      window.clearTimeout(timeout)
      instance.current = null
      map.remove()
    }
  }, [])

  useEffect(() => {
    const map = instance.current
    if (!map) return
    const current = markers.current
    const bounds = new LngLatBounds()
    for (const point of points) {
      const pin = document.createElement(onPick ? 'span' : 'button')
      pin.className = 'map-pin'
      pin.textContent = point.photo_count ? String(point.photo_count) : '•'
      pin.setAttribute('aria-label', point.name)
      if (pin instanceof HTMLButtonElement) {
        pin.type = 'button'
        pin.onclick = (event) => {
          event.stopPropagation()
          selectPoint.current?.(point.id)
        }
      }
      const position: [number, number] = [point.longitude, point.latitude]
      bounds.extend(position)
      current.set(point.id, new Marker({ element: pin }).setLngLat(position).addTo(map))
    }
    if (points.length && !onPick) {
      map.fitBounds(bounds, { padding: 60, maxZoom: 9, duration: 0 })
    }
    return () => {
      for (const pin of current.values()) pin.remove()
      current.clear()
    }
  }, [points, onPick])

  useEffect(() => {
    for (const [id, marker] of markers.current) {
      const active = id === selected
      marker.getElement().classList.toggle('is-selected', active)
      marker.getElement().setAttribute('aria-pressed', String(active))
    }
    if (selected) {
      const pin = markers.current.get(selected)
      if (pin) instance.current?.easeTo({ center: pin.getLngLat(), duration: 350 })
    }
  }, [points, selected])

  return (
    <div className={`map-frame${onPick ? ' map-picker' : ''}`} role="region" aria-label={onPick ? 'Choose coordinates on the map' : 'Travel map'}>
      <div className="map-canvas" ref={container} />
      {status === 'opening' && <p className="map-notice" role="status">Opening map…</p>}
      {status === 'unavailable' && (
        <p className="map-notice" role="status">{onPick ? 'Map unavailable. Enter coordinates below.' : 'Map unavailable. Browse places in the list.'}</p>
      )}
    </div>
  )
}
