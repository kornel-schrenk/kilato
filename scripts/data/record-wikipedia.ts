// Calls the live Wikipedia API. `npm run record:wikipedia` runs this by hand, and no test does.
// Node runs it without a build, so these imports name the .ts files.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fetchArticles } from './wikipedia.ts'
import { FIXTURE_BOX, FIXTURE_FILE, recordingFetch, type Responses } from './wikipedia-fixture.ts'

const responses: Responses = {}
const articles = await fetchArticles(FIXTURE_BOX, recordingFetch(fetch, responses))

mkdirSync(dirname(FIXTURE_FILE), { recursive: true })
writeFileSync(FIXTURE_FILE, `${JSON.stringify(responses, null, 2)}\n`)
console.log(`Recorded ${Object.keys(responses).length} responses with ${articles.length} articles in ${FIXTURE_FILE}`)
