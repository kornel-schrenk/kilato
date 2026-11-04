// Inputs the unit tests don't pin, or that a reader may want to see the result of. Run from the project
// root with: node docs/super-board/runs/issue-11-qa-v1/edge-probes.mjs
// It is no part of the test suite, and it calls nothing outside this process.
import { mergeArticles } from '../../../../scripts/data/merge.ts'

const place = (id, tags = {}) => ({ id, cat: 'sights', kind: 'museum', lat: 47.5, lon: 19.05, name: `Hely ${id}`, ...tags })
const article = (overrides) => ({ q: 'Q1', lat: 47.5, lon: 19.05, pageids: { hu: 11 }, titles: { hu: 'Cikk' }, ...overrides })
const show = (label, places, articles) => {
  console.log(label)
  console.log(`  ${JSON.stringify(mergeArticles(places, articles).map(({ id, name, wiki }) => ({ id, name, wiki })))}`)
}

show(
  'A place whose tags name two different articles: Q1 by wikidata and Q2 by wikipedia. Q2 is on no place and is no notable place.',
  [place('n1', { wikidata: 'Q1', wikipedia: 'hu:Masik' })],
  [article({}), article({ q: 'Q2', pageids: { hu: 12 }, titles: { hu: 'Masik' } })],
)
show(
  'A tag names an article that another place holds by wikidata: the link comes from the tag, with no q and no en.',
  [place('n1', { wikidata: 'Q1' }), place('n2', { wikipedia: 'hu:Cikk' })],
  [article({ titles: { hu: 'Cikk', en: 'Article' } })],
)
show('A tag with a section does not name the article, so the article stays notable.', [place('n1', { wikipedia: 'hu:Cikk#Szakasz' })], [article({})])
show('A tag that starts in lower case does not name the article, though MediaWiki treats the two as one title.', [place('n1', { wikipedia: 'hu:cikk' })], [article({})])
show('An article with no Hungarian title against a place tagged with the literal hu:undefined.', [place('n1', { wikipedia: 'hu:undefined' })], [article({ pageids: { en: 21 }, titles: { en: 'Article' } })])
