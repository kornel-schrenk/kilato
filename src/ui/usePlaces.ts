import { useEffect, useMemo, useState } from 'preact/hooks'
import { listRadius, nearby, type LatLon } from '../core/geo'
import type { SearchPlace } from '../core/search'
import type { Place } from '../core/types'
import { placeLoader } from '../data/places'

const pageSize = 100

export interface Row {
  place: Place
  metres: number
}

/** The place last tapped, and where. A new object is a new tap, even on the same place. */
export interface Selection {
  place: Place
  source: 'row' | 'marker' | 'search'
}

/** The places around the point, nearest first, how many of them show as rows, and which one is tapped. */
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
  // A search result that was picked, until its row is there.
  const [picked, setPicked] = useState<SearchPlace | null>(null)

  useEffect(() => loader.moveTo(point), [loader, point])

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

  // The picked place has no row until its cell arrives. A point that moved on first leaves the row unhighlighted.
  useEffect(() => {
    if (!picked) return
    const pointStayed = point?.lat === picked.lat && point.lon === picked.lon
    const row = rows.find(({ place }) => place.id === picked.id)
    if (pointStayed && row) select(row.place, 'search')
    if (row || !pointStayed) setPicked(null)
  }, [point, rows, picked])

  return {
    rows,
    shown,
    showMore: () => setShown((current) => current + pageSize),
    selection,
    select,
    pick: setPicked,
    failed: loader.failed,
    retry: loader.retry,
  }
}
