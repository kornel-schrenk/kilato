export type CategoryId = 'sights' | 'notable' | 'food' | 'leisure' | 'services' | 'shops'

export interface Manifest {
  version: 1
  builtAt: string // ISO instant the build finished
  osmDataAt: string // ISO instant of the extract's replication timestamp
  wikipediaAt: string // ISO instant the Wikipedia fetch started
  hoursWindowStart: string // ISO instant of local midnight in Budapest on the build day
  box: [number, number, number, number] // west, south, east, north
  cells: string[] // keys of the cell files that exist
  wikiLangs: string[] // languages that have a wiki/<lang>.json
}

export interface CellFile {
  places: Place[]
}

export interface Place {
  id: string // n123, w123, r123, Q123, huwiki:123 or enwiki:123
  cat: CategoryId
  kind: string // the matched tag value, or 'article'
  lat: number
  lon: number
  name: string
  names?: { hu?: string; en?: string }
  hours?: [number, number][]
  wiki?: { q?: string; hu?: string; en?: string } // Wikidata id and article titles
}

export type WikiLangFile = Record<string, string> // Wikidata id to the title in this language

export interface SearchFile {
  places: Pick<Place, 'id' | 'cat' | 'lat' | 'lon' | 'name' | 'names'>[]
}
