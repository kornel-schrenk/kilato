import { useEffect, useMemo, useState } from 'preact/hooks'
import { listRadius, nearby, type LatLon } from '../core/geo'
import { openStatus } from '../core/hours'
import type { CategoryId, Place } from '../core/types'
import { wikiLink } from '../core/wiki'
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

/**
 * The places around the point whose category is on, nearest first, how many of them show as rows,
 * which one is tapped, which are open, and each one's article. Every category is on at the start of
 * a visit, and that isn't saved.
 */
export function usePlaces(point: LatLon | null, phone: string) {
  const [, setVersion] = useState(0)
  const [loader] = useState(() =>
    placeLoader(
      (url) => fetch(url),
      () => setVersion((version) => version + 1),
      phone,
    ),
  )
  const [shown, setShown] = useState(pageSize)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [categoriesOff, setCategoriesOff] = useState<ReadonlySet<CategoryId>>(new Set())

  useEffect(() => loader.moveTo(point), [loader, point])

  // Every render reads the clock for the statuses, so this only has to render once a minute. The
  // rows stay the same objects: new ones would redraw every marker on the map.
  useEffect(() => {
    const timer = setInterval(() => setVersion((version) => version + 1), statusInterval)
    return () => clearInterval(timer)
  }, [])
  const now = Date.now()

  const rows: Row[] = useMemo(
    () => (point ? nearby(loader.places, point, listRadius).filter(({ place }) => !categoriesOff.has(place.cat)) : []),
    [point, loader.places, categoriesOff],
  )

  // A place the point has moved away from, or whose category went off, has no row and no marker left to highlight.
  useEffect(() => {
    if (selection && !rows.some(({ place }) => place.id === selection.place.id)) setSelection(null)
  }, [rows])

  const select = (place: Place, source: Selection['source']) => {
    setSelection({ place, source })
    // A marker can belong to a row that doesn't show yet.
    const rank = rows.findIndex((row) => row.place.id === place.id)
    setShown((current) => Math.max(current, (Math.floor(rank / pageSize) + 1) * pageSize))
  }

  const toggleCategory = (id: CategoryId) =>
    setCategoriesOff((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })

  return {
    rows,
    categoriesOff,
    toggleCategory,
    allCategoriesOn: () => setCategoriesOff(new Set()),
    shown,
    showMore: () => setShown((current) => current + pageSize),
    selection,
    select,
    statusOf: (place: Place) => openStatus(place.hours, loader.hoursWindowStart, now),
    failed: loader.failed,
    retry: loader.retry,
    wikiLink: (place: Place) => wikiLink(place.wiki, phone, loader.wikiTitles),
  }
}
