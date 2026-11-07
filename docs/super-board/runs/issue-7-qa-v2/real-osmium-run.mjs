// Runs the three osmium command lines from scripts/data/osm.ts for real, and compares the places with
// expectations built here, not by the code under test. QA wrote it for #7. Nothing imports it.
//
// node real-osmium-run.mjs <checkout> <osmium binary> <new empty folder>
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const [checkout, osmium, work] = process.argv.slice(2).map((arg) => resolve(arg))

// The repo's imports leave off the extension, as Vite allows.
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context)
    } catch (error) {
      if (specifier.startsWith('.')) return next(`${specifier}.ts`, context)
      throw error
    }
  },
})
const load = (path) => import(pathToFileURL(join(checkout, path)).href)
const { extractArgs, tagsFilterArgs, exportArgs, EXPORT_CONFIG, placesFromExport } = await load('scripts/data/osm.ts')
const { CATEGORY_RULES, tagsFilterExpressions } = await load('scripts/data/categories.ts')

const run = (args) => {
  execFileSync(osmium, args, { stdio: 'pipe' })
}
const log = (line = '') => console.log(line)

/** The filter as it was before c50733b: one expression per key. */
function mergedExpressions() {
  const byKey = new Map()
  for (const { key, values } of CATEGORY_RULES) {
    const seen = byKey.get(key) ?? []
    byKey.set(key, seen === 'any' || values === 'any' ? 'any' : [...seen, ...values])
  }
  return [...byKey].map(([key, values]) => (values === 'any' ? `nwr/${key}` : `nwr/${key}=${values.join(',')}`))
}

// ===== the input: every table value as a node and a closed way, every rule as a two-ring relation

const nodes = []
const ways = []
const relations = []
const expected = new Map()
let nodeId = 1000
let wayId = 100
let relationId = 300
let slot = 0
let clockwiseDrawn = 0

const tagsXml = (tags) =>
  Object.entries(tags)
    .map(([k, v]) => `<tag k="${k}" v="${v}"/>`)
    .join('')
const addNode = (lon, lat, tags = {}) => {
  const id = ++nodeId
  nodes.push(`<node id="${id}" version="1" lat="${lat.toFixed(7)}" lon="${lon.toFixed(7)}">${tagsXml(tags)}</node>`)
  return id
}
const addRect = (west, south, size, tags = {}, clockwise = false) => {
  const corners = [
    [west, south],
    [west + size, south],
    [west + size, south + size],
    [west, south + size],
  ]
  if (clockwise) corners.reverse()
  const ids = corners.map(([lon, lat]) => addNode(lon, lat))
  const id = ++wayId
  ways.push(`<way id="${id}" version="1">${[...ids, ids[0]].map((ref) => `<nd ref="${ref}"/>`).join('')}${tagsXml(tags)}</way>`)
  return { id, lon: west + size / 2, lat: south + size / 2 }
}
const nextCell = () => {
  const cell = slot++
  return { lon: 19.0 + (cell % 50) * 0.003, lat: 47.4 + Math.floor(cell / 50) * 0.003 }
}

const round5 = (value) => Math.round(value * 1e5) / 1e5
const expect = (id, cat, kind, name, lat, lon) => expected.set(id, { cat, kind, name, lat: round5(lat), lon: round5(lon) })

// Two values stand in for "any value".
const ruleValues = (rule) => (rule.values === 'any' ? (rule.key === 'historic' ? ['castle', 'boundary_stone'] : ['books', 'vintage']) : rule.values)

