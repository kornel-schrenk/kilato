// QA edge probes for #10: inputs the unit tests don't pin. All fetches here are fakes.
// Usage: node edge-probes.mjs <path to scripts/data/wikipedia.ts>
import { pathToFileURL } from 'node:url'

const { fetchArticles } = await import(pathToFileURL(process.argv[2]).href)
const SMALL = [19, 47, 19.01, 47.01]
const page = (pageid, extra = {}) => ({ pageid, title: `Cikk ${pageid}`, lat: 47.005, lon: 19.005, ...extra })
const detailsFor = (params) => ({ query: { pages: params.get('pageids').split('|').map((id) => ({ pageid: Number(id) })) } })

/** `answer` returns a reply body for a call, or nothing for no pages and no details. */
function fake(answer) {
  const calls = []
  const fetch = async (input) => {
    const url = new URL(String(input))
    const call = { edition: url.hostname.split('.')[0], params: url.searchParams }
    calls.push(call)
    const reply = answer(call, calls)
    if (reply instanceof Response) return reply
    return Response.json(reply ?? (call.params.has('list') ? { query: { geosearch: [] } } : detailsFor(call.params)))
  }
  return { fetch, calls }
}

async function probe(name, run) {
  try {
    console.log(`${name}: ${JSON.stringify(await run())}`)
  } catch (error) {
    console.log(`${name}: REJECTS ${error.constructor.name}: ${error.message}`)
  }
}

const huPages = (...pages) => ({ edition, params }) => {
  if (edition !== 'hu') return undefined
  return params.has('list') ? { query: { geosearch: pages } } : undefined
}

// Volume: exact multiples and one over, on the details calls.
for (const count of [1, 49, 50, 51, 100]) {
  await probe(`details calls for ${count} pages`, async () => {
    const { fetch, calls } = fake(huPages(...Array.from({ length: count }, (_, i) => page(i + 1))))
    const articles = await fetchArticles(SMALL, fetch)
    return { articles: articles.length, idsPerCall: calls.filter(({ params }) => params.has('prop')).map(({ params }) => params.get('pageids').split('|').length) }
  })
}

// A page deleted between the search and the details, in the shape the live API sends.
await probe('page deleted before its details', async () => {
  const { fetch } = fake(({ edition, params }) => {
    if (edition !== 'hu') return undefined
    if (params.has('list')) return { query: { geosearch: [page(5)] } }
    return { query: { pages: [{ pageid: 5, missing: true }] } }
  })
  return fetchArticles(SMALL, fetch)
})

// A details reply that names a page nobody asked for.
await probe('details reply names an unknown page', async () => {
  const { fetch, calls } = fake(({ edition, params }) => {
    if (edition !== 'hu') return undefined
    if (params.has('list')) return { query: { geosearch: [page(5)] } }
    return { query: { pages: [{ pageid: 5 }, { pageid: 6 }] } }
  })
  const articles = await fetchArticles(SMALL, fetch).catch((error) => `rejects with ${error.constructor.name} after ${calls.length} calls`)
  return articles
})

// HTTP 200 with no `query` at all: not an API error, so what does the fetch do?
await probe('200 reply with no query', async () => {
  const { fetch, calls } = fake(() => ({ batchcomplete: true }))
  const result = await fetchArticles(SMALL, fetch).catch((error) => `rejects with ${error.constructor.name} after ${calls.length} call(s), so no retry`)
  return result
})

// Community-edited language codes used as object keys.
await probe('language link named __proto__ and constructor', async () => {
  const { fetch } = fake(({ edition, params }) => {
    if (edition !== 'hu') return undefined
    if (params.has('list')) return { query: { geosearch: [page(5, {})] } }
    return { query: { pages: [{ pageid: 5, pageprops: { wikibase_item: 'Q5' }, langlinks: [{ lang: '__proto__', title: 'x' }, { lang: 'constructor', title: 'y' }] }] } }
  })
  const [article] = await fetchArticles(SMALL, fetch)
  return { titles: article.titles, protoIntact: Object.getPrototypeOf(article.titles) === Object.prototype, polluted: {}.x !== undefined }
})

// Odd titles reach the caller unchanged, and nothing in them changes the request.
await probe('title with markup and quotes', async () => {
  const title = `<img src=x onerror=alert(1)> "A&B" Erzsébet tér (Budapest)`
  const { fetch } = fake(huPages(page(5, { title })))
  const [article] = await fetchArticles(SMALL, fetch)
  return article.titles.hu === title
})

// One Hungarian page and one English page disagree on the id's owner: an English page with an id, a Hungarian one without.
await probe('Hungarian page with no id, English page with one', async () => {
  const { fetch } = fake(({ edition, params }) => {
    if (params.has('list')) return { query: { geosearch: [page(edition === 'hu' ? 1 : 2)] } }
    return edition === 'hu' ? { query: { pages: [{ pageid: 1 }] } } : { query: { pages: [{ pageid: 2, pageprops: { wikibase_item: 'Q2' } }] } }
  })
  return (await fetchArticles(SMALL, fetch)).map(({ q, pageids }) => ({ q, pageids }))
})

