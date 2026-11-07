import { dataAge } from '../core/dataAge'
import { formatDate, type Lang } from '../core/lang'
import type { Manifest } from '../core/types'
import type { en } from '../i18n/en'
import type { PanelName } from './Panel'

interface Props {
  manifest: Manifest | null
  onOpen: (panel: PanelName) => void
  lang: Lang
  t: typeof en
}

export function Footer({ manifest, onOpen, lang, t }: Props) {
  // ponytail: worked out on render, with no timer. A page left open catches up on its next render.
  const age = manifest && dataAge(manifest, new Date())

  return (
    <footer>
      {age && (
        <p class={age.stale ? 'data-age data-age-warning' : 'data-age'}>
          {t.dataAge(formatDate(age.date, lang), age.days)}
          {age.stale && ` · ${t.mayBeOutOfDate}`}
        </p>
      )}
      <button type="button" class="link" onClick={() => onOpen('sentWhere')}>
        {t.sentWhereTitle}
      </button>
      {' · '}
      <button type="button" class="link" onClick={() => onOpen('about')}>
        {t.about}
      </button>
    </footer>
  )
}
