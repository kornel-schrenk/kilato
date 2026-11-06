import opening_hours, { type nominatim_object } from 'opening_hours'
import { hoursWindowMinutes } from '../../src/core/hours.ts'
import type { Place } from '../../src/core/types'

const MINUTE = 60_000

/**
 * Hungary for the public holidays, Budapest's position for sunrise and sunset.
 * The library's types ask for numbers, but it ignores `lat` and `lon` unless they're strings.
 */
const BUDAPEST = {
  lat: '47.4979',
  lon: '19.0402',
  address: { country_code: 'hu', state: 'Budapest' },
} as unknown as nominatim_object

/** Local midnight on the day of `now`, where the window starts. It needs the same `TZ` as `hoursInWindow`. */
export function windowStartOn(now: Date): Date {
  const midnight = new Date(now)
  midnight.setHours(0, 0, 0, 0)
  return midnight
}

/**
 * The open times of an `opening_hours` value, as `[start, end]` pairs in real minutes since
 * `windowStart`, clipped to the window. An empty list means closed throughout. There are no hours
 * when the value doesn't parse or has anything marked unknown inside the window.
 *
 * The library reads local time, so this needs a process running with `TZ=Europe/Budapest`.
 */
export function hoursInWindow(windowStart: Date, value: string): Place['hours'] {
  const windowEnd = new Date(windowStart.getTime() + hoursWindowMinutes * MINUTE)
  const minutesSinceStart = (date: Date) => (date.getTime() - windowStart.getTime()) / MINUTE
  try {
    const intervals = new opening_hours(value, BUDAPEST).getOpenIntervals(windowStart, windowEnd)
    if (intervals.some(([, , unknown]) => unknown)) return undefined
    return intervals.map(([start, end]) => [minutesSinceStart(start), minutesSinceStart(end)])
  } catch {
    return undefined
  }
}
