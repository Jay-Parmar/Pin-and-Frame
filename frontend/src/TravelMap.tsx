import { LngLatBounds, Map as MapLibre, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef, useState } from 'react'
import type { Coordinates, Place } from './catalog'
import './map.css'

setWorkerUrl(workerUrl)

const defaultStyle = 'https://tiles.openfreemap.org/styles/positron'
const mapStyle = import.meta.env.VITE_MAP_STYLE_URL || defaultStyle
const worldCenter: [number, number] = [0, 24]
const markerDistance = 46

interface MapPoint extends Place {
  photo_count?: number
}

interface MarkerGroup {
  points: MapPoint[]
  x: number
  y: number
}

interface TravelMapProps {
  points: MapPoint[]
  selected?: string | null
  onSelect?: (id: string) => void
  onPick?: (coordinates: Coordinates) => void
}

function position(point: Coordinates): [number, number] {
  return [point.longitude, Math.max(-85.051129, Math.min(85.051129, point.latitude))]
}

function focusPoints(map: MapLibre, points: MapPoint[]) {
  if (!points.length) {
    map.jumpTo({ center: worldCenter, zoom: 1.3 })
    return
  }
  if (points.length === 1) {
    map.jumpTo({ center: position(points[0]), zoom: 10 })
    return
  }

  // Start the bounds after the largest longitude gap so nearby stops can cross the date line.
  const longitudes = points.map((point) => point.longitude).sort((a, b) => a - b)
  let start = longitudes[0]
  let gap = longitudes[0] + 360 - longitudes[longitudes.length - 1]
  for (let index = 1; index < longitudes.length; index += 1) {
    const distance = longitudes[index] - longitudes[index - 1]
    if (distance > gap) {
      gap = distance
      start = longitudes[index]
    }
  }
  const bounds = new LngLatBounds()
  for (const point of points) {
    const [lng, lat] = position(point)
    bounds.extend([lng < start ? lng + 360 : lng, lat])
  }
  map.fitBounds(bounds, { padding: 46, maxZoom: 13, duration: 0 })
}

function groupMarkers(map: MapLibre, points: MapPoint[], picking: boolean) {
  const groups: MarkerGroup[] = []
  const { clientWidth, clientHeight } = map.getContainer()
  const center = map.getCenter().lng
  for (const point of points) {
    const [lng, lat] = position(point)
    const nearestWorld = lng + Math.round((center - lng) / 360) * 360
    const { x, y } = map.project([nearestWorld, lat])
    if (x < -32 || y < -32 || x > clientWidth + 32 || y > clientHeight + 32) continue
    const group = picking ? undefined : groups.find((item) => (
      Math.hypot(item.x - x, item.y - y) < markerDistance
    ))
    if (group) group.points.push(point)
    else groups.push({ points: [point], x, y })
  }
  return groups
}

function tintBasemap(map: MapLibre) {
  if (mapStyle !== defaultStyle) return
  const palette = [
    ['background', 'background-color', '#f5f3eb'],
    ['water', 'fill-color', '#bdd9dc'],
    ['park', 'fill-color', '#dbe6d3'],
    ['landcover_wood', 'fill-color', '#d4e2cf'],
    ['waterway', 'line-color', '#a5c9d1'],
  ] as const
  for (const [layer, property, color] of palette) {
    if (map.getLayer(layer)) map.setPaintProperty(layer, property, color)
  }
}

