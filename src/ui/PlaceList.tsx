import { useEffect, useRef } from 'preact/hooks'
import { formatDistance, type Lang } from '../core/lang'
import { secondName } from '../core/names'
import type { Place } from '../core/types'
import type { en } from '../i18n/en'
import { kindLabel } from '../i18n/kinds'
import type { Row, Selection } from './usePlaces'

interface Props {
  rows: Row[]
  shown: number
  selection: Selection | null
  onSelect: (place: Place, source: Selection['source']) => void
  onShowMore: () => void
  lang: Lang
  t: typeof en
}

export function PlaceList({ rows, shown, selection, onSelect, onShowMore, lang, t }: Props) {
  const list = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (selection && selection.source !== 'row') {
      list.current?.querySelector('[aria-current]')?.scrollIntoView({ block: 'nearest' })
    }
  }, [selection])

  return (
    <>
      <ul ref={list} class="places">
        {rows.slice(0, shown).map(({ place, metres }) => {
          const other = secondName(place, lang)
          return (
            <li key={place.id}>
              <button
                type="button"
                class="place"
                aria-current={place.id === selection?.place.id ? 'true' : undefined}
                onClick={() => onSelect(place, 'row')}
              >
                <span class="place-name">{place.name}</span>
                {other && <span class="place-other">{other}</span>}
                <span class="place-meta">
                  {kindLabel(place.cat, place.kind, lang)} · {formatDistance(metres, lang)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {shown < rows.length && (
        <button type="button" class="show-more" onClick={onShowMore}>
          {t.showMore}
        </button>
      )}
    </>
  )
}
