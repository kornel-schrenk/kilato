import type { CategoryId, Place } from '../../src/core/types'

export type Tags = Record<string, string | undefined>

interface CategoryRule {
  cat: CategoryId
  key: string
  values: readonly string[] | 'any'
  except?: readonly string[]
}

/** The spec's category table, top to bottom. `notable` has no rule: its places come from Wikipedia. */
export const CATEGORY_RULES: readonly CategoryRule[] = [
  { cat: 'sights', key: 'tourism', values: ['attraction', 'museum', 'gallery', 'viewpoint', 'artwork', 'zoo', 'aquarium', 'theme_park'] },
  { cat: 'sights', key: 'historic', values: 'any' },
  { cat: 'sights', key: 'amenity', values: ['place_of_worship', 'fountain'] },
  { cat: 'food', key: 'amenity', values: ['cafe', 'restaurant', 'fast_food', 'bar', 'pub', 'biergarten', 'ice_cream', 'food_court'] },
  { cat: 'food', key: 'shop', values: ['bakery', 'pastry'] },
  { cat: 'leisure', key: 'amenity', values: ['theatre', 'cinema', 'arts_centre', 'library', 'community_centre', 'events_venue', 'nightclub', 'music_venue', 'planetarium'] },
  { cat: 'leisure', key: 'leisure', values: ['park', 'garden', 'playground', 'sports_centre', 'fitness_centre', 'swimming_pool', 'water_park', 'escape_game', 'bowling_alley'] },
  { cat: 'services', key: 'amenity', values: ['pharmacy', 'bank', 'bureau_de_change', 'post_office', 'clinic', 'doctors', 'dentist', 'veterinary', 'hospital', 'police', 'townhall', 'fuel', 'car_wash', 'car_rental', 'driving_school'] },
  { cat: 'services', key: 'shop', values: ['hairdresser', 'beauty', 'massage', 'tattoo', 'laundry', 'dry_cleaning', 'travel_agency', 'copyshop', 'optician', 'tailor', 'shoe_repair', 'photo'] },
  { cat: 'shops', key: 'shop', values: 'any', except: ['vacant'] },
]

function ruleMatches({ values, except }: CategoryRule, value: string) {
  return (values === 'any' || values.includes(value)) && !except?.includes(value)
}

/** The category and kind from the first rule the tags match. */
export function categorize(tags: Tags): Pick<Place, 'cat' | 'kind'> | undefined {
  for (const rule of CATEGORY_RULES) {
    const value = tags[rule.key]
    if (value !== undefined && ruleMatches(rule, value)) return { cat: rule.cat, kind: value }
  }
  return undefined
}

/** One `osmium tags-filter` expression per key. The filter keeps a superset: `categorize` has the last word. */
export function tagsFilterExpressions(): string[] {
  const valuesByKey = new Map<string, string[] | 'any'>()
  for (const { key, values } of CATEGORY_RULES) {
    const seen = valuesByKey.get(key) ?? []
    valuesByKey.set(key, seen === 'any' || values === 'any' ? 'any' : [...seen, ...values])
  }
  return [...valuesByKey].map(([key, values]) =>
    values === 'any' ? `nwr/${key}` : `nwr/${key}=${values.join(',')}`,
  )
}