// A `continue` that never ends: this path has no floor, unlike the tile split. Stops the probe after 2,000 calls.
await probe('continue that never ends', async () => {
  const { fetch, calls } = fake(({ edition, params }, all) => {
    if (all.length > 2_000) throw new Error('probe stopped it after 2,000 calls')
    if (edition !== 'hu') return undefined
    if (params.has('list')) return { query: { geosearch: [page(1)] } }
    return { continue: { llcontinue: '1|de', continue: '||' }, query: { pages: [{ pageid: 1 }] } }
  })
  // The fake throws inside fetch, so `call` would wait out its real backoff. Race it and report the count.
  const outcome = await Promise.race([
    fetchArticles(SMALL, fetch).then(() => 'ended', (error) => `rejected: ${error.message}`),
    new Promise((resolve) => setTimeout(() => resolve('still calling when the probe stopped watching'), 3_000)),
  ])
  return { outcome, calls: calls.length }
})

// Retry-After values at the edges of what a timer can hold. Fake timers would hide the overflow, so this reads the real timer.
await probe('Retry-After too large for a timer', async () => {
  const warnings = []
  process.on('warning', (warning) => warnings.push(warning.name))
  const { fetch, calls } = fake((_, all) =>
    all.length === 1 ? new Response('busy', { status: 503, headers: { 'Retry-After': '99999999' } }) : undefined,
  )
  const started = Date.now()
  await fetchArticles(SMALL, fetch)
  await new Promise((resolve) => setTimeout(resolve, 20))
  return { secondsWaited: (Date.now() - started) / 1000, calls: calls.length, warnings }
})

// Scale: a fake API over the real coverage box that honours the bbox and the 500 cap, as the live one does.
// Planning counted 2,644 Hungarian articles. Half sit in a dense centre, and some sit exactly on tile and split edges.
await probe('scale over the real coverage box', async () => {
  const BOX = [18.925, 47.35, 19.335, 47.62]
  let seed = 42
  const random = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296
  const within = (low, high) => low + random() * (high - low)
  const world = { hu: [], en: [] }
  const place = (edition, pageid, lat, lon) => world[edition].push({ pageid, title: `${edition} ${pageid}`, lat, lon })
  let id = 1
  for (const [edition, total] of [['hu', 2644], ['en', 1500]]) {
    for (let i = 0; i < total; i++) {
      const dense = i % 2 === 0
      const lat = dense ? within(47.485, 47.515) : within(BOX[1], BOX[3])
      const lon = dense ? within(19.03, 19.08) : within(BOX[0], BOX[2])
      place(edition, id++, lat, lon)
    }
    // Exactly on a tile edge, on a tile corner, on a first split edge and on the box's own edges.
    for (const [lat, lon] of [[47.5, 19.04], [47.5, 19], [47.475, 19.0375], [47.35, 18.925], [47.62, 19.335]]) place(edition, id++, lat, lon)
  }
  const { fetch, calls } = fake(({ edition, params }) => {
    if (params.has('list')) {
      const [north, west, south, east] = params.get('gsbbox').split('|').map(Number)
      const found = world[edition].filter(({ lat, lon }) => lat <= north && lat >= south && lon >= west && lon <= east)
      return { query: { geosearch: found.slice(0, Number(params.get('gslimit'))) } }
    }
    return undefined
  })
  const articles = await fetchArticles(BOX, fetch)
  const got = new Set(articles.flatMap(({ pageids }) => Object.values(pageids)))
  const all = [...world.hu, ...world.en].map(({ pageid }) => pageid)
  const searches = calls.filter(({ params }) => params.has('list'))
  return {
    pagesInWorld: all.length,
    articles: articles.length,
    lost: all.filter((pageid) => !got.has(pageid)).length,
    calls: calls.length,
    huCalls: calls.filter(({ edition }) => edition === 'hu').length,
    searches: searches.length,
    searchesBeyondThe72Tiles: searches.length - 72,
    note: 'no continuations in this fake, so a real run adds those to the calls',
  }
})

// A replay asked for a URL it never recorded: its 404 goes through the real retries. #11 replays this recording.
await probe('replaying a URL that was never recorded', async () => {
  const { replayingFetch } = await import(pathToFileURL(process.argv[2].replace(/wikipedia\.ts$/, 'wikipedia-fixture.ts')).href)
  const started = Date.now()
  const message = await fetchArticles(SMALL, replayingFetch({})).catch((error) => error.message.slice(0, 60))
  return { secondsBeforeItFails: Math.round((Date.now() - started) / 1000), message }
})

process.exit(0)
