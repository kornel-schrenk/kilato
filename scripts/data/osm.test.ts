import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CATEGORY_RULES } from './categories'
import { exportArgs, EXPORT_CONFIG, extractArgs, placesFromExport, tagsFilterArgs } from './osm'

const sample = readFileSync(join(import.meta.dirname, '../../test/fixtures/osm/sample.geojsonseq'), 'utf8')
const places = placesFromExport(sample)
const features = sample.trimEnd().split('\n').map((line) => JSON.parse(line))

const placeNamed = (name: string) => places.find((place) => place.name === name)
const hasFeature = (id: string) => features.some((feature) => feature.id === id)

/** One export line with a node at the given position, the way osmium writes it. */
const nodeLine = (lat: number, lon: number, tags: Record<string, string> = { name: 'Hely', amenity: 'cafe' }) =>
  JSON.stringify({ type: 'Feature', id: 'n1', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: tags })

const areaLine = (id: string, coordinates: number[][][][]) =>
  JSON.stringify({
    type: 'Feature',
    id,
    geometry: { type: 'MultiPolygon', coordinates },
    properties: { name: 'Hely', amenity: 'cafe' },
  })

const rect = (west: number, south: number, east: number, north: number) => [
  [west, south],
  [east, south],
  [east, north],
  [west, north],
  [west, south],
]

describe('placesFromExport, fed the sample', () => {
  it('returns one place per kept feature', () => {
    // 71 places for the table's values, 2 for names, 3 for first-match, 1 vacant-but-historic and 4 areas.
    expect(places).toHaveLength(81)
    expect(new Set(places.map((place) => place.id)).size).toBe(81)
  })

  it('gives a node exactly the fields it has', () => {
    expect(placeNamed('Minta Szobor')).toEqual({
      id: expect.stringMatching(/^n\d+$/),
      cat: 'sights',
      kind: 'artwork',
      lat: expect.any(Number),
      lon: expect.any(Number),
      name: 'Minta Szobor',
    })
  })

  it('rounds the coordinates osmium wrote with 7 decimals to 5', () => {
    expect(features.find((feature) => feature.properties.name === 'Minta Múzeum').geometry.coordinates).toEqual([19.0534566, 47.4981456])
    expect(placeNamed('Minta Múzeum')).toMatchObject({ lat: 47.49815, lon: 19.05346 })
  })

  it('lets the first matching rule set the category and the kind', () => {
    expect(placeNamed('Múzeumkávézó')).toMatchObject({ cat: 'sights', kind: 'museum' })
    expect(placeNamed('Kávézó Pékség')).toMatchObject({ cat: 'food', kind: 'cafe' })
    expect(placeNamed('Könyves Mozi')).toMatchObject({ cat: 'leisure', kind: 'cinema' })
  })

  it('turns area ids into way and relation ids', () => {
    expect(placeNamed('Magyar Állami Operaház')?.id).toBe('w1200000100')
    expect(placeNamed('Gresham-palota')?.id).toBe('w1200000200')
    expect(placeNamed('Erzsébet tér')?.id).toBe('r120000300')
    expect(placeNamed('Minta Udvar')?.id).toBe('w1200000400')
  })

  it('places a polygon at the area-weighted centroid of its outer ring', () => {
    // An L of two rectangles, 3 by 1 and 1 by 2, in units of 0.001° from 19.05, 47.495.
    // (3 × 1.5 + 2 × 0.5) / 5 = 1.1 east, (3 × 0.5 + 2 × 2) / 5 = 1.1 north. Its six corners average 1.333.
    expect(placeNamed('Minta Udvar')).toMatchObject({ lat: 47.4961, lon: 19.0511 })
  })

  it('places a multipolygon at the centroid of its largest outer ring, ignoring the hole', () => {
    expect(placeNamed('Erzsébet tér')).toMatchObject({ lat: 47.4984, lon: 19.0525 })
  })

  it('keeps the wikidata, wikipedia and opening_hours tags', () => {
    expect(placeNamed('Magyar Állami Operaház')).toMatchObject({
      wikidata: 'Q36833',
      wikipedia: 'hu:Magyar Állami Operaház',
      opening_hours: 'Mo-Su 10:00-20:00',
    })
    expect(placeNamed('Gresham-palota')).toMatchObject({ wikipedia: 'en:Gresham_Palace' })
    expect(placeNamed('Minta Gyógyszertár')?.opening_hours).toBe('24/7')
    expect(placeNamed('Minta Fodrászat')?.opening_hours).toBe('ask inside')
  })

  it('keeps names.hu and names.en only when they differ from name', () => {
    expect(placeNamed('Hungarian Bistro')?.names).toEqual({ hu: 'Magyar Bisztró' })
    expect(placeNamed('Minta Falatozó')?.names).toEqual({ en: 'Sample Diner' })
    expect(placeNamed('Minta Mozi')).not.toHaveProperty('names')
  })

  it.each([
    ['an unnamed node', 'n2000002001', 'n2000002001'],
    ['an unnamed area', 'a2400001000', 'w1200000500'],
    ['memorial=plaque', 'n2000002002', 'n2000002002'],
    ['memorial:type=plaque', 'n2000002003', 'n2000002003'],
    ['memorial=stolperstein', 'n2000002004', 'n2000002004'],
    ['memorial:type=stolperstein', 'n2000002005', 'n2000002005'],
    ['shop=vacant', 'n2000002006', 'n2000002006'],
    ['an open way', 'w2000003001', 'w2000003001'],
    ['a feature outside the coverage box', 'n2000002007', 'n2000002007'],
    ['a named node the table does not list', 'n2000002008', 'n2000002008'],
    ['an office', 'n2000002009', 'n2000002009'],
    ['an amenity the table does not list', 'n2000002010', 'n2000002010'],
  ])('leaves out %s', (_label, featureId, placeId) => {
    expect(hasFeature(featureId)).toBe(true)
    expect(places.map((place) => place.id)).not.toContain(placeId)
  })

  it('still keeps a memorial that is not a plaque or a stolperstein', () => {
    expect(placeNamed('Minta Emlékhely')).toMatchObject({ cat: 'sights', kind: 'memorial' })
  })

  it('files a vacant shop in a listed building under the rule that matches it', () => {
    expect(placeNamed('Régi Üzletház')).toMatchObject({ cat: 'sights', kind: 'building' })
  })
})

