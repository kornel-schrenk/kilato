import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COVERAGE_BOX } from './osm'
import { fetchArticles, type Fetch } from './wikipedia'

interface Call {
  edition: string
  params: URLSearchParams
  headers: Headers
}

const emptyAnswer = ({ params }: Call) =>
  params.has('list')
    ? { query: { geosearch: [] } }
    : { query: { pages: params.get('pageids')!.split('|').map((id) => ({ pageid: Number(id) })) } }

/** A fake Wikipedia that keeps every call. Where `answer` returns nothing, it finds no pages and no details. */
function fakeWikipedia(answer: (call: Call) => unknown = () => undefined) {
  const calls: Call[] = []
  const fake: Fetch = async (input, init) => {
    const url = new URL(String(input))
    const call = { edition: url.hostname.split('.')[0], params: url.searchParams, headers: new Headers(init?.headers) }
    calls.push(call)
    return Response.json(answer(call) ?? emptyAnswer(call))
  }
  return { fake, calls }
}

const searches = (calls: Call[], edition: string) =>
  calls.filter((call) => call.edition === edition && call.params.get('list') === 'geosearch')

const tilesAsked = (calls: Call[], edition: string) => searches(calls, edition).map(({ params }) => params.get('gsbbox'))

/** `count` pages with page ids from `first` on. */
const pages = (first: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({ pageid: first + i, title: `Cikk ${first + i}`, lat: 47.005, lon: 19.005 }))

const found = (...results: ReturnType<typeof pages>) => ({ query: { geosearch: results } })

describe('fetchArticles, the tiled geosearch', () => {
  it('asks each edition once per tile, 0.05° tall and 0.075° wide, cut off at the box', async () => {
    const { fake, calls } = fakeWikipedia()
    await fetchArticles(COVERAGE_BOX, fake)

    const rows = [[47.4, 47.35], [47.45, 47.4], [47.5, 47.45], [47.55, 47.5], [47.6, 47.55], [47.62, 47.6]]
    const columns = [[18.925, 19], [19, 19.075], [19.075, 19.15], [19.15, 19.225], [19.225, 19.3], [19.3, 19.335]]
    const tiles = rows.flatMap(([top, bottom]) => columns.map(([left, right]) => `${top}|${left}|${bottom}|${right}`))

    for (const edition of ['hu', 'en']) {
      expect(tilesAsked(calls, edition).sort()).toEqual(tiles.sort())
    }
  })

  it('sends the geosearch parameters the spec names', async () => {
    const { fake, calls } = fakeWikipedia()
    await fetchArticles([19, 47, 19.01, 47.01], fake)

    const asked = [...searches(calls, 'hu'), ...searches(calls, 'en')]
    expect(asked).toHaveLength(2)
    for (const { params } of asked) {
      expect(params.get('action')).toBe('query')
      expect(params.get('format')).toBe('json')
      expect(params.get('gslimit')).toBe('500')
      expect(params.get('gsprimary')).toBe('primary')
      expect(params.get('gsnamespace')).toBe('0')
    }
  })

  describe('with a tile that has 500 results', () => {
    const tile: [number, number, number, number] = [18.925, 47.35, 19, 47.4]
    const fullTile = '47.4|18.925|47.35|19'
    const quarters = [
      '47.375|18.925|47.35|18.9625',
      '47.375|18.9625|47.35|19',
      '47.4|18.925|47.375|18.9625',
      '47.4|18.9625|47.375|19',
    ]

    it('splits it into four and asks again, and keeps what the four return', async () => {
      const { fake, calls } = fakeWikipedia(({ edition, params }) => {
        if (edition !== 'hu' || !params.has('list')) return undefined
        const bbox = params.get('gsbbox')!
        return bbox === fullTile ? found(...pages(1, 500)) : found(...pages(1000 * (quarters.indexOf(bbox) + 1), 200))
      })

      const articles = await fetchArticles(tile, fake)

      expect(tilesAsked(calls, 'hu')).toEqual([fullTile, ...quarters])
      expect(articles).toHaveLength(800)
    })

    it('splits a quarter that has 500 results too', async () => {
      const fullQuarter = quarters[3]
      const { fake, calls } = fakeWikipedia(({ params }) =>
        [fullTile, fullQuarter].includes(params.get('gsbbox')!) ? found(...pages(1, 500)) : undefined,
      )

      await fetchArticles(tile, fake)

      expect(tilesAsked(calls, 'hu')).toEqual([
        fullTile,
        ...quarters,
        '47.3875|18.9625|47.375|18.98125',
        '47.3875|18.98125|47.375|19',
        '47.4|18.9625|47.3875|18.98125',
        '47.4|18.98125|47.3875|19',
      ])
    })

    it('leaves a tile with 499 results whole', async () => {
      const { fake, calls } = fakeWikipedia(({ edition, params }) =>
        edition === 'hu' && params.has('list') ? found(...pages(1, 499)) : undefined,
      )

      const articles = await fetchArticles(tile, fake)

      expect(tilesAsked(calls, 'hu')).toEqual([fullTile])
      expect(articles).toHaveLength(499)
    })

    it('fails instead of splitting for ever when even a tiny tile is full', async () => {
      const { fake, calls } = fakeWikipedia(({ params }) => (params.has('list') ? found(...pages(1, 500)) : undefined))

      await expect(fetchArticles(tile, fake)).rejects.toThrow(/500 articles/)
      expect(calls.length).toBeLessThan(20)
    })
  })

  it('counts a page once when two tiles both return it', async () => {
    const box: [number, number, number, number] = [19, 47, 19.15, 47.05]
    const { fake, calls } = fakeWikipedia(({ edition, params }) =>
      edition === 'hu' && params.has('list') ? found(...pages(7, 1)) : undefined,
    )

    const articles = await fetchArticles(box, fake)

    expect(tilesAsked(calls, 'hu')).toHaveLength(2)
    expect(articles).toHaveLength(1)
  })
})

