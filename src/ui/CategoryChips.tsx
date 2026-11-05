import type { CategoryId } from '../core/types'
import type { en } from '../i18n/en'
import { categoryColors, categoryTextColors } from './categoryColors'

// The spec's order.
export const categories: CategoryId[] = ['sights', 'notable', 'food', 'leisure', 'services', 'shops']

interface Props {
  off: ReadonlySet<CategoryId>
  onToggle: (id: CategoryId) => void
  t: typeof en
}

export function CategoryChips({ off, onToggle, t }: Props) {
  return (
    <div class="chips" role="group" aria-label={t.categories}>
      {categories.map((id) => (
        <button
          key={id}
          type="button"
          class="chip"
          aria-pressed={!off.has(id)}
          style={{ '--chip-color': categoryColors[id], '--chip-text-color': categoryTextColors[id] }}
          onClick={() => onToggle(id)}
        >
          {t.categoryNames[id]}
        </button>
      ))}
    </div>
  )
}
