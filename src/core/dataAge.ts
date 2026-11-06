import type { Manifest } from './types'

const dayMs = 24 * 60 * 60 * 1000
const warnAfterDays = 10

/**
 * How old the data is, by its older source: that date, the whole days since it, and whether it is
 * over the limit. A phone clock behind the data's date counts as 0 days.
 */
export function dataAge({ osmDataAt, wikipediaAt }: Pick<Manifest, 'osmDataAt' | 'wikipediaAt'>, now: Date) {
  const date = new Date(Math.min(Date.parse(osmDataAt), Date.parse(wikipediaAt)))
  const elapsed = now.getTime() - date.getTime()
  return {
    date,
    days: Math.max(0, Math.floor(elapsed / dayMs)),
    stale: elapsed > warnAfterDays * dayMs,
  }
}