describe('placesFromExport, on single lines', () => {
  it('rounds coordinates to 5 decimals', () => {
    expect(placesFromExport(nodeLine(47.4975432, 19.0545678))[0]).toMatchObject({ lat: 47.49754, lon: 19.05457 })
  })

  it('keeps a point on the edge of the coverage box and leaves out one just past it', () => {
    const kept = (lat: number, lon: number) => placesFromExport(nodeLine(lat, lon)).length === 1
    expect(kept(47.35, 19.1)).toBe(true)
    expect(kept(47.62, 19.1)).toBe(true)
    expect(kept(47.5, 18.925)).toBe(true)
    expect(kept(47.5, 19.335)).toBe(true)
    expect(kept(47.34999, 19.1)).toBe(false)
    expect(kept(47.62001, 19.1)).toBe(false)
    expect(kept(47.5, 18.92499)).toBe(false)
    expect(kept(47.5, 19.33501)).toBe(false)
  })

  it('leaves out an area whose centroid is outside the box, even when a corner is inside', () => {
    expect(placesFromExport(areaLine('a2', [[rect(18.9, 47.5, 18.93, 47.51)]]))).toEqual([])
  })

  it('gets the same centroid from a clockwise ring', () => {
    const ring = [[19.05, 47.495], [19.053, 47.495], [19.053, 47.496], [19.051, 47.496], [19.051, 47.498], [19.05, 47.498], [19.05, 47.495]]
    expect(placesFromExport(areaLine('a2', [[ring.toReversed()]]))[0]).toMatchObject({ lat: 47.4961, lon: 19.0511 })
  })

  it('keeps its accuracy on a small building', () => {
    // A building about 7 m square. The products of whole coordinates would swamp an area this small.
    const place = placesFromExport(areaLine('a2', [[rect(19.0545, 47.4975, 19.0546, 47.49756)]]))[0]
    expect(place).toMatchObject({ lat: 47.49753, lon: 19.05455 })
  })

  it('leaves out a ring with no area instead of giving it no position', () => {
    const flat = [[19.05, 47.5], [19.051, 47.5], [19.05, 47.5]]
    expect(placesFromExport(areaLine('a2', [[flat]]))).toEqual([])
  })

  it('treats an odd area id as a relation and an even one as a way', () => {
    expect(placesFromExport(areaLine('a7', [[rect(19.05, 47.5, 19.051, 47.501)]]))[0]?.id).toBe('r3')
    expect(placesFromExport(areaLine('a8', [[rect(19.05, 47.5, 19.051, 47.501)]]))[0]?.id).toBe('w4')
  })

  it('reads several lines and ignores the last line break', () => {
    expect(placesFromExport(`${nodeLine(47.5, 19.05)}\n${nodeLine(47.5, 19.06)}\n`)).toHaveLength(2)
  })

  it('returns nothing for an empty export', () => {
    expect(placesFromExport('')).toEqual([])
  })
})

