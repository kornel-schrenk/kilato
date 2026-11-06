import type { LatLon } from './geo'

/** Budapest: the box the data build cuts out, and the page treats a point inside it as covered. */
export const coverageBox = { west: 18.925, south: 47.35, east: 19.335, north: 47.62 }

export function inCoverage({ lat, lon }: LatLon): boolean {
  return lat >= coverageBox.south && lat <= coverageBox.north && lon >= coverageBox.west && lon <= coverageBox.east
}
