export interface PageResult<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface Trip {
  id: string
  title: string
  start_date: string
  end_date: string
}

export interface Coordinates {
  latitude: number
  longitude: number
}

export interface Place extends Coordinates {
  id: string
  name: string
}

export interface Visit {
  id: string
  place: Place
  visited_on: string
  position: number
}

export interface TripDetail extends Trip {
  visits: Visit[]
}

export interface Pin extends Place {
  photo_count: number
}

export interface Photo {
  id: string
  caption: string
  captured_on: string | null
  captured_at: string | null
  thumbnail_url: string
  display_url: string
  width: number
  height: number
  visit: string | null
  state: 'pending' | 'approved' | 'ignored'
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium', timeZone: 'UTC',
})

export function formatDate(date: string) {
  return dateFormatter.format(new Date(`${date.slice(0, 10)}T00:00:00Z`))
}

export function tripDates(trip: Trip) {
  const start = formatDate(trip.start_date)
  return trip.start_date === trip.end_date ? start : `${start} to ${formatDate(trip.end_date)}`
}

export function photoDate(photo: Photo) {
  const date = photo.captured_on ?? photo.captured_at?.slice(0, 10)
  return date ? formatDate(date) : 'Date unknown'
}
