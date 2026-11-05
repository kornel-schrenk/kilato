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
