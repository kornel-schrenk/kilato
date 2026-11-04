import { expectTypeOf, it } from 'vitest'
import type { CategoryId, CellFile, Manifest, Place, SearchFile, WikiLangFile } from './types'

// The spec's Data files section, typed out so the types aren't checked against themselves.
// `tsc` checks these, not the test run, so a drift fails `npm run typecheck` in `npm run verify`.
type SpecCategoryId = 'sights' | 'notable' | 'food' | 'leisure' | 'services' | 'shops'

interface SpecPlace {
  id: string
  cat: SpecCategoryId
  kind: string
  lat: number
  lon: number
  name: string
  names?: { hu?: string; en?: string }
  hours?: [number, number][]
  wiki?: { q?: string; hu?: string; en?: string }
}

interface SpecManifest {
  version: 1
  builtAt: string
  osmDataAt: string
  wikipediaAt: string
  hoursWindowStart: string
  box: [number, number, number, number]
  cells: string[]
  wikiLangs: string[]
}

interface SpecSearchPlace {
  id: string
  cat: SpecCategoryId
  lat: number
  lon: number
  name: string
  names?: { hu?: string; en?: string }
}

it('has the types the spec names, field for field', () => {
  expectTypeOf<CategoryId>().toEqualTypeOf<SpecCategoryId>()
  expectTypeOf<Manifest>().toEqualTypeOf<SpecManifest>()
  expectTypeOf<Place>().toEqualTypeOf<SpecPlace>()
  expectTypeOf<CellFile>().toEqualTypeOf<{ places: SpecPlace[] }>()
  expectTypeOf<WikiLangFile>().toEqualTypeOf<Record<string, string>>()
  expectTypeOf<SearchFile>().toEqualTypeOf<{ places: SpecSearchPlace[] }>()
})
