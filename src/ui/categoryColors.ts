import type { CategoryId } from '../core/types'

/**
 * Each category's colour, on the map and on its chip. Five come from the Okabe-Ito palette, which
 * stays apart for colour-blind eyes. Its blue would read as the point, and its yellow fades on the map.
 */
export const categoryColors: Record<CategoryId, string> = {
  sights: '#d55e00',
  notable: '#cc79a7',
  food: '#e69f00',
  leisure: '#009e73',
  services: '#56b4e9',
  shops: '#666666',
}

/** The colour of the name on a chip that is on: black where it reads, and white on the darker grey. */
export const categoryTextColors: Record<CategoryId, string> = {
  sights: '#000000',
  notable: '#000000',
  food: '#000000',
  leisure: '#000000',
  services: '#000000',
  shops: '#ffffff',
}
