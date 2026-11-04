import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Place } from '../../src/core/types'
import type { Article } from './wikipedia'
import { writeData, type DataTree } from './write'

/** Deák Ferenc tér, the spec's example of the key 4749_1270. */
const DEAK: Place = { id: 'n1', cat: 'food', kind: 'cafe', lat: 47.4975, lon: 19.0545, name: 'Kávézó', names: { en: 'Café' }, hours: [[0, 60]], wiki: { q: 'Q1', hu: 'Kávézó' } }
const DEAK_TOO: Place = { id: 'n2', cat: 'shops', kind: 'books', lat: 47.4976, lon: 19.0546, name: 'Könyvesbolt' }
const OPERA: Place = { id: 'Q2', cat: 'notable', kind: 'article', lat: 47.5027, lon: 19.0584, name: 'Operaház' }

const article = (q: string | undefined, titles: Record<string, string>): Article => ({ q, lat: 47.5, lon: 19.05, pageids: { hu: 1 }, titles })

const tree = (overrides: Partial<DataTree> = {}): DataTree => ({
  builtAt: '2026-11-02T03:40:00.000Z',
  osmDataAt: '2026-11-01T21:21:02.000Z',
  wikipediaAt: '2026-11-02T03:20:00.000Z',
  hoursWindowStart: '2026-11-01T23:00:00.000Z',
  box: [18.925, 47.35, 19.335, 47.62],
  places: [DEAK, DEAK_TOO, OPERA],
  articles: [],
  ...overrides,
})

describe('writeData', () => {
  let out: string
  const json = (path: string) => JSON.parse(readFileSync(join(out, path), 'utf8'))

  beforeEach(() => {
    out = join(mkdtempSync(join(tmpdir(), 'kilato-write-')), 'data')
  })
  afterEach(() => {
    rmSync(join(out, '..'), { recursive: true, force: true })
  })

  it('writes every Manifest field', () => {
    writeData(out, tree({ articles: [article('Q1', { hu: 'Kávézó', de: 'Café' })] }))

    expect(json('manifest.json')).toStrictEqual({
      version: 1,
      builtAt: '2026-11-02T03:40:00.000Z',
      osmDataAt: '2026-11-01T21:21:02.000Z',
      wikipediaAt: '2026-11-02T03:20:00.000Z',
      hoursWindowStart: '2026-11-01T23:00:00.000Z',
      box: [18.925, 47.35, 19.335, 47.62],
      cells: ['4749_1270', '4750_1270'],
      wikiLangs: ['de'],
    })
  })

  it('writes one cell file per non-empty cell, with the whole places in it', () => {
    writeData(out, tree())

    expect(readdirSync(join(out, 'cells')).sort()).toEqual(['4749_1270.json', '4750_1270.json'])
    expect(json('cells/4749_1270.json')).toStrictEqual({ places: [DEAK, DEAK_TOO] })
    expect(json('cells/4750_1270.json')).toStrictEqual({ places: [OPERA] })
  })

  it('writes a wiki file for every language except hu and en', () => {
    writeData(
      out,
      tree({
        articles: [article('Q1', { hu: 'Kávézó', en: 'Café', de: 'Kaffeehaus', fr: 'Café (lieu)' }), article('Q2', { hu: 'Operaház', de: 'Oper' })],
      }),
    )

    expect(readdirSync(join(out, 'wiki')).sort()).toEqual(['de.json', 'fr.json'])
    expect(json('wiki/de.json')).toStrictEqual({ Q1: 'Kaffeehaus', Q2: 'Oper' })
    expect(json('wiki/fr.json')).toStrictEqual({ Q1: 'Café (lieu)' })
    expect(json('manifest.json').wikiLangs).toEqual(['de', 'fr'])
  })

  it('leaves out of the wiki files an article with no Wikidata id, which they could not key', () => {
    writeData(out, tree({ articles: [article(undefined, { hu: 'Kávézó', de: 'Kaffeehaus' })] }))

    expect(readdirSync(join(out, 'wiki'))).toEqual([])
    expect(json('manifest.json').wikiLangs).toEqual([])
  })

  it('writes every place to search.json with only the fields search needs', () => {
    writeData(out, tree())

    expect(json('search.json')).toStrictEqual({
      places: [
        { id: 'n1', cat: 'food', lat: 47.4975, lon: 19.0545, name: 'Kávézó', names: { en: 'Café' } },
        { id: 'n2', cat: 'shops', lat: 47.4976, lon: 19.0546, name: 'Könyvesbolt' },
        { id: 'Q2', cat: 'notable', lat: 47.5027, lon: 19.0584, name: 'Operaház' },
      ],
    })
  })

  it('writes LICENSE.txt with the ODbL and CC BY-SA 4.0 notices', () => {
    writeData(out, tree())

    const license = readFileSync(join(out, 'LICENSE.txt'), 'utf8')
    expect(license).toMatch(/© OpenStreetMap contributors/)
    expect(license).toMatch(/Open Database License/)
    expect(license).toMatch(/Wikipedia.*CC BY-SA 4\.0/)
  })

  it('removes the cells and wiki files of an earlier build, so the manifest stays true', () => {
    mkdirSync(join(out, 'cells'), { recursive: true })
    mkdirSync(join(out, 'wiki'))
    writeFileSync(join(out, 'cells/1_1.json'), '{}')
    writeFileSync(join(out, 'wiki/xx.json'), '{}')

    writeData(out, tree())

    expect(existsSync(join(out, 'cells/1_1.json'))).toBe(false)
    expect(existsSync(join(out, 'wiki/xx.json'))).toBe(false)
  })

  it('leaves alone what it did not write, so a wrong --out loses nothing', () => {
    mkdirSync(out)
    writeFileSync(join(out, 'keep.txt'), 'keep')

    writeData(out, tree())

    expect(readFileSync(join(out, 'keep.txt'), 'utf8')).toBe('keep')
  })
})
