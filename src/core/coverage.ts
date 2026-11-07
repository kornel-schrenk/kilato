import type { LatLon } from './geo'
import type { Manifest } from './types'

/** Budapest: west, south, east, north. The build cuts the data with it, and the page treats a point inside it as covered. */
export const COVERAGE_BOX: Manifest['box'] = [18.925, 47.35, 19.335, 47.62]

const [west, south, east, north] = COVERAGE_BOX

export function inCoverage({ lat, lon }: LatLon): boolean {
  return lat >= south && lat <= north && lon >= west && lon <= east
}
