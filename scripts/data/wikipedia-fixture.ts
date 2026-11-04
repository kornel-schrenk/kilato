import { join } from 'node:path'
import type { Manifest } from '../../src/core/types'
import type { Fetch, Reply } from './wikipedia'

/** A small box around Deák Ferenc tér. It has the OpenStreetMap fixture's Opera and Gresham Palace in it. */
export const FIXTURE_BOX: Manifest['box'] = [19.045, 47.491, 19.065, 47.505]

export const FIXTURE_FILE = join(import.meta.dirname, '../../test/fixtures/wikipedia/responses.json')

/** Recorded replies by the URL of their call. */
export type Responses = Record<string, unknown>

/** The page tests need one language beyond hu and en, and the spec's example of one is de. */
const KEPT_LANGUAGES = ['hu', 'en', 'de']

/** Keeps what `fetchArticles` reads, and of the language links only `KEPT_LANGUAGES`. */
function trimmed({ continue: next, query }: Reply) {
  return {
    ...(next && { continue: next }),
    query: query.geosearch
      ? { geosearch: query.geosearch.map(({ pageid, title, lat, lon }) => ({ pageid, title, lat, lon })) }
      : {
          pages: query.pages.map(({ pageid, pageprops, langlinks }) => ({
            pageid,
            pageprops,
            langlinks: langlinks?.filter(({ lang }) => KEPT_LANGUAGES.includes(lang)),
          })),
        },
  }
}

/** A `fetch` that keeps the trimmed reply of each call that worked. */
export function recordingFetch(fetch: Fetch, responses: Responses): Fetch {
  return async (input, init) => {
    const response = await fetch(input, init)
    if (response.ok) {
      const reply = (await response.clone().json()) as Reply
      if (!reply.error) responses[String(input)] = trimmed(reply)
    }
    return response
  }
}

/** A `fetch` that answers from recorded replies, and never reaches the network. */
export function replayingFetch(responses: Responses): Fetch {
  return async (input) => {
    const reply = responses[String(input)]
    return reply ? Response.json(reply) : new Response(`Not recorded: ${input}`, { status: 404 })
  }
}
