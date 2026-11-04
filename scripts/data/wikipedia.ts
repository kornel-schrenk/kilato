import type { Manifest } from '../../src/core/types'

type Box = Manifest['box'] // west, south, east, north
type Edition = 'hu' | 'en'
type Params = Record<string, string>
type Api = (params: Params) => Promise<Reply>

export type Fetch = typeof globalThis.fetch

const USER_AGENT = 'Kilato/1.0 (https://github.com/kornel-schrenk/kilato)'
const MAX_RETRIES = 3
const FIRST_BACKOFF_MS = 5_000 // the API asks for at least 5 s after a maxlag reply
const TILE_HEIGHT = 0.05
const TILE_WIDTH = 0.075
const GEOSEARCH_LIMIT = 500
const SMALLEST_SPLIT_WIDTH = 0.0001 // about 7.5 m in Budapest
const PAGES_PER_CALL = 50

/** One article, from one edition or from both. */
export interface Article {
  q?: string // Wikidata id
  lat: number // where the Hungarian article is, when both editions have it
  lon: number
  pageids: Partial<Record<Edition, number>> // the editions whose search found it
  titles: Record<string, string> // language to title: the pages' own titles, and their language links
}

interface GeoPage {
  pageid: number
  title: string
  lat: number
  lon: number
}

interface EditionPage extends GeoPage {
  q?: string
  langlinks: Record<string, string>
}

export interface Reply {
  error?: { code: string }
  continue?: Params
  query: {
    geosearch: GeoPage[]
    pages: {
      pageid: number
      pageprops?: { wikibase_item?: string }
      langlinks?: { lang: string; title: string }[]
    }[]
  }
}

/** Tile edges stay readable: 18.925 + 0.075 is 19 in the request, not 19.000000000000004. */
const round = (degrees: number) => Math.round(degrees * 1e6) / 1e6

function tiles([west, south, east, north]: Box): Box[] {
  const result: Box[] = []
  for (let row = 0; round(south + row * TILE_HEIGHT) < north; row++) {
    for (let column = 0; round(west + column * TILE_WIDTH) < east; column++) {
      result.push([
        round(west + column * TILE_WIDTH),
        round(south + row * TILE_HEIGHT),
        Math.min(east, round(west + (column + 1) * TILE_WIDTH)),
        Math.min(north, round(south + (row + 1) * TILE_HEIGHT)),
      ])
    }
  }
  return result
}

function quarters([west, south, east, north]: Box): Box[] {
  const middleLon = round((west + east) / 2)
  const middleLat = round((south + north) / 2)
  return [
    [west, south, middleLon, middleLat],
    [middleLon, south, east, middleLat],
    [west, middleLat, middleLon, north],
    [middleLon, middleLat, east, north],
  ]
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** One API call, retried. Every call in this module goes through it, and awaits it before the next. */
async function call(edition: Edition, params: Params, fetch: Fetch): Promise<Reply> {
  const query = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', maxlag: '5', ...params })
  const url = `https://${edition}.wikipedia.org/w/api.php?${query}`

  for (let retry = 0; ; retry++) {
    let failure: unknown
    let retryAfterSeconds = 0
    try {
      const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
      retryAfterSeconds = Number(response.headers.get('Retry-After')) || 0
      if (response.ok) {
        const reply = (await response.json()) as Reply
        if (!reply.error) return reply
        failure = reply.error.code
      } else {
        failure = `HTTP ${response.status}`
      }
    } catch (error) {
      failure = error
    }
    if (retry === MAX_RETRIES) {
      throw new Error(`Wikipedia call failed after ${MAX_RETRIES} retries: ${failure}: ${url}`, { cause: failure })
    }
    await wait(Math.max(FIRST_BACKOFF_MS * 2 ** retry, retryAfterSeconds * 1_000))
  }
}

async function geosearch(tile: Box, api: Api): Promise<GeoPage[]> {
  const [west, south, east, north] = tile
  const { query } = await api({
    list: 'geosearch',
    gsbbox: `${north}|${west}|${south}|${east}`,
    gslimit: String(GEOSEARCH_LIMIT),
    gsprimary: 'primary',
    gsnamespace: '0',
  })
  const found = query.geosearch
  if (found.length < GEOSEARCH_LIMIT) return found

  // ponytail: 500 articles inside a few metres means the API misbehaves, and asking on would never end.
  if (east - west < SMALLEST_SPLIT_WIDTH) throw new Error(`500 articles or more in the tiny tile ${tile}`)
  const pages: GeoPage[] = []
  for (const quarter of quarters(tile)) pages.push(...(await geosearch(quarter, api)))
  return pages
}

/** Adds the Wikidata id and the language links to pages. A long reply takes several calls, each adding its part. */
async function addDetails(ids: number[], pages: Map<number, EditionPage>, api: Api) {
  let next: Params | undefined = {}
  while (next) {
    const reply: Reply = await api({
      prop: 'pageprops|langlinks',
      ppprop: 'wikibase_item',
      lllimit: 'max',
      pageids: ids.join('|'),
      ...next,
    })
    for (const { pageid, pageprops, langlinks = [] } of reply.query.pages) {
      const page = pages.get(pageid)!
      page.q ??= pageprops?.wikibase_item
      for (const { lang, title } of langlinks) page.langlinks[lang] = title
    }
    next = reply.continue
  }
}

async function editionPages(box: Box, api: Api): Promise<EditionPage[]> {
  const pages = new Map<number, EditionPage>()
  for (const tile of tiles(box)) {
    for (const page of await geosearch(tile, api)) pages.set(page.pageid, { ...page, langlinks: {} })
  }
  const ids = [...pages.keys()]
  for (let i = 0; i < ids.length; i += PAGES_PER_CALL) {
    await addDetails(ids.slice(i, i + PAGES_PER_CALL), pages, api)
  }
  return [...pages.values()]
}

/**
 * Fetches the geotagged articles in a box from both editions.
 * It rejects when a call still fails after its retries, or when a tile can't be split any further.
 */
export async function fetchArticles(box: Box, fetch: Fetch): Promise<Article[]> {
  const articles = new Map<string, Article>()
  // Hungarian comes first, so its position is the one that stays.
  for (const edition of ['hu', 'en'] as const) {
    const api: Api = (params) => call(edition, params, fetch)
    for (const { pageid, title, lat, lon, q, langlinks } of await editionPages(box, api)) {
      const key = q ?? `${edition}:${pageid}`
      const known = articles.get(key)
      if (known) {
        known.pageids[edition] = pageid
        known.titles = { ...langlinks, ...known.titles, [edition]: title }
      } else {
        articles.set(key, { q, lat, lon, pageids: { [edition]: pageid }, titles: { ...langlinks, [edition]: title } })
      }
    }
  }
  return [...articles.values()]
}
