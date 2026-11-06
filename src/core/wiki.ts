import type { Place, WikiLangFile } from './types'

export interface WikiLink {
  text: string
  url: string
}

// Wikipedia's URLs have underscores for spaces. encodeURI leaves a title's / alone, as Wikipedia
// does, and the # of a section an OpenStreetMap tag names. A ? it leaves too would end the title.
const linkTo = (lang: string, title: string): WikiLink => ({
  text: `Wikipedia · ${lang.toUpperCase()}`,
  url: `https://${lang}.wikipedia.org/wiki/${encodeURI(title.replaceAll(' ', '_')).replaceAll('?', '%3F')}`,
})

/**
 * A place's one link: to its article in the phone language, else the Hungarian one, else the
 * English one. `phoneTitles` is the phone language's wiki/<lang>.json, if it has one and it's loaded.
 */
export function wikiLink(wiki: Place['wiki'], phone: string, phoneTitles: WikiLangFile | null): WikiLink | undefined {
  if (!wiki) return undefined
  const inPhoneLanguage = wiki.q && phoneTitles?.[wiki.q]
  if (inPhoneLanguage) return linkTo(phone, inPhoneLanguage)
  for (const lang of phone === 'en' ? (['en', 'hu'] as const) : (['hu', 'en'] as const)) {
    const title = wiki[lang]
    if (title) return linkTo(lang, title)
  }
  return undefined
}
