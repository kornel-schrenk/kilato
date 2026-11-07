import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchArticles, type Fetch } from './wikipedia'
import { FIXTURE_BOX, FIXTURE_FILE, recordingFetch, replayingFetch, type Responses } from './wikipedia-fixture'

const URL_A = 'https://hu.wikipedia.org/w/api.php?a'

/** What the API sends for a search: each page carries fields the fetch never reads. */
const geosearchReply = {
  batchcomplete: true,
  query: { geosearch: [{ pageid: 1, ns: 0, title: 'Hely', lat: 47.5, lon: 19.05, dist: 12.5, primary: true }] },
}

const detailsReply = {
  continue: { llcontinue: '1|de', continue: '||pageprops' },
  query: {
    normalized: [{ fromencoded: false, from: 'a', to: 'b' }],
    pages: [{ pageid: 1, ns: 0, title: 'Hely', pageprops: { wikibase_item: 'Q1' }, langlinks: [{ lang: 'de', title: 'Ort' }] }, { pageid: 2, ns: 0, title: 'Más' }],
  },
}

const answering = (response: () => Response): Fetch => async () => response()

describe('recordingFetch', () => {
  it('keeps a search reply with only the fields the fetch reads', async () => {
    const responses: Responses = {}
    await recordingFetch(answering(() => Response.json(geosearchReply)), responses)(URL_A)

    expect(responses).toEqual({ [URL_A]: { query: { geosearch: [{ pageid: 1, title: 'Hely', lat: 47.5, lon: 19.05 }] } } })
  })

  it('keeps a details reply with only the fields the fetch reads, and its continue', async () => {
    const responses: Responses = {}
    await recordingFetch(answering(() => Response.json(detailsReply)), responses)(URL_A)

    expect(responses).toEqual({
      [URL_A]: {
        continue: { llcontinue: '1|de', continue: '||pageprops' },
        query: { pages: [{ pageid: 1, pageprops: { wikibase_item: 'Q1' }, langlinks: [{ lang: 'de', title: 'Ort' }] }, { pageid: 2 }] },
      },
    })
  })

  it('keeps the language links of hu, en and de only', async () => {
    const responses: Responses = {}
    const langlinks = ['cs', 'de', 'en', 'fr', 'hu'].map((lang) => ({ lang, title: `Hely ${lang}` }))
    const reply = { query: { pages: [{ pageid: 1, langlinks }] } }
    await recordingFetch(answering(() => Response.json(reply)), responses)(URL_A)

    expect(responses).toEqual({
      [URL_A]: {
        query: {
          pages: [
            {
              pageid: 1,
              langlinks: [
                { lang: 'de', title: 'Hely de' },
                { lang: 'en', title: 'Hely en' },
                { lang: 'hu', title: 'Hely hu' },
              ],
            },
          ],
        },
      },
    })
  })

  it('hands the whole reply on to the caller', async () => {
    const response = await recordingFetch(answering(() => Response.json(geosearchReply)), {})(URL_A)

    expect(await response.json()).toEqual(geosearchReply)
  })

  it('keeps no failed reply, so a retried call records what finally worked', async () => {
    const responses: Responses = {}
    await recordingFetch(answering(() => new Response('busy', { status: 503 })), responses)(URL_A)
    await recordingFetch(answering(() => Response.json({ error: { code: 'maxlag' } })), responses)(URL_A)

    expect(responses).toEqual({})
  })
})

describe('replayingFetch', () => {
  it('answers a recorded URL with its reply', async () => {
    const reply = { query: { geosearch: [] } }
    const response = await replayingFetch({ [URL_A]: reply })(URL_A)

    expect(await response.json()).toEqual(reply)
  })

  it('answers any other URL with an error', async () => {
    const response = await replayingFetch({})(URL_A)

    expect(response.status).toBe(404)
  })

  it('gives fetchArticles the same articles the recorded calls gave it', async () => {
    const box: [number, number, number, number] = [19, 47, 19.01, 47.01]
    const live: Fetch = async (input) => {
      const { hostname, searchParams } = new URL(String(input))
      if (hostname.startsWith('en')) return Response.json({ query: { geosearch: [] } })
      return Response.json(searchParams.has('list') ? geosearchReply : { query: { pages: [detailsReply.query.pages[0]] } })
    }
    const responses: Responses = {}

    const recorded = await fetchArticles(box, recordingFetch(live, responses))
    const replayed = await fetchArticles(box, replayingFetch(responses))

    expect(recorded).toEqual([{ q: 'Q1', lat: 47.5, lon: 19.05, pageids: { hu: 1 }, titles: { hu: 'Hely', de: 'Ort' } }])
    expect(replayed).toEqual(recorded)
  })
})

describe('the recording in test/fixtures/wikipedia', () => {
  const responses = JSON.parse(readFileSync(FIXTURE_FILE, 'utf8')) as Record<string, Record<string, unknown>>
  const replayed = () => fetchArticles(FIXTURE_BOX, replayingFetch(responses))

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('replays the whole fetch without calling the API', async () => {
    const liveFetch = vi.fn()
    vi.stubGlobal('fetch', liveFetch)

    expect((await replayed()).length).toBeGreaterThan(100)
    expect(liveFetch).not.toHaveBeenCalled()
  })

  it('has one article for Gresham Palace, positioned where the Hungarian one is', async () => {
    expect((await replayed()).filter(({ q }) => q === 'Q854317')).toEqual([
      {
        q: 'Q854317',
        lat: 47.499722222222,
        lon: 19.048055555556,
        pageids: { hu: 22368, en: 4116284 },
        titles: { hu: 'Gresham-palota', en: 'Gresham Palace', de: 'Gresham-palota' },
      },
    ])
  })

  it('has the articles the OpenStreetMap fixture names by Wikidata id', async () => {
    const articles = await replayed()

    expect(articles.find(({ q }) => q === 'Q36833')).toMatchObject({
      lat: 47.502498,
      lon: 19.05863,
      titles: { hu: 'Magyar Állami Operaház', en: 'Hungarian State Opera House', de: 'Ungarische Staatsoper' },
    })
    expect(articles.find(({ q }) => q === 'Q934453')).toMatchObject({ titles: { hu: 'Erzsébet tér (Budapest)' } })
  })

  it('holds a real continuation', () => {
    expect(Object.keys(responses).filter((url) => url.includes('llcontinue'))).toHaveLength(1)
  })

  it('is trimmed', () => {
    for (const reply of Object.values(responses)) {
      expect(reply).not.toHaveProperty('batchcomplete')
      const { geosearch = [], pages = [] } = reply.query as {
        geosearch?: object[]
        pages?: { langlinks?: { lang: string }[] }[]
      }
      for (const page of geosearch) expect(Object.keys(page)).toEqual(['pageid', 'title', 'lat', 'lon'])
      for (const page of pages) {
        for (const { lang } of page.langlinks ?? []) expect(['hu', 'en', 'de']).toContain(lang)
      }
    }
  })
})
