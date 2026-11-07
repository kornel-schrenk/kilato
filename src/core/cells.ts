// With its extension: the data build runs this file in Node, which doesn't guess one.
import { distanceMetres, type LatLon } from './geo.ts'

/** The key of the 0.01° by 0.015° cell around a point. The build and the page must share it. */
export function cellKey(lat: number, lon: number): string {
  return `${Math.floor(lat * 100)}_${Math.floor((lon * 200) / 3)}`
}

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high)

/** The cells among `keys` holding ground within `metres` of a point. For 1 km in Budapest, that is at most 3 × 3. */
export function cellsWithin(keys: string[], point: LatLon, metres: number): string[] {
  return keys.filter((key) => {
    const [row, col] = key.split('_').map(Number)
    const nearest = {
      lat: clamp(point.lat, row / 100, (row + 1) / 100),
      lon: clamp(point.lon, (col * 3) / 200, ((col + 1) * 3) / 200),
    }
    return distanceMetres(point, nearest) <= metres
  })
}