const SMALL_BOX: [number, number, number, number] = [19, 47, 19.01, 47.01]

const detailCalls = (calls: Call[], edition: string) =>
  calls.filter((call) => call.edition === edition && call.params.has('prop'))

/** A fake with the geosearch and details replies of each edition, by page. */
function wikipediaWith(editions: Record<string, { pageid: number; title: string; lat: number; lon: number; q?: string; links?: Record<string, string> }[]>) {
  return fakeWikipedia(({ edition, params }) => {
    const pagesOf = editions[edition] ?? []
    if (params.has('list')) return found(...pagesOf.map(({ pageid, title, lat, lon }) => ({ pageid, title, lat, lon })))
    return {
      query: {
        pages: pagesOf.map(({ pageid, q, links }) => ({
          pageid,
          ...(q && { pageprops: { wikibase_item: q } }),
          ...(links && { langlinks: Object.entries(links).map(([lang, title]) => ({ lang, title })) }),
        })),
      },
    }
  })
}

describe('fetchArticles, the page details', () => {
  it('asks for the details of 50 page ids per call, with the parameters the spec names', async () => {
    const { fake, calls } = fakeWikipedia(({ edition, params }) =>
      edition === 'hu' && params.has('list') ? found(...pages(1, 120)) : undefined,
    )

    await fetchArticles(SMALL_BOX, fake)

    const details = detailCalls(calls, 'hu')
    expect(details.map(({ params }) => params.get('pageids')!.split('|').length)).toEqual([50, 50, 20])
    expect(details.flatMap(({ params }) => params.get('pageids')!.split('|').map(Number))).toEqual(
      Array.from({ length: 120 }, (_, i) => i + 1),
    )
    for (const { params } of details) {
      expect(params.get('prop')).toBe('pageprops|langlinks')
      expect(params.get('ppprop')).toBe('wikibase_item')
      expect(params.get('lllimit')).toBe('max')
    }
  })

  it('makes no details call for an edition that found nothing', async () => {
    const { fake, calls } = fakeWikipedia()

    await fetchArticles(SMALL_BOX, fake)

    expect(calls.filter(({ params }) => params.has('prop'))).toEqual([])
  })

  it('follows continue until it ends, and joins what each reply says about a page', async () => {
    const replies: Record<string, unknown> = {
      first: {
        continue: { llcontinue: '1|de', continue: '||pageprops' },
        query: {
          pages: [
            { pageid: 1, pageprops: { wikibase_item: 'Q1' }, langlinks: [{ lang: 'cs', title: 'Cseh' }] },
            { pageid: 2, pageprops: { wikibase_item: 'Q2' } },
          ],
        },
      },
      '1|de': {
        continue: { llcontinue: '2|fr', continue: '||pageprops' },
        query: { pages: [{ pageid: 1, langlinks: [{ lang: 'de', title: 'Deutsch' }] }, { pageid: 2 }] },
      },
      '2|fr': { query: { pages: [{ pageid: 1 }, { pageid: 2, langlinks: [{ lang: 'fr', title: 'Français' }] }] } },
    }
    const { fake, calls } = fakeWikipedia(({ edition, params }) => {
      if (edition !== 'hu') return undefined
      return params.has('list') ? found(...pages(1, 2)) : replies[params.get('llcontinue') ?? 'first']
    })

    const articles = await fetchArticles(SMALL_BOX, fake)

    const details = detailCalls(calls, 'hu')
    expect(details.map(({ params }) => params.get('llcontinue'))).toEqual([null, '1|de', '2|fr'])
    expect(details.map(({ params }) => params.get('continue'))).toEqual([null, '||pageprops', '||pageprops'])
    for (const { params } of details) expect(params.get('pageids')).toBe('1|2')

    expect(articles).toEqual([
      { q: 'Q1', lat: 47.005, lon: 19.005, pageids: { hu: 1 }, titles: { hu: 'Cikk 1', cs: 'Cseh', de: 'Deutsch' } },
      { q: 'Q2', lat: 47.005, lon: 19.005, pageids: { hu: 2 }, titles: { hu: 'Cikk 2', fr: 'Français' } },
    ])
  })
})

