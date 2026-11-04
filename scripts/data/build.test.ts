import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildTree, buildFromExtract, type Sources } from './build'
import type { Article, Fetch } from './wikipedia'

const root = join(import.meta.dirname, '../..')

const NOW = new Date('2026-11-02T03:17:00Z')

const osmLine = (id: number, tags: Record<string, string> = {}) =>
  JSON.stringify({
    type: 'Feature',
    id: `n${id}`,
    geometry: { type: 'Point', coordinates: [19.0545, 47.4975] },
    properties: { name: `Hely ${id}`, amenity: 'cafe', ...tags },
  })

const osmLines = (count: number) => Array.from({ length: count }, (_, i) => osmLine(i)).join('\n')

const someArticles = (count: number): Article[] =>
  Array.from({ length: count }, (_, i) => ({ q: `Q${i}`, lat: 47.5, lon: 19.05, pageids: { hu: i + 1 }, titles: { hu: `Cikk ${i}` } }))

let dir: string
let out: string
const json = (path: string) => JSON.parse(readFileSync(join(out, path), 'utf8'))

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kilato-build-'))
  out = join(dir, 'data')
})
afterEach(() => {
  vi.useRealTimers()
  rmSync(dir, { recursive: true, force: true })
})

describe('buildTree', () => {
  const sources = (overrides: Partial<Sources> = {}): Sources => ({
    geojsonseq: osmLine(1),
    osmDataAt: '2026-11-01T21:21:02.000Z',
    fetchArticles: async () => [],
    now: () => NOW,
    ...overrides,
  })

  it('works out the hours, merges the articles and writes the tree', async () => {
    const geojsonseq = [osmLine(1, { opening_hours: '24/7', wikidata: 'Q1' }), osmLine(2, { opening_hours: 'ask inside' })].join('\n')
    const articles: Article[] = [
      { q: 'Q1', lat: 47.5, lon: 19.05, pageids: { hu: 1 }, titles: { hu: 'Kávéház', en: 'Coffee house', de: 'Kaffeehaus' } },
      { q: 'Q2', lat: 47.5, lon: 19.05, pageids: { hu: 2 }, titles: { hu: 'Operaház (Budapest)' } },
    ]

    await buildTree(sources({ geojsonseq, fetchArticles: async () => articles }), out)

    expect(json('cells/4749_1270.json').places).toStrictEqual([
      { id: 'n1', cat: 'food', kind: 'cafe', lat: 47.4975, lon: 19.0545, name: 'Hely 1', hours: [[0, 20160]], wiki: { q: 'Q1', hu: 'Kávéház', en: 'Coffee house' } },
      { id: 'n2', cat: 'food', kind: 'cafe', lat: 47.4975, lon: 19.0545, name: 'Hely 2' },
    ])
    expect(json('cells/4750_1270.json').places).toStrictEqual([
      { id: 'Q2', cat: 'notable', kind: 'article', lat: 47.5, lon: 19.05, name: 'Operaház', wiki: { q: 'Q2', hu: 'Operaház (Budapest)' } },
    ])
    expect(json('wiki/de.json')).toStrictEqual({ Q1: 'Kaffeehaus' })
    expect(json('search.json').places.map(({ id }: { id: string }) => id)).toEqual(['n1', 'n2', 'Q2'])
  })

  it('stamps the manifest: the fetch start, the finish, the local midnight and the coverage box', async () => {
    let now = new Date('2026-11-02T03:17:00Z')
    const fetchArticles = async () => {
      now = new Date('2026-11-02T03:40:00Z')
      return []
    }

    await buildTree(sources({ fetchArticles, now: () => now }), out)

    expect(json('manifest.json')).toMatchObject({
      osmDataAt: '2026-11-01T21:21:02.000Z',
      wikipediaAt: '2026-11-02T03:17:00.000Z',
      builtAt: '2026-11-02T03:40:00.000Z',
      hoursWindowStart: '2026-11-01T23:00:00.000Z',
      box: [18.925, 47.35, 19.335, 47.62],
    })
  })

  it('counts hours from the window start, which is before the build started', async () => {
    const geojsonseq = osmLine(1, { opening_hours: 'Mo 08:00-09:00' })

    await buildTree(sources({ geojsonseq }), out)

    const [place] = json('cells/4749_1270.json').places
    expect(place.hours).toEqual([
      [480, 540],
      [10560, 10620],
    ])
  })

  it('keeps an empty list of hours, which means closed throughout', async () => {
    const geojsonseq = osmLine(1, { opening_hours: 'off' })

    await buildTree(sources({ geojsonseq }), out)

    expect(json('cells/4749_1270.json').places[0].hours).toEqual([])
  })

  it('writes a small tree when no minimums are asked for', async () => {
    await buildTree(sources(), out)

    expect(json('manifest.json').cells).toEqual(['4749_1270'])
  })

  describe('with minimums', () => {
    const minimums = { places: 5_000, articles: 1_500 }

    it('fails on too few places, before it asks Wikipedia anything, and writes nothing', async () => {
      const fetchArticles = vi.fn(async () => someArticles(1_500))

      await expect(buildTree(sources({ geojsonseq: osmLines(4_999), fetchArticles, minimums }), out)).rejects.toThrow('4999 places from OpenStreetMap, fewer than 5000')

      expect(fetchArticles).not.toHaveBeenCalled()
      expect(existsSync(out)).toBe(false)
    })

    it('fails on too few articles, and writes nothing', async () => {
      const fetchArticles = async () => someArticles(1_499)

      await expect(buildTree(sources({ geojsonseq: osmLines(5_000), fetchArticles, minimums }), out)).rejects.toThrow('1499 articles from Wikipedia, fewer than 1500')

      expect(existsSync(out)).toBe(false)
    })

    it('writes the tree at exactly the minimums', async () => {
      const fetchArticles = async () => someArticles(1_500)

      await buildTree(sources({ geojsonseq: osmLines(5_000), fetchArticles, minimums }), out)

      expect(json('search.json').places).toHaveLength(6_500)
    })

    it('counts places left out of the export against the minimum', async () => {
      const unnamed = JSON.stringify({ type: 'Feature', id: 'n9', geometry: { type: 'Point', coordinates: [19.05, 47.5] }, properties: { amenity: 'cafe' } })
      const geojsonseq = `${osmLines(4_999)}\n${unnamed}`

      await expect(buildTree(sources({ geojsonseq, minimums }), out)).rejects.toThrow('fewer than 5000')
    })
  })

  it('fails when the articles fail, and writes nothing', async () => {
    const fetchArticles = () => Promise.reject(new Error('Wikipedia call failed'))

    await expect(buildTree(sources({ fetchArticles }), out)).rejects.toThrow('Wikipedia call failed')

    expect(existsSync(out)).toBe(false)
  })
})

