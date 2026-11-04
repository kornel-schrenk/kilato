import { expect, it } from 'vitest'
import type { CategoryId } from '../../src/core/types'
import { CATEGORY_RULES, categorize, tagsFilterExpressions } from './categories'

// The spec's category table, typed out here so the tests don't check the code against itself.
const SPEC_TABLE: [CategoryId, string, string][] = [
  ['sights', 'tourism', 'attraction museum gallery viewpoint artwork zoo aquarium theme_park'],
  ['sights', 'amenity', 'place_of_worship fountain'],
  ['food', 'amenity', 'cafe restaurant fast_food bar pub biergarten ice_cream food_court'],
  ['food', 'shop', 'bakery pastry'],
  ['leisure', 'amenity', 'theatre cinema arts_centre library community_centre events_venue nightclub music_venue planetarium'],
  ['leisure', 'leisure', 'park garden playground sports_centre fitness_centre swimming_pool water_park escape_game bowling_alley'],
  ['services', 'amenity', 'pharmacy bank bureau_de_change post_office clinic doctors dentist veterinary hospital police townhall fuel car_wash car_rental driving_school'],
  ['services', 'shop', 'hairdresser beauty massage tattoo laundry dry_cleaning travel_agency copyshop optician tailor shoe_repair photo'],
]
const SPEC_TAGS = SPEC_TABLE.flatMap(([cat, key, values]) =>
  values.split(' ').map((value) => ({ cat, key, value })),
)

/** Reads an expression the way osmium does: `nwr/key` matches any value, `nwr/key=a,b` only those. */
function matches(expression: string, key: string, value: string) {
  const [filterKey, values] = expression.slice('nwr/'.length).split('=')
  return filterKey === key && (values === undefined || values.split(',').includes(value))
}

const inFilter = (key: string, value: string) =>
  tagsFilterExpressions().some((expression) => matches(expression, key, value))

it.each(SPEC_TAGS)('puts $key=$value in $cat', ({ cat, key, value }) => {
  expect(categorize({ [key]: value })).toEqual({ cat, kind: value })
})

it('puts any historic value in sights', () => {
  expect(categorize({ historic: 'castle' })).toEqual({ cat: 'sights', kind: 'castle' })
  expect(categorize({ historic: 'boundary_stone' })).toEqual({ cat: 'sights', kind: 'boundary_stone' })
})

it('puts any other shop value in shops, except vacant', () => {
  expect(categorize({ shop: 'supermarket' })).toEqual({ cat: 'shops', kind: 'supermarket' })
  expect(categorize({ shop: 'vintage' })).toEqual({ cat: 'shops', kind: 'vintage' })
  expect(categorize({ shop: 'vacant' })).toBeUndefined()
})

it('lets the first matching rule win', () => {
  expect(categorize({ tourism: 'museum', amenity: 'cafe' })).toEqual({ cat: 'sights', kind: 'museum' })
  expect(categorize({ amenity: 'cafe', historic: 'building' })).toEqual({ cat: 'sights', kind: 'building' })
  expect(categorize({ shop: 'bakery', amenity: 'cinema' })).toEqual({ cat: 'food', kind: 'bakery' })
  expect(categorize({ amenity: 'bank', shop: 'books' })).toEqual({ cat: 'services', kind: 'bank' })
  expect(categorize({ leisure: 'park', amenity: 'pharmacy' })).toEqual({ cat: 'leisure', kind: 'park' })
})

it('matches nothing for tags outside the table', () => {
  expect(categorize({ office: 'company' })).toBeUndefined()
  expect(categorize({ amenity: 'parking' })).toBeUndefined()
  expect(categorize({ leisure: 'pitch' })).toBeUndefined()
  expect(categorize({ tourism: 'hotel' })).toBeUndefined()
})

it('leaves no table tag out of the osmium filter', () => {
  const missing = CATEGORY_RULES.flatMap(({ key, values }) =>
    values === 'any'
      ? tagsFilterExpressions().includes(`nwr/${key}`) ? [] : [`${key}=*`]
      : values.filter((value) => !inFilter(key, value)).map((value) => `${key}=${value}`),
  )
  expect(missing).toEqual([])
})

it('leaves no tag from the spec out of the osmium filter', () => {
  const missing = SPEC_TAGS.filter(({ key, value }) => !inFilter(key, value))
  expect(missing).toEqual([])
  expect(tagsFilterExpressions()).toContain('nwr/historic')
  expect(tagsFilterExpressions()).toContain('nwr/shop')
})

it('keeps offices and other unlisted tags out of the osmium filter', () => {
  expect(inFilter('office', 'company')).toBe(false)
  expect(inFilter('amenity', 'parking')).toBe(false)
  expect(inFilter('leisure', 'pitch')).toBe(false)
  expect(inFilter('tourism', 'hotel')).toBe(false)
})
