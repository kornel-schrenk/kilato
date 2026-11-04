// `npm run data:build -- --pbf <file> --out <dir>` runs the whole build. It needs `osmium` on the path.
// Node runs it without a build, so these imports name the .ts files.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { hoursInWindow, windowStartOn } from './hours.ts'
import { mergeArticles } from './merge.ts'
import { COVERAGE_BOX, EXPORT_CONFIG, exportArgs, extractArgs, placesFromExport, tagsFilterArgs, type OsmPlace } from './osm.ts'
import { fetchArticles, type Article, type Fetch } from './wikipedia.ts'
import { writeData } from './write.ts'

const MINIMUMS = { places: 5_000, articles: 1_500 }

/** Where a build's data comes from. A build with no `minimums` writes however little it gets. */
export interface Sources {
  geojsonseq: string // the text of `osmium export`
  osmDataAt: string
  fetchArticles: () => Promise<Article[]>
  now: () => Date
  minimums?: typeof MINIMUMS
}

function withHours(place: OsmPlace, windowStart: Date) {
  return place.opening_hours ? { ...place, hours: hoursInWindow(windowStart, place.opening_hours) } : place
}

/** Everything both builds share. It writes nothing until every check has passed, so the last good data stays. */
export async function buildTree({ geojsonseq, osmDataAt, fetchArticles, now, minimums }: Sources, out: string) {
  const osmPlaces = placesFromExport(geojsonseq)
  if (minimums && osmPlaces.length < minimums.places) {
    throw new Error(`${osmPlaces.length} places from OpenStreetMap, fewer than ${minimums.places}`)
  }

  const startedAt = now()
  const articles = await fetchArticles()
  if (minimums && articles.length < minimums.articles) {
    throw new Error(`${articles.length} articles from Wikipedia, fewer than ${minimums.articles}`)
  }

  const windowStart = windowStartOn(startedAt)
  const places = mergeArticles(
    osmPlaces.map((place) => withHours(place, windowStart)),
    articles,
  )

  writeData(out, {
    builtAt: now().toISOString(),
    osmDataAt,
    wikipediaAt: startedAt.toISOString(),
    hoursWindowStart: windowStart.toISOString(),
    box: COVERAGE_BOX,
    places,
    articles,
  })
  return { places, articles }
}

/** What the real build reaches outside itself with: osmium-tool, the network and the clock. */
export interface Tools {
  osmium: (args: string[]) => string // runs osmium-tool and returns what it prints
  fetch: Fetch
  now: () => Date
}

function replicationTimestamp(pbf: string, osmium: Tools['osmium']): string {
  // osmium prints an empty line and exits 0 when the file's header doesn't have it.
  const timestamp = osmium(['fileinfo', '-g', 'header.option.osmosis_replication_timestamp', pbf]).trim()
  if (!timestamp) throw new Error(`${pbf} has no replication timestamp`)
  return new Date(timestamp).toISOString()
}

/** The real build: the osmium steps on an extract, then the whole box of Wikipedia, with the checks. */
export async function buildFromExtract({ pbf, out }: { pbf: string; out: string }, { osmium, fetch, now }: Tools) {
  const osmDataAt = replicationTimestamp(pbf, osmium)
  const folder = mkdtempSync(join(tmpdir(), 'kilato-osm-'))
  try {
    const inBox = join(folder, 'box.osm.pbf')
    const filtered = join(folder, 'filtered.osm.pbf')
    const config = join(folder, 'export.json')
    const exported = join(folder, 'places.geojsonseq')
    writeFileSync(config, JSON.stringify(EXPORT_CONFIG))
    osmium(extractArgs(pbf, inBox))
    osmium(tagsFilterArgs(inBox, filtered))
    osmium(exportArgs(filtered, config, exported))
    return await buildTree(
      {
        geojsonseq: readFileSync(exported, 'utf8'),
        osmDataAt,
        fetchArticles: () => fetchArticles(COVERAGE_BOX, fetch),
        now,
        minimums: MINIMUMS,
      },
      out,
    )
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
}

if (import.meta.main) {
  const { pbf, out } = parseArgs({ options: { pbf: { type: 'string' }, out: { type: 'string' } } }).values
  if (!pbf || !out) throw new Error('Usage: npm run data:build -- --pbf <file> --out <dir>')

  const { places, articles } = await buildFromExtract(
    { pbf, out },
    {
      osmium: (args) => execFileSync('osmium', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }),
      fetch,
      now: () => new Date(),
    },
  )
  console.log(`Wrote ${places.length} places to ${out}, with ${articles.length} articles read`)
}
