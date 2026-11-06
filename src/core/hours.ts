import type { Place } from './types'

export type OpenStatus = 'open' | 'closed' | 'unknown'

const minute = 60_000
/** 14 × 24 hours of real time, so `24/7` is `[0, 20160]` even when a clock change falls inside. */
export const hoursWindowMinutes = 14 * 24 * 60

/**
 * Whether a place is open at `now`, in milliseconds since the epoch. A pair's end is the moment it
 * closes, and the window's end is the first moment past it. Outside the window, nothing is known.
 */
export function openStatus(hours: Place['hours'], hoursWindowStart: string | undefined, now: number): OpenStatus {
  if (!hours || !hoursWindowStart) return 'unknown'
  const minutes = (now - Date.parse(hoursWindowStart)) / minute
  // This way round, a start that doesn't parse (NaN) counts as outside the window too.
  if (!(minutes >= 0 && minutes < hoursWindowMinutes)) return 'unknown'
  return hours.some(([start, end]) => start <= minutes && minutes < end) ? 'open' : 'closed'
}
