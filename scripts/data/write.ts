import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cellKey } from '../../src/core/cells.ts'
import type { CellFile, Manifest, Place, SearchFile, WikiLangFile } from '../../src/core/types'
import type { Article } from './wikipedia'

/** What goes in the data files. The manifest's cells and languages follow from the rest. */
export interface DataTree extends Pick<Manifest, 'builtAt' | 'osmDataAt' | 'wikipediaAt' | 'hoursWindowStart' | 'box'> {
  places: Place[]
  articles: Article[]
}

const LICENSE = `The data derived from OpenStreetMap is © OpenStreetMap contributors, under the Open Database License (ODbL).
https://www.openstreetmap.org/copyright

The data derived from Wikipedia is under the Creative Commons Attribution-ShareAlike 4.0 licence (CC BY-SA 4.0).
https://creativecommons.org/licenses/by-sa/4.0/
`

function cellFiles(places: Place[]) {
  const cells = new Map<string, CellFile>()
  for (const place of places) {
    const key = cellKey(place.lat, place.lon)
    if (!cells.has(key)) cells.set(key, { places: [] })
    cells.get(key)!.places.push(place)
  }
  return cells
}

/** One file per language. An article with no Wikidata id has nothing to be looked up by. */
function wikiFiles(articles: Article[]) {
  const files = new Map<string, WikiLangFile>()
  for (const { q, titles } of articles) {
    if (!q) continue
    for (const [lang, title] of Object.entries(titles)) {
      if (lang === 'hu' || lang === 'en') continue
      if (!files.has(lang)) files.set(lang, {})
      files.get(lang)![q] = title
    }
  }
  return files
}

/**
 * Writes the data tree into `out`. It replaces the `cells` and `wiki` folders, because the
 * manifest lists what's in them, and leaves anything else in `out` alone.
 */
export function writeData(out: string, { places, articles, ...times }: DataTree) {
  const json = (path: string, value: unknown) => writeFileSync(join(out, path), `${JSON.stringify(value)}\n`)

  for (const folder of ['cells', 'wiki']) {
    rmSync(join(out, folder), { recursive: true, force: true })
    mkdirSync(join(out, folder), { recursive: true })
  }

  const cells = cellFiles(places)
  for (const [key, cell] of cells) json(`cells/${key}.json`, cell)

  const wiki = wikiFiles(articles)
  for (const [lang, titles] of wiki) json(`wiki/${lang}.json`, titles)

  const search: SearchFile = {
    places: places.map(({ id, cat, lat, lon, name, names }) => ({ id, cat, lat, lon, name, names })),
  }
  json('search.json', search)

  writeFileSync(join(out, 'LICENSE.txt'), LICENSE)

  const manifest: Manifest = { version: 1, ...times, cells: [...cells.keys()].sort(), wikiLangs: [...wiki.keys()].sort() }
  json('manifest.json', manifest)
}
