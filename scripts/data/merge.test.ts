import { describe, expect, it } from 'vitest'
import { mergeArticles } from './merge'
import type { OsmPlace } from './osm'
import type { Article } from './wikipedia'

const place = (id: string, tags: Partial<OsmPlace> = {}): OsmPlace => ({
  id,
  cat: 'sights',
  kind: 'museum',
  lat: 47.5,
  lon: 19.05,
  name: `Hely ${id}`,
  ...tags,
})

const article = (overrides: Partial<Article> = {}): Article => ({
  q: 'Q1',
  lat: 47.4975,
  lon: 19.055,
  pageids: { hu: 11 },
  titles: { hu: 'Cikk', en: 'Article', de: 'Artikel' },
  ...overrides,
})

const CIKK_WIKI = { q: 'Q1', hu: 'Cikk', en: 'Article' }

const wikiById = (places: ReturnType<typeof mergeArticles>) => Object.fromEntries(places.map(({ id, wiki }) => [id, wiki]))

describe('attaching an article by its Wikidata id', () => {
  it('attaches to every place with the same wikidata', () => {
    const merged = mergeArticles([place('n1', { wikidata: 'Q1' }), place('w2', { wikidata: 'Q1' }), place('n3', { wikidata: 'Q9' })], [article()])

    expect(wikiById(merged)).toEqual({ n1: CIKK_WIKI, w2: CIKK_WIKI, n3: undefined })
  })

  it('takes the Hungarian and English titles only, so other languages stay out of the place', () => {
    const [merged] = mergeArticles([place('n1', { wikidata: 'Q1' })], [article()])

    expect(merged.wiki).toEqual({ q: 'Q1', hu: 'Cikk', en: 'Article' })
  })

  it('leaves out the edition an article does not have', () => {
    const [merged] = mergeArticles([place('n1', { wikidata: 'Q1' })], [article({ titles: { hu: 'Cikk' } })])

    expect(JSON.parse(JSON.stringify(merged.wiki))).toEqual({ q: 'Q1', hu: 'Cikk' })
  })
})

describe('attaching an article by the wikipedia tag', () => {
  it('attaches to every place whose hu: tag names the Hungarian title', () => {
    const merged = mergeArticles([place('n1', { wikipedia: 'hu:Cikk' }), place('n2', { wikipedia: 'hu:Cikk' })], [article()])

    expect(wikiById(merged)).toEqual({ n1: CIKK_WIKI, n2: CIKK_WIKI })
  })

  it('attaches to a place whose en: tag names the English title', () => {
    const merged = mergeArticles([place('n1', { wikipedia: 'en:Article' })], [article()])

    expect(wikiById(merged)).toEqual({ n1: CIKK_WIKI })
  })

  it('counts underscores as spaces', () => {
    const titles = { hu: 'Magyar Állami Operaház', en: 'Hungarian State Opera' }
    const merged = mergeArticles([place('n1', { wikipedia: 'hu:Magyar_Állami_Operaház' }), place('n2', { wikipedia: 'en:Hungarian_State_Opera' })], [article({ titles })])

    const wiki = { q: 'Q1', ...titles }
    expect(wikiById(merged)).toEqual({ n1: wiki, n2: wiki })
  })

  it('does not read the title of one language in a tag of the other', () => {
    const merged = mergeArticles([place('n1', { wikipedia: 'en:Cikk' })], [article()])

    expect(merged.find(({ id }) => id === 'n1')?.wiki).toEqual({ en: 'Cikk' })
    expect(merged.map(({ id }) => id)).toEqual(['n1', 'Q1'])
  })

  it('does not use the tag when another place has the article by its wikidata', () => {
    const merged = mergeArticles([place('n1', { wikidata: 'Q1' }), place('n2', { wikipedia: 'hu:Cikk' })], [article()])

    expect(wikiById(merged)).toEqual({ n1: CIKK_WIKI, n2: { hu: 'Cikk' } })
  })

  it('keeps the wikidata article on a place whose tag names a second article, whichever comes first', () => {
    const second = article({ q: 'Q2', pageids: { hu: 12 }, titles: { hu: 'Másik' } })
    const tagged = place('n1', { wikidata: 'Q1', wikipedia: 'hu:Másik' })

    expect(wikiById(mergeArticles([tagged], [second, article()]))).toEqual({ n1: CIKK_WIKI })
    expect(wikiById(mergeArticles([tagged], [article(), second]))).toEqual({ n1: CIKK_WIKI })
  })
})

describe('a place whose wikipedia tag matched no fetched article', () => {
  it('keeps a Hungarian link, with the title from the tag and spaces for underscores', () => {
    const [merged] = mergeArticles([place('n1', { wikipedia: 'hu:Nem_Letöltött Cikk' })], [])

    expect(merged.wiki).toEqual({ hu: 'Nem Letöltött Cikk' })
  })

  it('keeps an English link', () => {
    const [merged] = mergeArticles([place('n1', { wikipedia: 'en:Gresham_Palace' })], [])

    expect(merged.wiki).toEqual({ en: 'Gresham Palace' })
  })

  it('has no link from a tag in another language, or without a language', () => {
    const merged = mergeArticles([place('n1', { wikipedia: 'de:Oper' }), place('n2', { wikipedia: 'Oper' })], [])

    expect(wikiById(merged)).toEqual({ n1: undefined, n2: undefined })
  })
})