describe('fetchArticles, the two editions', () => {
  const gresham = {
    hu: { pageid: 10, title: 'Gresham-palota', lat: 47.5008, lon: 19.0484, q: 'Q1', links: { en: 'Gresham Palace', de: 'Gresham-Palast' } },
    en: { pageid: 20, title: 'Gresham Palace', lat: 47.5011, lon: 19.0487, q: 'Q1', links: { hu: 'Gresham-palota', fr: 'Palais Gresham' } },
  }

  it('counts an article with the same Wikidata id as one, positioned where the Hungarian one is', async () => {
    const { fake } = wikipediaWith({ hu: [gresham.hu], en: [gresham.en] })

    expect(await fetchArticles(SMALL_BOX, fake)).toEqual([
      {
        q: 'Q1',
        lat: 47.5008,
        lon: 19.0484,
        pageids: { hu: 10, en: 20 },
        titles: { hu: 'Gresham-palota', en: 'Gresham Palace', de: 'Gresham-Palast', fr: 'Palais Gresham' },
      },
    ])
  })

  it('positions an article only the English search found where the English one is', async () => {
    const { fake } = wikipediaWith({ en: [gresham.en] })

    expect(await fetchArticles(SMALL_BOX, fake)).toEqual([
      {
        q: 'Q1',
        lat: 47.5011,
        lon: 19.0487,
        pageids: { en: 20 },
        titles: { en: 'Gresham Palace', hu: 'Gresham-palota', fr: 'Palais Gresham' },
      },
    ])
  })

  it('keeps articles with different Wikidata ids apart', async () => {
    const { fake } = wikipediaWith({ hu: [gresham.hu], en: [{ ...gresham.en, q: 'Q2' }] })

    expect(await fetchArticles(SMALL_BOX, fake)).toHaveLength(2)
  })

  it('keeps articles with no Wikidata id apart, even under one title and page id', async () => {
    const page = { pageid: 30, title: 'Hely', lat: 47.5, lon: 19.05 }
    const { fake } = wikipediaWith({ hu: [page], en: [page] })

    expect(await fetchArticles(SMALL_BOX, fake)).toEqual([
      { lat: 47.5, lon: 19.05, pageids: { hu: 30 }, titles: { hu: 'Hely' } },
      { lat: 47.5, lon: 19.05, pageids: { en: 30 }, titles: { en: 'Hely' } },
    ])
  })

  it('takes a title from the page itself over a language link that names it differently', async () => {
    const { fake } = wikipediaWith({
      hu: [{ ...gresham.hu, links: { en: 'Old Title' } }],
      en: [{ ...gresham.en, links: { hu: 'Régi cím' } }],
    })

    const [article] = await fetchArticles(SMALL_BOX, fake)

    expect(article.titles).toEqual({ hu: 'Gresham-palota', en: 'Gresham Palace' })
  })
})

describe('fetchArticles, every call', () => {
  /** Finds two pages in Hungarian, with one continuation, so every kind of call happens. */
  const everyKindOfCall = () =>
    fakeWikipedia(({ edition, params }) => {
      if (edition !== 'hu') return undefined
      if (params.has('list')) return found(...pages(1, 2))
      if (params.has('llcontinue')) return { query: { pages: [{ pageid: 1 }, { pageid: 2 }] } }
      return { continue: { llcontinue: '1|de', continue: '||pageprops' }, query: { pages: [{ pageid: 1 }, { pageid: 2 }] } }
    })

  it('sends the User-Agent, maxlag=5 and formatversion=2', async () => {
    const { fake, calls } = everyKindOfCall()

    await fetchArticles(SMALL_BOX, fake)

    // The hu search, two hu detail calls and the en search.
    expect(calls).toHaveLength(4)
    for (const { params, headers } of calls) {
      expect(headers.get('User-Agent')).toBe('Kilato/1.0 (https://github.com/kornel-schrenk/kilato)')
      expect(params.get('maxlag')).toBe('5')
      expect(params.get('formatversion')).toBe('2')
    }
  })

  it('runs one at a time', async () => {
    const { fake: answer, calls } = fakeWikipedia(({ params }) => (params.has('list') ? found(...pages(1, 120)) : undefined))
    let running = 0
    let mostRunning = 0
    const fake: Fetch = async (input, init) => {
      mostRunning = Math.max(mostRunning, ++running)
      await new Promise((resolve) => setImmediate(resolve))
      running--
      return answer(input, init)
    }

    await fetchArticles([19, 47, 19.15, 47.05], fake)

    expect(calls.length).toBeGreaterThan(4)
    expect(mostRunning).toBe(1)
  })
})