export default function TravelMap({ points, selected, onSelect, onPick }: TravelMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const instance = useRef<MapLibre | null>(null)
  const refresh = useRef<(() => void) | null>(null)
  const options = useRef({ points, selected, onSelect, onPick })
  const clusterButton = useRef<HTMLButtonElement | null>(null)
  const clusterPanel = useRef<HTMLDivElement>(null)
  const openGroup = useRef('')
  const [nearby, setNearby] = useState<MapPoint[]>([])
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState<'opening' | 'ready' | 'unavailable'>('opening')
  const picking = Boolean(onPick)

  useEffect(() => {
    options.current = { points, selected, onSelect, onPick }
  }, [points, selected, onSelect, onPick])

  function closeNearby(restoreFocus = false) {
    openGroup.current = ''
    setNearby([])
    if (restoreFocus && clusterButton.current?.isConnected) clusterButton.current.focus()
    clusterButton.current = null
    refresh.current?.()
  }

  useEffect(() => {
    if (!container.current) return
    const initial = options.current.points[0]
    let map: MapLibre
    try {
      map = new MapLibre({
        container: container.current,
        style: mapStyle,
        center: initial ? position(initial) : worldCenter,
        zoom: initial ? 10 : 1.3,
        dragRotate: false,
        pitchWithRotate: false,
        cooperativeGestures: !picking,
        attributionControl: { compact: true },
      })
    } catch {
      setStatus('unavailable')
      return
    }

    instance.current = map
    map.touchZoomRotate.disableRotation()
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    const markers = new Map<string, Marker>()

    function redraw() {
      const current = options.current
      const groups = groupMarkers(map, current.points, picking)
      const visible = new Set<string>()
      for (const { points: group } of groups) {
        const first = group[0]
        const clustered = group.length > 1
        const key = group.map((point) => point.id).join(':')
        visible.add(key)
        let marker = markers.get(key)
        if (!marker) {
          const pin = document.createElement(picking ? 'span' : 'button')
          pin.className = 'map-pin'
          marker = new Marker({ element: pin }).setLngLat(position(first)).addTo(map)
          markers.set(key, marker)
        }
        marker.setLngLat(position(first))
        const pin = marker.getElement()
        const active = group.some((point) => point.id === current.selected)
        const label = clustered ? `${group.length} nearby places` : first.name
        pin.classList.toggle('is-selected', active)
        pin.classList.toggle('map-pin-cluster', clustered)
        pin.textContent = clustered ? String(group.length) : String(first.photo_count || '•')
        pin.title = label
        if (!(pin instanceof HTMLButtonElement)) continue
        pin.type = 'button'
        pin.setAttribute('aria-label', label)
        if (clustered) {
          pin.setAttribute('aria-expanded', String(openGroup.current === key))
        } else {
          pin.setAttribute('aria-pressed', String(active))
        }
        pin.onclick = (event) => {
          event.stopPropagation()
          if (!clustered) {
            closeNearby()
            options.current.onSelect?.(first.id)
            return
          }
          if (openGroup.current === key) {
            closeNearby(true)
            return
          }
          openGroup.current = key
          clusterButton.current = pin
          setNearby(group)
          redraw()
        }
      }
      for (const [key, marker] of markers) {
        if (visible.has(key)) continue
        marker.remove()
        markers.delete(key)
      }
    }

    refresh.current = redraw
    const timeout = window.setTimeout(() => setStatus('unavailable'), 12_000)
    map.on('load', () => {
      window.clearTimeout(timeout)
      tintBasemap(map)
      setStatus('ready')
      redraw()
    })
    map.on('error', () => {
      if (!map.getStyle()?.layers.length) setStatus('unavailable')
    })
    map.on('moveend', redraw)
    map.on('click', ({ lngLat }) => {
      closeNearby()
      const point = lngLat.wrap()
      options.current.onPick?.({
        latitude: Number(point.lat.toFixed(6)),
        longitude: Number(point.lng.toFixed(6)),
      })
    })
    const resize = new ResizeObserver(() => {
      map.resize()
      redraw()
    })
    resize.observe(container.current)

    return () => {
      resize.disconnect()
      window.clearTimeout(timeout)
      refresh.current = null
      instance.current = null
      for (const marker of markers.values()) marker.remove()
      map.remove()
    }
  }, [attempt, picking])

  useEffect(() => {
    closeNearby()
    const map = instance.current
    if (!map) return
    if (!picking) focusPoints(map, points)
    refresh.current?.()
  }, [attempt, picking, points])

  useEffect(() => {
    const map = instance.current
    const point = points.find((item) => item.id === selected)
    if (map && point && !picking) {
      map.easeTo({ center: position(point), zoom: Math.max(9, map.getZoom()), duration: 300 })
    }
    refresh.current?.()
  }, [attempt, picking, points, selected])

  useEffect(() => {
    if (nearby.length) clusterPanel.current?.querySelector<HTMLButtonElement>('li button')?.focus()
  }, [nearby])

  function resetView() {
    const map = instance.current
    closeNearby()
    if (map) focusPoints(map, points)
  }

  return (
    <div className={`map-frame atlas-map${picking ? ' map-picker' : ''}`} role="region" aria-label={picking ? 'Choose coordinates on the map' : 'Travel map'}>
      <div className="map-canvas" ref={container} />
      {status === 'ready' && !picking && points.length > 0 && (
        <button type="button" className="map-fit-control" onClick={resetView}>
          <span className="map-fit-icon" aria-hidden="true" />Fit places
        </button>
      )}
      {nearby.length > 0 && status === 'ready' && (
        <div className="map-nearby" ref={clusterPanel} role="region" aria-label="Nearby places" onKeyDown={(event) => {
          if (event.key === 'Escape') closeNearby(true)
        }}>
          <div className="map-nearby-heading">
            <strong>Nearby places</strong>
            <button type="button" aria-label="Close nearby places" onClick={() => closeNearby(true)}>×</button>
          </div>
          <ul>
            {nearby.map((point) => (
              <li key={point.id}>
                <button type="button" onClick={() => { closeNearby(true); onSelect?.(point.id) }}>
                  <span>{point.name}</span><small>{point.photo_count ?? 0} {point.photo_count === 1 ? 'photo' : 'photos'}</small>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {status === 'opening' && <p className="map-notice" role="status">Opening map…</p>}
      {status === 'unavailable' && (
        <div className="map-notice map-error">
          <p role="status">{picking ? 'Map unavailable. Enter coordinates below.' : 'Map unavailable. Browse places in the list.'}</p>
          <button type="button" onClick={() => { setStatus('opening'); setAttempt((value) => value + 1) }}>Retry map</button>
        </div>
      )}
    </div>
  )
}
