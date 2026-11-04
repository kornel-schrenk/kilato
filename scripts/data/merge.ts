import type { Place } from '../../src/core/types'
import { round5, type OsmPlace } from './osm.ts'
import type { Article } from './wikipedia'

type Wiki = NonNullable<Place['wiki']>

/** A place from OpenStreetMap, with its hours if they've been worked out. */
type PlaceToMerge = OsmPlace & Pick<Place, 'hours'>

const withoutTrailingParenthesis = (title: string) => title.replace(/ \([^()]*\)$/, '')

/** A `wikipedia` tag with the spaces a title has. Underscores in a tag count as spaces. */
const tagTitle = (tag: string | undefined) => tag?.replaceAll('_', ' ')

function linkFromTag(tag: string | undefined): Wiki | undefined {
  const match = tagTitle(tag)?.match(/^(hu|en):(.+)$/)
  return match ? { [match[1]]: match[2] } : undefined
}

const wikiOf = ({ q, titles }: Article): Wiki => ({ q, hu: titles.hu, en: titles.en })

function notablePlace(article: Article): Place {
  const { q, lat, lon, pageids, titles } = article
  const name = withoutTrailingParenthesis(titles.hu ?? titles.en)
  const en = titles.en && withoutTrailingParenthesis(titles.en)
  return {
    id: q ?? (pageids.hu ? `huwiki:${pageids.hu}` : `enwiki:${pageids.en}`),
    cat: 'notable',
    kind: 'article',
    lat: round5(lat),
    lon: round5(lon),
    name,
    ...(en && en !== name && { names: { en } }),
    wiki: wikiOf(article),
  }
}

function groupedBy(places: PlaceToMerge[], key: (place: PlaceToMerge) => string | undefined) {
  const groups = new Map<string, PlaceToMerge[]>()
  for (const place of places) {
    const value = key(place)
    if (value) groups.set(value, [...(groups.get(value) ?? []), place])
  }
  return groups
}

/**
 * Joins the articles to the places. An article goes on the places with its Wikidata id, and
 * only when there are none, on the places whose `wikipedia` tag names it. A place keeps a
 * Wikidata match over a tag match, and a place with neither keeps the link in its tag.
 * The articles left over follow the places, as notable places of their own.
 */
export function mergeArticles(osmPlaces: PlaceToMerge[], articles: Article[]): Place[] {
  const byWikidata = groupedBy(osmPlaces, ({ wikidata }) => wikidata)
  const byTag = groupedBy(osmPlaces, ({ wikipedia }) => tagTitle(wikipedia))
  const attached = new Map<PlaceToMerge, Wiki>()

  const withoutWikidataMatch: Article[] = []
  for (const article of articles) {
    const places = article.q ? byWikidata.get(article.q) : undefined
    if (!places) withoutWikidataMatch.push(article)
    for (const place of places ?? []) attached.set(place, wikiOf(article))
  }

  const notable: Article[] = []
  for (const article of withoutWikidataMatch) {
    const places = [`hu:${article.titles.hu}`, `en:${article.titles.en}`].flatMap((tag) => byTag.get(tag) ?? [])
    if (places.length === 0) notable.push(article)
    for (const place of places) if (!attached.has(place)) attached.set(place, wikiOf(article))
  }

  const places = osmPlaces.map((osmPlace) => {
    const { wikidata, wikipedia, opening_hours, ...place } = osmPlace
    const wiki = attached.get(osmPlace) ?? linkFromTag(wikipedia)
    return wiki ? { ...place, wiki } : place
  })
  return [...places, ...notable.map(notablePlace)]
}
