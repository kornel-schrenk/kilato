import { useLayoutEffect, useRef } from 'preact/hooks'
// By path, because preact's `exports` doesn't list its LICENSE.
import leafletLicence from '../../node_modules/leaflet/LICENSE?raw'
import preactLicence from '../../node_modules/preact/LICENSE?raw'
import type { en } from '../i18n/en'

export type PanelName = 'sentWhere' | 'about'

const repository = 'https://github.com/kornel-schrenk/kilato'
const titleId = 'panel-title'

// One entry for each package in `dependencies`: e2e/footer.spec.ts fails on a package with none.
const software = [
  { title: 'Leaflet', licence: leafletLicence },
  { title: 'Preact', licence: preactLicence },
]

/** A line as the spec writes it, with **bold** in it. */
const withBold = (line: string) =>
  line.split('**').map((part, index) => (index % 2 === 1 ? <strong>{part}</strong> : part))

interface Props {
  name: PanelName
  onClose: () => void
  t: typeof en
}

/** A panel over the page, open while it is mounted. The browser's dialog traps the focus, shuts on Esc and gives the focus back. */
export function Panel({ name, onClose, t }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)

  useLayoutEffect(() => dialog.current?.showModal(), [])

  return (
    <dialog ref={dialog} class="panel" aria-labelledby={titleId} onClose={onClose}>
      {name === 'sentWhere' ? (
        <>
          <h2 id={titleId}>{t.sentWhereTitle}</h2>
          <ul>
            {t.sentWhere.map((line) => (
              <li key={line}>{withBold(line)}</li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <h2 id={titleId}>{t.about}</h2>
          <p>
            {t.aboutOpenSource}{' '}
            <a href={repository} target="_blank" rel="noopener">
              {t.aboutRepository}
            </a>
          </p>
          {t.aboutCredits.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <h3>{t.softwareUsed}</h3>
          {software.map(({ title, licence }) => (
            <details key={title}>
              <summary>{title}</summary>
              <pre lang="en">{licence}</pre>
            </details>
          ))}
        </>
      )}
      <form method="dialog">
        <button>{t.close}</button>
      </form>
    </dialog>
  )
}
