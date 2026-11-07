// QA harness for #10. Runs the real fetchArticles with Node's real fetch against a local HTTP
// server standing in for Wikipedia, so headers, overlap and backoff are seen on the wire.
// No call leaves this machine. Usage: node wire-check.mjs <path to scripts/data/wikipedia.ts>
import assert from 'node:assert/strict'
import http from 'node:http'
import { pathToFileURL } from 'node:url'

const { fetchArticles } = await import(pathToFileURL(process.argv[2]).href)
const UA = 'Kilato/1.0 (https://github.com/kornel-schrenk/kilato)'

function serve(answer) {
  const log = []
  let running = 0
  let mostRunning = 0
  const server = http.createServer(async (req, res) => {
    mostRunning = Math.max(mostRunning, ++running)
    const url = new URL(req.url, 'http://local')
    const entry = { edition: url.pathname.split('/')[1], params: url.searchParams, ua: req.headers['user-agent'], at: Date.now() }
    log.push(entry)
    await new Promise((resolve) => setTimeout(resolve, 15))
    running--
    const { status = 200, headers = {}, body, destroy } = answer(entry, log)
    if (destroy) return req.socket.destroy()
    res.writeHead(status, { 'content-type': 'application/json', ...headers })
    res.end(typeof body === 'string' ? body : JSON.stringify(body))
  })
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      const local = (input, init) => {
        const url = new URL(String(input))
        return fetch(`http://127.0.0.1:${port}/${url.hostname.split('.')[0]}${url.pathname}${url.search}`, init)
      }
      resolve({ local, log, most: () => mostRunning, close: () => new Promise((done) => server.close(done)) })
    }),
  )
}

const pages = (first, count) =>
  Array.from({ length: count }, (_, i) => ({ pageid: first + i, title: `Cikk ${first + i}`, lat: 47.36, lon: 18.95 }))
const details = ({ params }) => ({ query: { pages: params.get('pageids').split('|').map((id) => ({ pageid: Number(id) })) } })
const empty = (entry) => (entry.params.has('list') ? { query: { geosearch: [] } } : details(entry))
const seconds = (log) => log.slice(1).map((entry, i) => ((entry.at - log[i].at) / 1000).toFixed(1))
const TILE = [18.925, 47.35, 19, 47.4]
const FULL = '47.4|18.925|47.35|19'

// A: every kind of call on the wire, including a split and a continuation.
{
  const { local, log, most, close } = await serve((entry) => {
    const { edition, params } = entry
    if (edition !== 'hu') return { body: empty(entry) }
    if (params.has('list')) {
      const bbox = params.get('gsbbox')
      if (bbox === FULL) return { body: { query: { geosearch: pages(1, 500) } } }
      return { body: { query: { geosearch: bbox === '47.375|18.925|47.35|18.9625' ? pages(1000, 120) : [] } } }
    }
    if (params.has('llcontinue')) return { body: details(entry) }
    return { body: { ...details(entry), continue: { llcontinue: '1|de', continue: '||pageprops' } } }
  })
  const articles = await fetchArticles(TILE, local)
  await close()

  for (const { ua, params } of log) {
    assert.equal(ua, UA)
    assert.equal(params.get('maxlag'), '5')
    assert.equal(params.get('formatversion'), '2')
  }
  assert.equal(most(), 1, 'calls overlapped')
  const searches = log.filter(({ params }) => params.has('list'))
  for (const { params } of searches) {
    assert.equal(params.get('gslimit'), '500')
    assert.equal(params.get('gsprimary'), 'primary')
    assert.equal(params.get('gsnamespace'), '0')
  }
  const huTiles = searches.filter(({ edition }) => edition === 'hu').map(({ params }) => params.get('gsbbox'))
  assert.deepEqual(huTiles, [FULL, '47.375|18.925|47.35|18.9625', '47.375|18.9625|47.35|19', '47.4|18.925|47.375|18.9625', '47.4|18.9625|47.375|19'])
  const firstDetails = log.filter(({ edition, params }) => edition === 'hu' && params.has('prop') && !params.has('llcontinue'))
  assert.deepEqual(firstDetails.map(({ params }) => params.get('pageids').split('|').length), [50, 50, 20])
  for (const { params } of firstDetails) {
    assert.equal(params.get('prop'), 'pageprops|langlinks')
    assert.equal(params.get('ppprop'), 'wikibase_item')
    assert.equal(params.get('lllimit'), 'max')
  }
  assert.equal(articles.length, 120)
  console.log(`A pass: ${log.length} requests, every one with the exact User-Agent, maxlag=5, formatversion=2`)
  console.log(`A pass: most requests in flight at once = ${most()}`)
  console.log(`A pass: hu tiles asked = ${huTiles.join('  ')}`)
  console.log(`A pass: hu detail calls, ids per call = ${firstDetails.map(({ params }) => params.get('pageids').split('|').length).join(',')}, each followed by its continuation`)
  console.log(`A pass: ${articles.length} articles`)
}

// B: a real maxlag reply, a real 503 and a real dropped connection, then success, with real timers.
{
  const script = [
    { headers: { 'Retry-After': '1' }, body: { error: { code: 'maxlag', info: 'Waiting for a replica' } } },
    { status: 503, body: 'busy' },
    { destroy: true },
  ]
  const { local, log, close } = await serve((entry, all) => (all.length <= script.length ? script[all.length - 1] : { body: empty(entry) }))
  const articles = await fetchArticles(TILE, local)
  await close()

  const gaps = seconds(log.slice(0, 4))
  assert.equal(articles.length, 0)
  assert.ok(Number(gaps[0]) >= 5 && Number(gaps[1]) >= 10 && Number(gaps[2]) >= 20, `gaps ${gaps}`)
  console.log(`B pass: maxlag, then 503, then a dropped connection, then success. Seconds between attempts = ${gaps.join(', ')}`)
}

// C: a call that never recovers fails the fetch, and nothing is called after it.
{
  const started = Date.now()
  const { local, log, close } = await serve(() => ({ status: 503, body: 'busy' }))
  await assert.rejects(fetchArticles(TILE, local), /after 3 retries.*HTTP 503/)
  await close()
  assert.equal(log.length, 4)
  assert.ok(log.every(({ edition }) => edition === 'hu'))
  console.log(`C pass: 4 attempts (1 + 3 retries), then the fetch rejected after ${((Date.now() - started) / 1000).toFixed(1)} s. No English call followed`)
}
