import type { Lang } from './lang'

/** The line under a place's name: its name in the UI language, if it has one. */
export function secondName(place: { names?: Partial<Record<Lang, string>> }, lang: Lang): string | undefined {
  return place.names?.[lang]
}