for (const rule of CATEGORY_RULES) {
  for (const value of ruleValues(rule)) {
    const tag = { [rule.key]: value }

    const point = nextCell()
    const nodeName = `N ${rule.key} ${value}`
    const pointId = addNode(point.lon, point.lat, { name: nodeName, ...tag })
    expect(`n${pointId}`, rule.cat, value, nodeName, point.lat, point.lon)

    const cell = nextCell()
    const wayName = `W ${rule.key} ${value}`
    // Every fourth tagged way is drawn clockwise, to see which way round osmium writes it.
    const drawnClockwise = expected.size % 4 === 1
    if (drawnClockwise) clockwiseDrawn += 1
    const way = addRect(cell.lon, cell.lat, 0.001, { name: wayName, ...tag }, drawnClockwise)
    expect(`w${way.id}`, rule.cat, value, wayName, way.lat, way.lon)

    const parts = nextCell()
    const relationName = `R ${rule.key} ${value}`
    // The small ring has the lower way id, so it comes first in the relation.
    const small = addRect(parts.lon, parts.lat, 0.0002)
    const large = addRect(parts.lon + 0.001, parts.lat + 0.001, 0.001)
    const id = ++relationId
    relations.push(
      `<relation id="${id}" version="1"><member type="way" ref="${small.id}" role="outer"/><member type="way" ref="${large.id}" role="outer"/>${tagsXml({ type: 'multipolygon', name: relationName, ...tag })}</relation>`,
    )
    expect(`r${id}`, rule.cat, value, relationName, large.lat, large.lon)
  }
}

// What must not come out: tags outside the table, and a place outside the box.
const controls = [
  ['office', 'company'],
  ['amenity', 'parking'],
  ['tourism', 'hotel'],
  ['leisure', 'pitch'],
  ['highway', 'bus_stop'],
  ['shop', 'vacant'],
]
const controlIds = []
for (const [key, value] of controls) {
  const point = nextCell()
  controlIds.push(`n${addNode(point.lon, point.lat, { name: `Control ${key} ${value}`, [key]: value })}`)
  const cell = nextCell()
  controlIds.push(`w${addRect(cell.lon, cell.lat, 0.001, { name: `Control way ${key} ${value}`, [key]: value }).id}`)
}
controlIds.push(`n${addNode(18.75, 47.79, { name: 'Esztergom', tourism: 'attraction' })}`)
// An open way has no position. osmium writes it as a LineString, and it's left out.
const openIds = ['a', 'b', 'c'].map((_, i) => addNode(19.3 + i * 0.001, 47.6))
const openId = ++wayId
ways.push(`<way id="${openId}" version="1">${openIds.map((ref) => `<nd ref="${ref}"/>`).join('')}${tagsXml({ name: 'Open way', historic: 'citywalls' })}</way>`)
controlIds.push(`w${openId}`)

const input = join(work, 'every-table-value.osm')
writeFileSync(input, `<?xml version='1.0' encoding='UTF-8'?>\n<osm version="0.6" generator="QA">\n${[...nodes, ...ways, ...relations].join('\n')}\n</osm>\n`)
const config = join(work, 'export.json')
writeFileSync(config, JSON.stringify(EXPORT_CONFIG))

/** The three real command lines, from the code under test. The tags-filter's expressions can be swapped. */
function pipeline(source, label, expressions) {
  const box = join(work, `${label}-box.osm.pbf`)
  const filtered = join(work, `${label}-places.osm.pbf`)
  const exported = join(work, `${label}.geojsonseq`)
  run(extractArgs(source, box))
  const filterArgs = tagsFilterArgs(box, filtered)
  run(expressions ? ['tags-filter', box, ...expressions, '-o', filtered] : filterArgs)
  run(exportArgs(filtered, config, exported))
  return readFileSync(exported, 'utf8')
}

