import type { OpenStatus } from './hours'
import type { CategoryId, Place } from './types'

export type Order = 'nearest' | 'relevant'

export interface Row {
  place: Place
  metres: number
}

/** What each signal adds to a place's distance, in metres. Tests check outcomes, so these can be tuned. */
export const adjustments: {
  article: number
  category: Record<CategoryId, number>
  status: Record<OpenStatus, number>
} = {
  article: -300,
  category: { sights: -200, notable: -100, leisure: -100, food: -50, services: 0, shops: 0 },
  status: { open: -100, closed: 300, unknown: 0 },
}

function score({ place, metres }: Row, statusOf: (place: Place) => OpenStatus): number {
  const article = place.wiki ? adjustments.article : 0
  return metres + article + adjustments.category[place.cat] + adjustments.status[statusOf(place)]
}

/**
 * The rows in an order, as a new array. Nearest looks only at the distance, and rows at the same
 * distance keep their order. Most relevant goes by score, lowest first, then the nearer, then the name.
 */
export function sortRows(rows: Row[], order: Order, statusOf: (place: Place) => OpenStatus): Row[] {
  if (order === 'nearest') return [...rows].sort((a, b) => a.metres - b.metres)
  return rows
    .map((row) => ({ row, score: score(row, statusOf) }))
    .sort(
      (a, b) =>
        a.score - b.score ||
        a.row.metres - b.row.metres ||
        // Hungarian on every phone, so that the order doesn't depend on the phone's language.
        a.row.place.name.localeCompare(b.row.place.name, 'hu'),
    )
    .map(({ row }) => row)
}
