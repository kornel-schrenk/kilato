import { useLayoutEffect, useState } from 'preact/hooks'
import { phoneLanguage, uiLanguage, type Lang } from '../core/lang'
import { deakTer } from '../core/point'
import type { SearchPlace } from '../core/search'
import { en } from '../i18n/en'
import { hu } from '../i18n/hu'
import { MapView } from './MapView'
import { PlaceList } from './PlaceList'
import { SearchBox } from './SearchBox'
import { usePlaces } from './usePlaces'
import { usePoint } from './usePoint'

const messages = { hu, en }

// Prefixed because every project site of this GitHub account shares one origin, and one localStorage.
const langKey = 'kilato.lang'

// Using localStorage throws when the browser blocks site data. The page then follows the
// phone language, and the switch works until the page closes.
function savedLang(): string | null {
  try {
    return localStorage.getItem(langKey)
  } catch {
    return null
  }
}

function saveLang(lang: Lang) {
  try {
    localStorage.setItem(langKey, lang)
  } catch {
    // Nothing to do: see above.
  }
}

export function App() {
  const [lang, setLang] = useState(() => uiLanguage(savedLang(), phoneLanguage(navigator.languages)))
  const t = messages[lang]
  const [point, dispatch] = usePoint()
  const places = usePlaces(point.point)

  useLayoutEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const choose = (choice: Lang) => {
    saveLang(choice)
    setLang(choice)
  }

  const pick = (place: SearchPlace) => {
    dispatch({ type: 'pick', at: { lat: place.lat, lon: place.lon } })
    places.pick(place)
  }

  return (
    <>
      <header>
        <h1>Kilátó</h1>
        {/* With no point yet, the map is at Deák Ferenc tér, so results start from there. */}
        <SearchBox point={point.point ?? deakTer} onPick={pick} lang={lang} t={t} />
        <div class="lang-switch" role="group" aria-label={t.language}>
          <button type="button" aria-pressed={lang === 'hu'} onClick={() => choose('hu')}>
            HU
          </button>
          {' | '}
          <button type="button" aria-pressed={lang === 'en'} onClick={() => choose('en')}>
            EN
          </button>
        </div>
      </header>
      <MapView
        state={point}
        onEvent={dispatch}
        rows={places.rows}
        selection={places.selection}
        onSelect={places.select}
        t={t}
      />
      <main>
        {point.mode === 'intro' && (
          <>
            <p>{t.intro}</p>
            <div class="intro-buttons">
              <button type="button" onClick={() => dispatch({ type: 'useMyLocation' })}>
                {t.useMyLocation}
              </button>
              <button type="button" onClick={() => dispatch({ type: 'explore' })}>
                {t.exploreTheMap}
              </button>
            </div>
          </>
        )}
        {point.mode === 'exploring' && <p>{t.exploreNote}</p>}
        {places.failed && (
          <p role="alert" class="load-error">
            {t.placesFailed}{' '}
            <button type="button" onClick={places.retry}>
              {t.retry}
            </button>
          </p>
        )}
        <PlaceList
          rows={places.rows}
          shown={places.shown}
          selection={places.selection}
          onSelect={places.select}
          onShowMore={places.showMore}
          lang={lang}
          t={t}
        />
      </main>
    </>
  )
}