const signedArea = (ring) => ring.slice(0, -1).reduce((sum, [x1, y1], i) => sum + x1 * ring[i + 1][1] - ring[i + 1][0] * y1, 0) / 2
const metres = (a, b) => {
  const rad = Math.PI / 180
  const h = Math.sin(((b[1] - a[1]) * rad) / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(((b[0] - a[0]) * rad) / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.sqrt(h))
}
const centre = (ring) => {
  const corners = ring.slice(0, -1)
  return [corners.reduce((s, c) => s + c[0], 0) / corners.length, corners.reduce((s, c) => s + c[1], 0) / corners.length]
}
const byId = (list) => [...list].sort((a, b) => a.id.localeCompare(b.id))

log(`osmium: ${execFileSync(osmium, ['version'], { encoding: 'utf8' }).split('\n').slice(0, 2).join(' · ')}`)
log(`Input: ${nodes.length} nodes, ${ways.length} ways and ${relations.length} relations, generated by this script. It isn't real OpenStreetMap data.`)
log(`Expected: ${expected.size} places. Controls that must not come out: ${controlIds.length}.`)
log()
log('$ osmium ' + extractArgs('input', 'box').join(' '))
log('$ osmium ' + tagsFilterArgs('box', 'places').join(' '))
log('$ osmium ' + exportArgs('places', 'export.json', 'out').join(' '))
log()

let failures = 0
const check = (ok, line) => {
  log(`${ok ? 'ok  ' : 'FAIL'} ${line}`)
  if (!ok) failures += 1
}

// ===== A: the per-rule filter, over every table value

const text = pipeline(input, 'per-rule')
const raw = text.trimEnd().split('\n').map((line) => JSON.parse(line))
const places = placesFromExport(text)
const got = new Map(places.map((place) => [place.id, place]))

log('===== A. The per-rule filter over every table value')
check(!text.includes('\u001e'), `no RS byte in the output, ${raw.length} lines`)
check(places.length === expected.size, `${places.length} places, ${expected.size} expected`)
const missing = [...expected.keys()].filter((id) => !got.has(id))
check(missing.length === 0, `every expected place came out${missing.length ? `, missing: ${missing.join(' ')}` : ''}`)
const wrong = [...expected].filter(([id, want]) => {
  const place = got.get(id)
  return place && !(place.cat === want.cat && place.kind === want.kind && place.name === want.name && place.lat === want.lat && place.lon === want.lon)
})
check(wrong.length === 0, `every place has the expected cat, kind, name and position${wrong.length ? `, wrong: ${wrong.map(([id]) => `${id} ${JSON.stringify(got.get(id))}`).join(' ')}` : ''}`)
const leaked = controlIds.filter((id) => got.has(id))
check(leaked.length === 0, `no control came out as a place${leaked.length ? `, leaked: ${leaked.join(' ')}` : ''}`)
const extra = places.filter((place) => !expected.has(place.id))
check(extra.length === 0, `no place beyond the expected ones${extra.length ? `: ${extra.map((p) => p.id).join(' ')}` : ''}`)

const perExpression = tagsFilterExpressions().map((expression) => {
  const [key, list] = expression.slice('nwr/'.length).split('=')
  const reached = raw.filter((feature) => feature.properties[key] !== undefined && (list === undefined || list.split(',').includes(feature.properties[key]))).length
  return { expression: list === undefined ? expression : `nwr/${key}=(${list.split(',').length} values)`, reached }
})
log()
log('Features each of the expressions reaches:')
for (const { expression, reached } of perExpression) log(`  ${expression}: ${reached}`)
check(perExpression.every(({ reached }) => reached > 0), 'every expression reaches at least one feature')

// ===== B: the two filter shapes, R2

log()
log('===== B. R2: the per-rule filter against the merged one it replaced')
const merged = mergedExpressions()
const mergedPlaces = placesFromExport(pipeline(input, 'merged', merged))
log(`merged: ${merged.length} expressions · per-rule: ${tagsFilterExpressions().length} expressions`)
check(JSON.stringify(byId(mergedPlaces)) === JSON.stringify(byId(places)), `the same ${mergedPlaces.length} places from both`)

// ===== C: the surviving filter mutant

log()
log('===== C. Mutant F-4: one expression dropped from the filter')
const redundant = tagsFilterExpressions().filter((expression) => expression.startsWith('nwr/shop='))
for (const dropped of redundant) {
  const without = tagsFilterExpressions().filter((expression) => expression !== dropped)
  const label = `without-${redundant.indexOf(dropped)}`
  const kept = placesFromExport(pipeline(input, label, without))
  check(JSON.stringify(byId(kept)) === JSON.stringify(byId(places)), `dropping ${dropped.split('=')[0]}=(${dropped.split(',').length} values) gives the same ${kept.length} places, as nwr/shop already keeps them`)
}
const amenity = tagsFilterExpressions().find((expression) => expression.startsWith('nwr/amenity=pharmacy'))
const lost = placesFromExport(pipeline(input, 'without-amenity', tagsFilterExpressions().filter((expression) => expression !== amenity)))
check(lost.length < places.length, `control: dropping a list that nothing else covers, nwr/amenity=pharmacy,..., loses ${places.length - lost.length} places`)

// ===== D: the ring order, R1

log()
log('===== D. R1: which ring osmium writes first')
const multi = raw.filter((feature) => feature.geometry.type === 'MultiPolygon' && feature.geometry.coordinates.length > 1)
const smallFirst = multi.filter((feature) => {
  const [first, second] = feature.geometry.coordinates.map(([outer]) => Math.abs(signedArea(outer)))
  return first < second
})
log(`${multi.length} features with two outer rings · small ring first on ${smallFirst.length}, large ring first on ${multi.length - smallFirst.length}`)
check(multi.length > 0, 'the export has features with several outer rings')
const outerRings = raw.flatMap((feature) => (feature.geometry.type === 'MultiPolygon' ? feature.geometry.coordinates.map(([outer]) => outer) : []))
const clockwise = outerRings.filter((ring) => signedArea(ring) < 0).length
log(`${outerRings.length} outer rings · ${clockwise} written clockwise, though ${clockwiseDrawn} tagged ways are drawn clockwise in the input`)
check(clockwiseDrawn > 0 && clockwise === 0, 'osmium turned every clockwise ring counter-clockwise')

// ===== E: QA's v1 input, the file the Builder ran

const v1Input = join(checkout, 'docs/super-board/runs/issue-7-qa-v1/real-osmium-input.osm')
const v1Text = pipeline(v1Input, 'v1')
const v1Raw = v1Text.trimEnd().split('\n').map((line) => JSON.parse(line))
const v1Places = placesFromExport(v1Text)
log()
log('===== E. v1\'s hand-written input, on the per-rule filter')
check(v1Places.length === 11, `${v1Places.length} places, as in issue-7-qa-v1/real-osmium.txt`)
const a609 = v1Raw.find((feature) => feature.id === 'a609')
const [firstRing, secondRing] = a609.geometry.coordinates.map(([outer]) => outer)
log(`a609 ${a609.properties.name}: first ring area ${Math.abs(signedArea(firstRing)).toExponential(2)}, second ring area ${Math.abs(signedArea(secondRing)).toExponential(2)}`)
check(Math.abs(signedArea(firstRing)) < Math.abs(signedArea(secondRing)), 'a609 has the small ring first, as commit 251d5a9 says')
const r304 = v1Places.find((place) => place.id === 'r304')
const wrongPlace = centre(firstRing)
log(`r304 comes out at ${r304.lat}, ${r304.lon}. The break R1 names would put it at ${round5(wrongPlace[1])}, ${round5(wrongPlace[0])}, ${Math.round(metres([r304.lon, r304.lat], wrongPlace))} m away`)
check(Math.abs(r304.lat - centre(secondRing)[1]) < 1e-4 && Math.abs(r304.lon - centre(secondRing)[0]) < 1e-4, 'r304 is at the large ring')

log()
log(failures === 0 ? 'Result: every check passed.' : `Result: ${failures} checks FAILED.`)
process.exitCode = failures === 0 ? 0 : 1