describe('buildFromExtract', () => {
  const PBF = '/data/hungary-latest.osm.pbf'
  const TIMESTAMP = '2026-11-01T21:21:02Z'

  /** Stands in for osmium-tool: it notes each call, and writes each output file. */
  function fakeOsmium(geojsonseq: string, timestamp = TIMESTAMP) {
    const calls: string[][] = []
    let exportConfig = ''
    const osmium = (args: string[]) => {
      calls.push(args)
      if (args[0] === 'fileinfo') return `${timestamp}\n`
      if (args[0] === 'export') exportConfig = readFileSync(args[args.indexOf('-c') + 1], 'utf8')
      writeFileSync(args[args.indexOf('-o') + 1], args[0] === 'export' ? geojsonseq : 'pbf')
      return ''
    }
    return { osmium, calls, exportConfig: () => exportConfig }
  }

  /** Stands in for both editions: 36 tiles of 50 Hungarian pages each make 1,800 articles. */
  function fakeWikipedia() {
    const urls: string[] = []
    let nextPage = 1
    const fetch: Fetch = async (input) => {
      const url = new URL(String(input))
      urls.push(url.href)
      if (url.searchParams.get('list') === 'geosearch') {
        const count = url.hostname.startsWith('hu.') ? 50 : 0
        const geosearch = Array.from({ length: count }, () => ({ pageid: nextPage, title: `Cikk ${nextPage++}`, lat: 47.5, lon: 19.05 }))
        return Response.json({ query: { geosearch } })
      }
      const pages = url.searchParams.get('pageids')!.split('|').map((pageid) => ({ pageid: Number(pageid) }))
      return Response.json({ query: { pages } })
    }
    return { fetch, urls }
  }

  const failingFetch = vi.fn<Fetch>(async () => new Response('down', { status: 503 }))

  beforeEach(() => failingFetch.mockClear())

  const outputOf = (args: string[]) => args[args.indexOf('-o') + 1]
  const tools = (osmium: (args: string[]) => string, fetch: Fetch) => ({ osmium, fetch, now: () => NOW })

  it('runs the osmium steps in order, each reading what the last one wrote', async () => {
    const { osmium, calls, exportConfig } = fakeOsmium(osmLines(5_000))

    await buildFromExtract({ pbf: PBF, out }, tools(osmium, fakeWikipedia().fetch))

    const [fileinfo, extract, tagsFilter, exported] = calls
    expect(fileinfo).toEqual(['fileinfo', '-g', 'header.option.osmosis_replication_timestamp', PBF])
    expect(extract.slice(0, 6)).toEqual(['extract', '-s', 'smart', '-b', '18.925,47.35,19.335,47.62', PBF])
    expect(tagsFilter.slice(0, 2)).toEqual(['tags-filter', outputOf(extract)])
    expect(exported[0]).toBe('export')
    expect(exported).toContain(outputOf(tagsFilter))
    expect(JSON.parse(exportConfig())).toEqual({ linear_tags: false })
    expect(calls).toHaveLength(4)
  })

  it('writes the tree from the export and the whole box of Wikipedia', async () => {
    const { osmium } = fakeOsmium(osmLines(5_000))
    const { fetch, urls } = fakeWikipedia()

    await buildFromExtract({ pbf: PBF, out }, tools(osmium, fetch))

    expect(urls[0]).toContain('hu.wikipedia.org')
    expect(new URL(urls[0]).searchParams.get('gsbbox')).toBe('47.4|18.925|47.35|19')
    expect(json('search.json').places).toHaveLength(6_800)
    expect(json('manifest.json')).toMatchObject({ osmDataAt: '2026-11-01T21:21:02.000Z', wikipediaAt: NOW.toISOString(), builtAt: NOW.toISOString() })
  })

  it('removes its working files', async () => {
    const { osmium, calls } = fakeOsmium(osmLines(5_000))

    await buildFromExtract({ pbf: PBF, out }, tools(osmium, fakeWikipedia().fetch))

    expect(existsSync(dirname(outputOf(calls[1])))).toBe(false)
  })

  it('fails with fewer than 5,000 places, before it asks Wikipedia anything, and removes its working files', async () => {
    const { osmium, calls } = fakeOsmium(osmLines(4_999))

    await expect(buildFromExtract({ pbf: PBF, out }, tools(osmium, failingFetch))).rejects.toThrow('fewer than 5000')

    expect(failingFetch).not.toHaveBeenCalled()
    expect(existsSync(dirname(outputOf(calls[1])))).toBe(false)
    expect(existsSync(out)).toBe(false)
  })

  it('fails with fewer than 1,500 articles', async () => {
    const { osmium } = fakeOsmium(osmLines(5_000))
    const emptyWikipedia: Fetch = async () => Response.json({ query: { geosearch: [] } })

    await expect(buildFromExtract({ pbf: PBF, out }, tools(osmium, emptyWikipedia))).rejects.toThrow('0 articles from Wikipedia, fewer than 1500')

    expect(existsSync(out)).toBe(false)
  })

  it('fails when a Wikipedia call still fails after its retries, and writes nothing', async () => {
    vi.useFakeTimers()
    const { osmium } = fakeOsmium(osmLines(5_000))

    const failure = expect(buildFromExtract({ pbf: PBF, out }, tools(osmium, failingFetch))).rejects.toThrow('failed after 3 retries')
    await vi.runAllTimersAsync()
    await failure

    expect(failingFetch).toHaveBeenCalledTimes(4)
    expect(existsSync(out)).toBe(false)
  })

  it('fails when the extract has no replication timestamp, which osmium answers with an empty line', async () => {
    const { osmium, calls } = fakeOsmium(osmLines(5_000), '')

    await expect(buildFromExtract({ pbf: PBF, out }, tools(osmium, failingFetch))).rejects.toThrow('no replication timestamp')

    expect(calls).toHaveLength(1)
    expect(failingFetch).not.toHaveBeenCalled()
  })

  it('fails when an osmium step fails, and removes its working files', async () => {
    let workingFolder = ''
    const osmium = (args: string[]) => {
      if (args[0] === 'fileinfo') return `${TIMESTAMP}\n`
      workingFolder = dirname(outputOf(args))
      throw new Error('osmium exited with 1')
    }

    await expect(buildFromExtract({ pbf: PBF, out }, tools(osmium, failingFetch))).rejects.toThrow('osmium exited with 1')

    expect(existsSync(workingFolder)).toBe(false)
    expect(failingFetch).not.toHaveBeenCalled()
  })
})

