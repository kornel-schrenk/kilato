import { useEffect, useMemo, useState } from 'preact/hooks'
import { listRadius, nearby, type LatLon } from '../core/geo'
import { openStatus } from '../core/hours'
import type { Place } from '../core/types'
import { placeLoader } from '../data/places'

const pageSize = 100
const statusInterval = 60_000

export interface Row {
  place: Place
  metres: number
}

/** The place last tapped, and where. A new object is a new tap, even on the same place. */
export interface Selection {
  place: Place
  source: 'row' | 'marker'
}

/** The places around the point, nearest first, how many of them show as rows, which one is tapped, and which are open. */
export function usePlaces(point: LatLon | null) {
  const [, setVersion] = useState(0)
  const [loader] = useState(() =>
    placeLoader(
      (url) => fetch(url),
      () => setVersion((version) => version + 1),
    ),
  )
  const [shown, setShown] = useState(pageSize)
  const [selection, setSelection] = useState<Selection | null>(null)

  useEffect(() => loader.moveTo(point), [loader, point])

  // Every render reads the clock for the statuses, so this only has to render once a minute. The
  // rows stay the same objects: new ones would redraw every marker on the map.
  useEffect(() => {
    const timer = setInterval(() => setVersion((version) => version + 1), statusInterval)
    return () => clearInterval(timer)
  }, [])
  const now = Date.now()

  const rows: Row[] = useMemo(
    () => (point ? nearby(loader.places, point, listRadius) : []),
    [point, loader.places],
  )

  // A place the point has moved away from has no row and no marker left to highlight.
  useEffect(() => {
    if (selection && !rows.some(({ place }) => place.id === selection.place.id)) setSelection(null)
  }, [rows])

  const select = (place: Place, source: Selection['source']) => {
    setSelection({ place, source })
    // A marker can belong to a row that doesn't show yet.
    const rank = rows.findIndex((row) => row.place.id === place.id)
    setShown((current) => Math.max(current, (Math.floor(rank / pageSize) + 1) * pageSize))
  }

  return {
    rows,
    shown,
    showMore: () => setShown((current) => current + pageSize),
    selection,
    select,
    statusOf: (place: Place) => openStatus(place.hours, loader.hoursWindowStart, now),
    failed: loader.failed,
    retry: loader.retry,
  }
}
