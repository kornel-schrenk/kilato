import { useEffect, useRef } from 'preact/hooks'
import type { OpenStatus } from '../core/hours'
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
  statusOf: (place: Place) => OpenStatus
  lang: Lang
  t: typeof en
}

export function PlaceList({ rows, shown, selection, onSelect, onShowMore, statusOf, lang, t }: Props) {
  const list = useRef<HTMLUListElement>(null)
  const statusLabels = { open: t.openNow, closed: t.closedNow, unknown: null }

  useEffect(() => {
    if (selection?.source === 'marker') list.current?.querySelector('[aria-current]')?.scrollIntoView({ block: 'nearest' })
  }, [selection])

  return (
    <>
      <ul ref={list} class="places">
        {rows.slice(0, shown).map(({ place, metres }) => {
          const other = secondName(place, lang)
          const status = statusLabels[statusOf(place)]
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
                {status && <span class="place-status">{status}</span>}
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
