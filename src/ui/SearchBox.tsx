import { useMemo, useRef, useState } from 'preact/hooks'
import type { LatLon } from '../core/geo'
import type { Lang } from '../core/lang'
import { secondName } from '../core/names'
import { placeSearch, type SearchPlace } from '../core/search'
import { loadSearchPlaces } from '../data/search'
import type { en } from '../i18n/en'

interface Props {
  /** Results come nearest this first. */
  point: LatLon
  onPick: (place: SearchPlace) => void
  lang: Lang
  t: typeof en
}

export function SearchBox({ point, onPick, lang, t }: Props) {
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState<ReturnType<typeof placeSearch> | null>(null)
  const [failed, setFailed] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const asked = useRef(false)

  // The file is 681 KB compressed, so it waits for the first focus. After a failure, the next focus asks again.
  const load = () => {
    if (asked.current) return
    asked.current = true
    setFailed(false)
    loadSearchPlaces()
      // Wrapped, because useState would call a function it is handed.
      .then((places) => setSearch(() => placeSearch(places)))
      .catch(() => {
        asked.current = false
        setFailed(true)
      })
  }

  const found = useMemo(() => search?.(query, point) ?? [], [search, query, point])

  const pick = (place: SearchPlace) => {
    setQuery('')
    // On a phone this closes the keyboard, which would cover the list the pick has just changed.
    input.current?.blur()
    onPick(place)
  }

  return (
    <div class="search" role="search">
      <input
        ref={input}
        type="search"
        value={query}
        placeholder={t.search}
        aria-label={t.search}
        autocomplete="off"
        onFocus={load}
        onInput={(event) => setQuery(event.currentTarget.value)}
      />
      {failed && (
        <p role="alert" class="search-results load-error">
          {t.placesFailed}{' '}
          <button type="button" onClick={load}>
            {t.retry}
          </button>
        </p>
      )}
      {found.length > 0 && (
        <ul class="search-results">
          {found.map((place) => {
            const other = secondName(place, lang)
            return (
              <li key={place.id}>
                <button type="button" class="search-result" onClick={() => pick(place)}>
                  <span class="place-name">{place.name}</span>
                  {other && <span class="place-other">{other}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
