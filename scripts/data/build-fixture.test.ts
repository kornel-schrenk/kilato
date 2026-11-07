import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cellKey } from '../../src/core/cells'
import type { CellFile, Manifest, SearchFile, WikiLangFile } from '../../src/core/types'

const root = join(import.meta.dirname, '../..')
const SITE_DATA = join(root, 'test/fixtures/site-data')

const read = (path: string) => readFileSync(join(SITE_DATA, path), 'utf8')
const json = <T>(path: string) => JSON.parse(read(path)) as T

/** Every file under a folder, by its relative path, with its text. */
function filesIn(folder: string) {
  const files = readdirSync(folder, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile())
  return Object.fromEntries(
    files.map((entry) => {
      const path = join(entry.parentPath, entry.name)
      return [relative(folder, path), readFileSync(path, 'utf8')]
    }),
  )
}

function placeNamed(name: string) {
  const manifest = json<Manifest>('manifest.json')
  const places = manifest.cells.flatMap((key) => json<CellFile>(`cells/${key}.json`).places)
  return places.find((place) => place.name === name)
}

describe('test/fixtures/site-data', () => {
  it('is what npm run data:fixture makes, whatever the machine\'s time zone', { timeout: 60_000 }, () => {
    const out = mkdtempSync(join(tmpdir(), 'kilato-fixture-'))
    try {
      const { status, stderr } = spawnSync('npm', ['run', '--silent', 'data:fixture', '--', '--out', out], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, TZ: 'America/New_York' },
      })

      expect(status, stderr).toBe(0)
      expect(filesIn(SITE_DATA), 'The committed copy is out of date. Run npm run data:fixture').toEqual(filesIn(out))
    } finally {
      rmSync(out, { recursive: true, force: true })
    }
  })

  it('has the clock fixed at 2026-11-02T03:17:00Z', () => {
    expect(json<Manifest>('manifest.json')).toMatchObject({
      version: 1,
      builtAt: '2026-11-02T03:17:00.000Z',
      osmDataAt: '2026-11-02T03:17:00.000Z',
      wikipediaAt: '2026-11-02T03:17:00.000Z',
      hoursWindowStart: '2026-11-01T23:00:00.000Z',
      box: [18.925, 47.35, 19.335, 47.62],
      wikiLangs: ['de'],
    })
  })

  it('has one file for each cell the manifest lists, around Deák Ferenc tér', () => {
    const { cells } = json<Manifest>('manifest.json')

    expect(cells).toContain('4749_1270')
    expect(readdirSync(join(SITE_DATA, 'cells')).sort()).toEqual(cells.map((key) => `${key}.json`))
    for (const key of cells) {
      const { places } = json<CellFile>(`cells/${key}.json`)
      expect(places.length).toBeGreaterThan(0)
      expect(places.map(({ lat, lon }) => cellKey(lat, lon))).toEqual(places.map(() => key))
    }
  })

  it('lists every place of the cells in search.json', () => {
    const { cells } = json<Manifest>('manifest.json')
    const inCells = cells.flatMap((key) => json<CellFile>(`cells/${key}.json`).places.map(({ id }) => id))

    expect(json<SearchFile>('search.json').places.map(({ id }) => id).sort()).toEqual(inCells.sort())
  })

  it('attaches the Opera by its wikidata tag, with its hours in the same place', () => {
    expect(placeNamed('Magyar Állami Operaház')).toMatchObject({
      id: 'w1200000100',
      cat: 'leisure',
      kind: 'theatre',
      wiki: { q: 'Q36833', hu: 'Magyar Állami Operaház', en: 'Hungarian State Opera House' },
    })
    expect(placeNamed('Magyar Állami Operaház')?.hours?.[0]).toEqual([600, 1200])
  })

  it('attaches the Gresham Palace by its en: tag, which has an underscore', () => {
    expect(placeNamed('Gresham-palota')?.wiki).toEqual({ q: 'Q854317', hu: 'Gresham-palota', en: 'Gresham Palace' })
  })

  it('makes a notable place of an article that attached to nothing, cut of its parenthesis', () => {
    expect(placeNamed('Deák Ferenc tér')).toMatchObject({
      cat: 'notable',
      kind: 'article',
      wiki: { hu: 'Deák Ferenc tér (Budapest)' },
    })
  })

  it('has no article places for the articles that attached', () => {
    const { places } = json<SearchFile>('search.json')

    expect(places.filter(({ id }) => ['Q36833', 'Q854317', 'Q934453'].includes(id))).toEqual([])
  })

  it('leaves out the hours of a value that does not parse or has anything unknown', () => {
    expect(placeNamed('Minta Fodrászat')).not.toHaveProperty('hours')
    expect(placeNamed('Minta Könyvtár')).not.toHaveProperty('hours')
    expect(placeNamed('Minta Gyógyszertár')?.hours).toEqual([[0, 20160]])
  })

  it('has the German titles for the page tests of a third language', () => {
    expect(json<WikiLangFile>('wiki/de.json').Q36833).toBe('Ungarische Staatsoper')
  })

  it('has the licence notices', () => {
    expect(read('LICENSE.txt')).toMatch(/Open Database License/)
    expect(read('LICENSE.txt')).toMatch(/CC BY-SA 4\.0/)
  })
})
