import { distanceMetres, type LatLon } from './geo'
import type { SearchFile } from './types'

export type SearchPlace = SearchFile['places'][number]

const shortestQuery = 2
const mostResults = 20

/** NFD splits á into a and its accent, and Hungarian ő and ű the same way, so the accents can go. */
const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/**
 * A search over these places. It finds the places with the query in a name: those with a name
 * beginning with it first, then the rest, each nearest the point first.
 *
 * The names are folded once, here. Folding all 30,000 on every keystroke took 250 ms on a Raspberry Pi.
 */
export function placeSearch(places: SearchPlace[]) {
  const entries = places.map((place) => ({
    place,
    names: [place.name, place.names?.hu, place.names?.en].filter((name) => name !== undefined).map(fold),
  }))

  return (query: string, point: LatLon): SearchPlace[] => {
    const wanted = fold(query.trim())
    if (wanted.length < shortestQuery) return []
    return entries
      .filter(({ names }) => names.some((name) => name.includes(wanted)))
      .map(({ place, names }) => ({
        place,
        begins: names.some((name) => name.startsWith(wanted)),
        metres: distanceMetres(point, place),
      }))
      .sort((a, b) => Number(b.begins) - Number(a.begins) || a.metres - b.metres)
      .slice(0, mostResults)
      .map(({ place }) => place)
  }
}