describe('fetchArticles, when a call fails', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  /** Moves the fake clock on until the promise settles. */
  async function settled<T>(promise: Promise<T>): Promise<T> {
    let pending = true
    const stop = () => {
      pending = false
    }
    promise.then(stop, stop)
    while (pending) await vi.advanceTimersByTimeAsync(1_000)
    return promise
  }

  /** Fails the first `times` calls, and keeps the time of each call. */
  function failingFirst(times: number, failure: () => Response) {
    const { fake: answer } = fakeWikipedia()
    const callTimes: number[] = []
    let left = times
    const fake: Fetch = async (input, init) => {
      callTimes.push(Date.now())
      if (left-- > 0) return failure()
      return answer(input, init)
    }
    return { fake, secondsBetween: () => callTimes.slice(1).map((time, i) => (time - callTimes[i]) / 1_000) }
  }

  const maxlagReply = () => Response.json({ error: { code: 'maxlag', info: 'Waiting for a replica' } }, { headers: { 'Retry-After': '5' } })

  it.each<[string, () => Response]>([
    ['an HTTP error', () => new Response('busy', { status: 503 })],
    ['a maxlag reply, which comes with HTTP 200', maxlagReply],
    ['any other API error', () => Response.json({ error: { code: 'ratelimited' } })],
    ['a reply that is not JSON', () => new Response('<html>')],
    [
      'a network error',
      () => {
        throw new TypeError('fetch failed')
      },
    ],
  ])('tries again after %s', async (_, failure) => {
    const { fake, secondsBetween } = failingFirst(3, failure)

    await expect(settled(fetchArticles(SMALL_BOX, fake))).resolves.toEqual([])

    // Three failures, then the hu search again, then the en search straight after it.
    expect(secondsBetween()).toEqual([5, 10, 20, 0])
  })

  it('fails when a call still fails after 3 retries, waiting 5, 10 and 20 s and calling nothing more', async () => {
    const { fake, secondsBetween } = failingFirst(Infinity, () => new Response('busy', { status: 503 }))

    await expect(settled(fetchArticles(SMALL_BOX, fake))).rejects.toThrow(/after 3 retries.*HTTP 503.*hu\.wikipedia\.org/)

    expect(secondsBetween()).toEqual([5, 10, 20])
  })

  it('names the API error when a maxlag reply never clears', async () => {
    const { fake } = failingFirst(Infinity, maxlagReply)

    await expect(settled(fetchArticles(SMALL_BOX, fake))).rejects.toThrow(/after 3 retries.*maxlag/)
  })

  it('gives each call its own retries', async () => {
    const { fake: answer, calls } = fakeWikipedia()
    let failures = 0
    const fake: Fetch = async (input, init) => {
      // Each edition's search fails three times, which is six failures in the whole fetch.
      if (failures < 3 || (calls.length === 1 && failures < 6)) {
        failures++
        return new Response('busy', { status: 503 })
      }
      return answer(input, init)
    }

    await expect(settled(fetchArticles(SMALL_BOX, fake))).resolves.toEqual([])

    expect(failures).toBe(6)
    expect(calls).toHaveLength(2)
  })

  it('waits as long as Retry-After asks, when that is longer than the backoff', async () => {
    const { fake, secondsBetween } = failingFirst(1, () =>
      Response.json({ error: { code: 'maxlag' } }, { headers: { 'Retry-After': '30' } }),
    )

    await settled(fetchArticles(SMALL_BOX, fake))

    expect(secondsBetween()[0]).toBe(30)
  })

  it('keeps to the backoff when Retry-After is shorter, or not a number of seconds', async () => {
    for (const retryAfter of ['1', 'Wed, 04 Nov 2026 16:00:00 GMT']) {
      const { fake, secondsBetween } = failingFirst(1, () => new Response('busy', { status: 503, headers: { 'Retry-After': retryAfter } }))

      await settled(fetchArticles(SMALL_BOX, fake))

      expect(secondsBetween()[0]).toBe(5)
    }
  })
})
