export type Lang = 'hu' | 'en'

// en-GB because the spec writes English dates as "2 Nov 2026". Plain `en` gives "Nov 2, 2026".
const locales: Record<Lang, string> = { hu: 'hu-HU', en: 'en-GB' }

/** The primary subtag of the phone's first language: `de` for `de-AT`. Takes `navigator.languages`. */
export function phoneLanguage(languages: readonly string[]): string {
  return (languages[0] ?? '').split('-')[0]
}

/** The saved choice if there is one, else Hungarian on a Hungarian phone and English on any other. */
export function uiLanguage(saved: string | null, phone: string): Lang {
  if (saved === 'hu' || saved === 'en') return saved
  return phone === 'hu' ? 'hu' : 'en'
}

export function formatNumber(value: number, lang: Lang): string {
  return new Intl.NumberFormat(locales[lang]).format(value)
}

export function formatDate(date: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(locales[lang], { dateStyle: 'medium' }).format(date)
}