describe('the sample fixture', () => {
  const values = (key: string) => features.map((feature) => feature.properties[key]).filter(Boolean)
  const tagged = (key: string, value: string) =>
    places.filter((place) => features.find((f) => f.properties.name === place.name)?.properties[key] === value)

  it('has a kept place for every value in the category table', () => {
    const missing = CATEGORY_RULES.flatMap(({ cat, key, values: ruleValues }) =>
      ruleValues === 'any'
        ? places.some((place) => place.cat === cat && values(key).includes(place.kind)) ? [] : [`${key}=*`]
        : ruleValues.filter((value) => !tagged(key, value).some((place) => place.cat === cat)).map((value) => `${key}=${value}`),
    )
    expect(missing).toEqual([])
  })

  it('has a shop and a historic place with values only the catch-all rules match', () => {
    expect(placeNamed('Minta Retró Bolt')).toMatchObject({ cat: 'shops', kind: 'vintage' })
    expect(placeNamed('Minta Határkő')).toMatchObject({ cat: 'sights', kind: 'boundary_stone' })
  })

  it('has a polygon, a multipolygon with several outer rings, an open way and all three kinds of place id', () => {
    const geometries = features.map((feature) => feature.geometry.type)
    expect(geometries).toEqual(expect.arrayContaining(['Point', 'LineString', 'Polygon', 'MultiPolygon']))
    expect(features.some((feature) => feature.geometry.type === 'MultiPolygon' && feature.geometry.coordinates.length > 1)).toBe(true)
    expect(new Set(places.map((place) => place.id[0]))).toEqual(new Set(['n', 'w', 'r']))
  })

  it('has the other tags the build keeps or drops', () => {
    expect(values('name:en').length).toBeGreaterThan(0)
    expect(values('wikidata').length).toBeGreaterThan(0)
    expect(values('wikipedia').length).toBeGreaterThan(0)
    expect(values('opening_hours')).toEqual(expect.arrayContaining(['24/7', 'ask inside', 'Mo-Fr 09:00-17:00 unknown "call ahead"']))
  })

  it('keeps everything within 1 km of Deák Ferenc tér, apart from the feature outside the box', () => {
    const positions = (coordinates: unknown): number[][] =>
      typeof (coordinates as unknown[])[0] === 'number'
        ? [coordinates as number[]]
        : (coordinates as unknown[]).flatMap(positions)
    const metresFromDeak = ([lon, lat]: number[]) => {
      const rad = Math.PI / 180
      const a =
        Math.sin(((lat - 47.4975) * rad) / 2) ** 2 +
        Math.cos(47.4975 * rad) * Math.cos(lat * rad) * Math.sin(((lon - 19.0545) * rad) / 2) ** 2
      return 2 * 6371000 * Math.asin(Math.sqrt(a))
    }
    const farAway = features.filter((feature) =>
      positions(feature.geometry.coordinates).some((position) => metresFromDeak(position) > 1000),
    )
    expect(farAway.map((feature) => feature.id)).toEqual(['n2000002007'])
  })
})

describe('the osmium command lines', () => {
  it('cuts the coverage box out of the extract', () => {
    const args = extractArgs('hungary.osm.pbf', 'box.osm.pbf')
    expect(args[0]).toBe('extract')
    expect(args.join(' ')).toContain('-s smart -b 18.925,47.35,19.335,47.62')
    expect(args).toContain('hungary.osm.pbf')
    expect(args.join(' ')).toContain('-o box.osm.pbf')
  })

  it('filters by the expressions the table generates', () => {
    const args = tagsFilterArgs('box.osm.pbf', 'places.osm.pbf')
    expect(args[0]).toBe('tags-filter')
    expect(args[1]).toBe('box.osm.pbf')
    expect(args).toEqual(expect.arrayContaining(['nwr/historic', 'nwr/shop']))
    expect(args.find((arg) => arg.startsWith('nwr/amenity='))).toContain('cafe')
    expect(args.join(' ')).toContain('-o places.osm.pbf')
  })

  it('exports one GeoJSON feature per line, with type ids and no record separator', () => {
    const args = exportArgs('places.osm.pbf', 'export.json', 'places.geojsonseq')
    expect(args[0]).toBe('export')
    expect(args.join(' ')).toContain('-f geojsonseq --add-unique-id=type_id -x print_record_separator=false')
    expect(args.join(' ')).toContain('-c export.json')
    expect(args).toContain('places.osm.pbf')
    expect(args.join(' ')).toContain('-o places.geojsonseq')
  })

  it('tells osmium to write no linear features', () => {
    expect(EXPORT_CONFIG.linear_tags).toBe(false)
  })
})