describe('npm run data:build', () => {
  // The real command, with a stand-in for the one tool this machine may lack. It stops at the
  // minimum, so it never reaches Wikipedia.
  const FAKE_OSMIUM = `#!/bin/sh
echo "$TZ $1" >> "$OSMIUM_LOG"
if [ "$1" = fileinfo ]; then echo 2026-11-01T21:21:02Z; exit 0; fi
while [ $# -gt 1 ]; do
  if [ "$1" = -o ]; then cp "$FAKE_EXPORT" "$2"; fi
  shift
done
`

  function run(args: string[]) {
    const log = join(dir, 'osmium.log')
    writeFileSync(join(dir, 'export.geojsonseq'), osmLines(10))
    const script = join(dir, 'osmium')
    writeFileSync(script, FAKE_OSMIUM)
    chmodSync(script, 0o755)
    const result = spawnSync('npm', ['run', '--silent', 'data:build', '--', ...args], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        TZ: 'UTC',
        OSMIUM_LOG: log,
        FAKE_EXPORT: join(dir, 'export.geojsonseq'),
      },
    })
    return { ...result, osmiumLog: existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [] }
  }

  it('exits non-zero below the minimum, having run osmium in Budapest time', { timeout: 60_000 }, () => {
    const { status, stderr, osmiumLog } = run(['--pbf', join(dir, 'hungary.osm.pbf'), '--out', out])

    expect(stderr).toContain('10 places from OpenStreetMap, fewer than 5000')
    expect(status).not.toBe(0)
    expect(osmiumLog).toEqual(['Europe/Budapest fileinfo', 'Europe/Budapest extract', 'Europe/Budapest tags-filter', 'Europe/Budapest export'])
    expect(existsSync(out)).toBe(false)
  })

  it.each([
    ['no arguments', []],
    ['no --out', ['--pbf', 'hungary.osm.pbf']],
    ['no --pbf', ['--out', 'data']],
  ])('exits non-zero with %s, before it runs anything', { timeout: 60_000 }, (_case, args) => {
    const { status, stderr, osmiumLog } = run(args)

    expect(stderr).toContain('--pbf <file> --out <dir>')
    expect(status).not.toBe(0)
    expect(osmiumLog).toEqual([])
  })
})
