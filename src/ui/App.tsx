import { useLayoutEffect, useState } from 'preact/hooks'
import { phoneLanguage, uiLanguage, type Lang } from '../core/lang'
import { en } from '../i18n/en'
import { hu } from '../i18n/hu'

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

  useLayoutEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const choose = (choice: Lang) => {
    saveLang(choice)
    setLang(choice)
  }

  return (
    <>
      <header>
        <h1>Kilátó</h1>
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
      <main>
        <p>{t.intro}</p>
      </main>
    </>
  )
}
