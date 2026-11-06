import { COVERAGE_BOX } from '../../src/core/coverage.ts'
import type { Place } from '../../src/core/types'
import { categorize, tagsFilterExpressions, type Tags } from './categories.ts'


/**
 * The config file for `exportArgs`. It makes closed ways areas, unless they're tagged `area=no`.
 * osmium still writes open ways, as `LineString`, so `placesFromExport` leaves those out.
 */
export const EXPORT_CONFIG = { linear_tags: false }

export function extractArgs(pbf: string, output: string): string[] {
  return ['extract', '-s', 'smart', '-b', COVERAGE_BOX.join(','), pbf, '-o', output]
}

export function tagsFilterArgs(input: string, output: string): string[] {
  return ['tags-filter', input, ...tagsFilterExpressions(), '-o', output]
}

export function exportArgs(input: string, config: string, output: string): string[] {
  return ['export', '-f', 'geojsonseq', '--add-unique-id=type_id', '-x', 'print_record_separator=false', '-c', config, input, '-o', output]
}

/** A place before the merge and the hours, still carrying the tags those steps read. */
export interface OsmPlace extends Omit<Place, 'hours' | 'wiki'> {
  wikidata?: string
  wikipedia?: string
  opening_hours?: string
}

type Position = number[] // lon, lat
type Ring = Position[]

interface Feature {
  id: string
  geometry:
    | { type: 'Point'; coordinates: Position }
    | { type: 'LineString'; coordinates: Position[] }
    | { type: 'Polygon'; coordinates: Ring[] }
    | { type: 'MultiPolygon'; coordinates: Ring[][] }
  properties: Tags
}

const LEFT_OUT_MEMORIALS = ['plaque', 'stolperstein']

const isLeftOutMemorial = (tags: Tags) =>
  [tags.memorial, tags['memorial:type']].some((value) => value !== undefined && LEFT_OUT_MEMORIALS.includes(value))

/** libosmium numbers an area 2 × way id, or 2 × relation id + 1. */
function placeId(id: string): string {
  if (!id.startsWith('a')) return id
  const area = Number(id.slice(1))
  return area % 2 === 0 ? `w${area / 2}` : `r${(area - 1) / 2}`
}

/** The area-weighted centroid. It works from the first corner, so tiny buildings keep their precision. */
function ringCentroid(ring: Ring): { position: Position; area: number } {
  const [originLon, originLat] = ring[0]
  let doubleArea = 0
  let lon = 0
  let lat = 0
  for (let i = 0; i < ring.length - 1; i++) {
    const x1 = ring[i][0] - originLon
    const y1 = ring[i][1] - originLat
    const x2 = ring[i + 1][0] - originLon
    const y2 = ring[i + 1][1] - originLat
    const cross = x1 * y2 - x2 * y1
    doubleArea += cross
    lon += (x1 + x2) * cross
    lat += (y1 + y2) * cross
  }
  return {
    position: [originLon + lon / (3 * doubleArea), originLat + lat / (3 * doubleArea)],
    area: Math.abs(doubleArea) / 2,
  }
}

/** The centroid of the outer ring. A multipolygon with several outer rings uses the largest. */
function polygonPosition(polygons: Ring[][]): Position {
  const outerRings = polygons.map(([outer]) => ringCentroid(outer))
  return outerRings.reduce((largest, ring) => (ring.area > largest.area ? ring : largest)).position
}

/** osmium writes `MultiPolygon` for every area, closed ways too. Open ways have no position. */
function featurePosition({ type, coordinates }: Feature['geometry']): Position | undefined {
  if (type === 'Point') return coordinates
  if (type === 'Polygon') return polygonPosition([coordinates])
  if (type === 'MultiPolygon') return polygonPosition(coordinates)
  return undefined
}

function inCoverageBox([lon, lat]: Position): boolean {
  const [west, south, east, north] = COVERAGE_BOX
  return lon >= west && lon <= east && lat >= south && lat <= north
}

/** Coordinates to 5 decimals, about 1 m. */
export const round5 = (value: number) => Math.round(value * 1e5) / 1e5

function placeFromFeature({ id, geometry, properties: tags }: Feature): OsmPlace | undefined {
  const { name } = tags
  if (!name || isLeftOutMemorial(tags)) return undefined

  const match = categorize(tags)
  const position = featurePosition(geometry)
  // ponytail: a ring with no area has a NaN position, which fails the box check, so it's left out too.
  if (!match || !position || !inCoverageBox(position)) return undefined

  const place: OsmPlace = { id: placeId(id), ...match, lat: round5(position[1]), lon: round5(position[0]), name }

  const names: NonNullable<Place['names']> = {}
  for (const lang of ['hu', 'en'] as const) {
    const translated = tags[`name:${lang}`]
    if (translated && translated !== name) names[lang] = translated
  }
  if (names.hu || names.en) place.names = names

  for (const key of ['wikidata', 'wikipedia', 'opening_hours'] as const) {
    const value = tags[key]
    if (value) place[key] = value
  }
  return place
}

/** Turns the text of `osmium export` into places, one for each feature that is kept. */
export function placesFromExport(geojsonseq: string): OsmPlace[] {
  return geojsonseq
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => placeFromFeature(JSON.parse(line) as Feature) ?? [])
}