describe('a place with no article', () => {
  it('has no wiki when its wikidata matched nothing and it has no wikipedia tag', () => {
    const [merged] = mergeArticles([place('n1', { wikidata: 'Q9' })], [])

    expect(merged).not.toHaveProperty('wiki')
  })
})

describe('the places that come out', () => {
  it('keep their fields and lose the tags only the merge and the hours read', () => {
    const osmPlace = place('n1', {
      names: { en: 'Place' },
      wikidata: 'Q1',
      wikipedia: 'hu:Cikk',
      opening_hours: '24/7',
      hours: [[0, 20160]],
    } as Partial<OsmPlace>)

    expect(mergeArticles([osmPlace], [article()])).toStrictEqual([
      {
        id: 'n1',
        cat: 'sights',
        kind: 'museum',
        lat: 47.5,
        lon: 19.05,
        name: 'Hely n1',
        names: { en: 'Place' },
        hours: [[0, 20160]],
        wiki: { q: 'Q1', hu: 'Cikk', en: 'Article' },
      },
    ])
  })

  it('come in the order they went in, with the notable places after them', () => {
    const merged = mergeArticles([place('n2'), place('n1')], [article({ q: 'Q2' }), article({ q: 'Q1', titles: { hu: 'Másik' } })])

    expect(merged.map(({ id }) => id)).toEqual(['n2', 'n1', 'Q2', 'Q1'])
  })
})

describe('an article that attached to nothing', () => {
  it('becomes a notable place of kind article, at its own position', () => {
    expect(mergeArticles([], [article({ lat: 47.497777777778, lon: 19.054722222222 })])).toStrictEqual([
      {
        id: 'Q1',
        cat: 'notable',
        kind: 'article',
        lat: 47.49778,
        lon: 19.05472,
        name: 'Cikk',
        names: { en: 'Article' },
        wiki: { q: 'Q1', hu: 'Cikk', en: 'Article' },
      },
    ])
  })

  it('is cut of a trailing parenthesis in its name and its English name', () => {
    const titles = { hu: 'Deák Ferenc tér (Budapest)', en: 'Deák Square (metro)' }
    const [merged] = mergeArticles([], [article({ titles })])

    expect(merged.name).toBe('Deák Ferenc tér')
    expect(merged.names).toEqual({ en: 'Deák Square' })
  })

  it('keeps the whole titles in its link, because the link needs them', () => {
    const titles = { hu: 'Deák Ferenc tér (Budapest)', en: 'Deák Square (metro)' }
    const [merged] = mergeArticles([], [article({ titles })])

    expect(merged.wiki).toEqual({ q: 'Q1', ...titles })
  })

  it.each([
    ['Foo (bar) baz', 'Foo (bar) baz'],
    ['Foo (bar) (baz)', 'Foo (bar)'],
    ['(Budapest)', '(Budapest)'],
  ])('reads the name of %s as %s', (title, name) => {
    const [merged] = mergeArticles([], [article({ titles: { hu: title } })])

    expect(merged.name).toBe(name)
  })

  it('has no English name when the English title, once cut, is the name', () => {
    const [merged] = mergeArticles([], [article({ titles: { hu: 'Gozsdu-udvar (Budapest)', en: 'Gozsdu-udvar' } })])

    expect(merged.name).toBe('Gozsdu-udvar')
    expect(merged).not.toHaveProperty('names')
  })

  it('takes the English title for its name when there is no Hungarian article', () => {
    const [merged] = mergeArticles([], [article({ pageids: { en: 21 }, titles: { en: 'Gozsdu Court (Budapest)' } })])

    expect(merged.name).toBe('Gozsdu Court')
    expect(merged).not.toHaveProperty('names')
  })

  it('takes the Hungarian title from a language link when only the English search found it', () => {
    const [merged] = mergeArticles([], [article({ pageids: { en: 21 }, titles: { en: 'Opera', hu: 'Operaház' } })])

    expect(merged.name).toBe('Operaház')
    expect(merged.names).toEqual({ en: 'Opera' })
  })

  it.each([
    ['Q7', { hu: 11 }, 'Q7'],
    ['Q7', { hu: 11, en: 21 }, 'Q7'],
    [undefined, { hu: 11 }, 'huwiki:11'],
    [undefined, { en: 21 }, 'enwiki:21'],
  ])('with Wikidata id %s and pages %j has the id %s', (q, pageids, id) => {
    const [merged] = mergeArticles([], [article({ q, pageids })])

    expect(merged.id).toBe(id)
  })

  it('does not become a place when a place holds it by its tag alone', () => {
    const merged = mergeArticles([place('n1', { wikipedia: 'en:Article' })], [article()])

    expect(merged.map(({ id }) => id)).toEqual(['n1'])
  })

  it('does not become a place when its tag names a place that already has another article', () => {
    const second = article({ q: 'Q2', pageids: { hu: 12 }, titles: { hu: 'Másik' } })
    const merged = mergeArticles([place('n1', { wikidata: 'Q1', wikipedia: 'hu:Másik' })], [article(), second])

    expect(merged.map(({ id }) => id)).toEqual(['n1'])
  })
})
