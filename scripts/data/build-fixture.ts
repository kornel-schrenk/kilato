// `npm run data:fixture` rewrites test/fixtures/site-data/ from the OpenStreetMap and Wikipedia
// fixtures. It calls nothing live, and a test fails when the committed copy is out of date.
// Node runs it without a build, so these imports name the .ts files.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { buildTree } from './build.ts'
import { FIXTURE_BOX, FIXTURE_FILE, replayingFetch, type Responses } from './wikipedia-fixture.ts'
import { fetchArticles } from './wikipedia.ts'

const fixtures = join(import.meta.dirname, '../../test/fixtures')
const NOW = new Date('2026-11-02T03:17:00Z')

const { out = join(fixtures, 'site-data') } = parseArgs({ options: { out: { type: 'string' } } }).values
const responses = JSON.parse(readFileSync(FIXTURE_FILE, 'utf8')) as Responses

const { places } = await buildTree(
  {
    geojsonseq: readFileSync(join(fixtures, 'osm/sample.geojsonseq'), 'utf8'),
    osmDataAt: NOW.toISOString(),
    fetchArticles: () => fetchArticles(FIXTURE_BOX, replayingFetch(responses)),
    now: () => NOW,
  },
  out,
)
console.log(`Wrote ${places.length} places to ${out}`)
