import { describe, expect, it, vi } from 'vitest'
import { hoursInWindow, windowStartOn } from './hours'

/** Monday, local midnight in Budapest, with no clock change in the next 14 days. */
const NOVEMBER = new Date('2026-11-02T00:00:00+01:00')
/** Monday. Friday 2026-12-25 and Friday 2027-01-01 are public holidays in Hungary. */
const CHRISTMAS = new Date('2026-12-21T00:00:00+01:00')
/** Monday. The clocks go forward at 02:00 on Sunday 2027-03-28, so that day has 23 hours. */
const SPRING = new Date('2027-03-22T00:00:00+01:00')
/** Monday. The clocks go back at 03:00 on Sunday 2027-10-31, so that day has 25 hours. */
const AUTUMN = new Date('2027-10-25T00:00:00+02:00')

/** The local time in Budapest that a number of minutes since the window start falls on. */
const localTime = (windowStart: Date, minutes: number) =>
  new Date(windowStart.getTime() + minutes * 60_000).toLocaleString('sv-SE', { timeZone: 'Europe/Budapest' })

describe('windowStartOn', () => {
  it.each([
    ['a winter morning', '2026-11-02T03:17:00Z', '2026-11-01T23:00:00.000Z'],
    ['a summer morning', '2026-07-01T10:00:00Z', '2026-06-30T22:00:00.000Z'],
    ['just after midnight, still the UTC day before', '2026-11-01T23:30:00Z', '2026-11-01T23:00:00.000Z'],
    ['just before midnight', '2026-11-02T22:59:59Z', '2026-11-01T23:00:00.000Z'],
    ['the day the clocks go forward', '2027-03-28T10:00:00Z', '2027-03-27T23:00:00.000Z'],
    ['the day the clocks go back', '2027-10-31T10:00:00Z', '2027-10-30T22:00:00.000Z'],
  ])('finds local midnight in Budapest on %s', (_day, now, start) => {
    expect(windowStartOn(new Date(now)).toISOString()).toBe(start)
  })
})

describe('hoursInWindow', () => {
  it('runs in Budapest time', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Europe/Budapest')
  })

  it('gives 24/7 the whole window', () => {
    expect(hoursInWindow(NOVEMBER, '24/7')).toEqual([[0, 20160]])
  })

  it('gives each open time in minutes since the window start', () => {
    expect(hoursInWindow(NOVEMBER, 'We 08:00-18:00')).toEqual([
      [3360, 3960],
      [13440, 14040],
    ])
  })

  it('clips times that cross either end of the window', () => {
    // The Sunday night before the window ends at 02:00 on its first day. The last one is cut at 20160.
    expect(hoursInWindow(NOVEMBER, 'Su 22:00-02:00')).toEqual([
      [0, 120],
      [9960, 10200],
      [20040, 20160],
    ])
  })

  it("counts Hungary's public holidays", () => {
    expect(hoursInWindow(CHRISTMAS, 'Mo-Fr 08:00-18:00; PH off')).toEqual([
      [480, 1080], // Mon 21
      [1920, 2520], // Tue 22
      [3360, 3960], // Wed 23
      [4800, 5400], // Thu 24, and nothing on Fri 25
      [10560, 11160], // Mon 28
      [12000, 12600], // Tue 29
      [13440, 14040], // Wed 30
      [14880, 15480], // Thu 31, and nothing on Fri 1
    ])
  })

  it("uses Hungary's holidays and not another country's", () => {
    // 20 August, a Thursday in 2026, is a public holiday in Hungary and not in Germany.
    const hours = hoursInWindow(new Date('2026-08-17T00:00:00+02:00'), 'Mo-Fr 08:00-18:00; PH off')
    expect(hours?.slice(0, 4)).toEqual([
      [480, 1080], // Mon 17
      [1920, 2520], // Tue 18
      [3360, 3960], // Wed 19, and nothing on Thu 20
      [6240, 6840], // Fri 21
    ])
  })

  it("works out sunrise and sunset for Budapest, and not the library's default", () => {
    // In Budapest on 2 November the sun rises near 06:30 and sets near 16:25.
    const [[sunrise, sunset]] = hoursInWindow(NOVEMBER, 'Mo sunrise-sunset') ?? [[]]
    expect(sunrise).toBeGreaterThan(6 * 60 + 15)
    expect(sunrise).toBeLessThan(6 * 60 + 45)
    expect(sunset).toBeGreaterThan(16 * 60 + 10)
    expect(sunset).toBeLessThan(16 * 60 + 40)
  })

  it.each(['call us', '', 'Mo 12:00'])('gives no hours for %j, which does not parse', (value) => {
    expect(hoursInWindow(NOVEMBER, value)).toBeUndefined()
  })

  it('gives no hours for a value the library can only reject when it works out the times', () => {
    // It has no school holidays for 2099, so it throws here. It also logs that, which would clutter the test output.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(hoursInWindow(new Date('2099-01-05T00:00:00+01:00'), 'SH off; Mo-Fr 08:00-18:00')).toBeUndefined()
    consoleError.mockRestore()
  })

  it.each(['Mo-Fr 08:00-18:00 unknown', 'Mo-Fr 08:00-18:00 "by appointment"', 'Mo 18:00+'])(
    'gives no hours for %j, which is unknown inside the window',
    (value) => {
      expect(hoursInWindow(NOVEMBER, value)).toBeUndefined()
    },
  )

  it('gives no hours when one day inside the window is unknown', () => {
    expect(hoursInWindow(CHRISTMAS, 'Mo-Fr 08:00-10:00; Dec 25 unknown')).toBeUndefined()
  })

  it('ignores an unknown day outside the window', () => {
    expect(hoursInWindow(NOVEMBER, 'We 08:00-10:00; Dec 25 unknown')).toEqual([
      [3360, 3480],
      [13440, 13560],
    ])
  })

  it('opens at 08:00 local time on both sides of the spring clock change', () => {
    const hours = hoursInWindow(SPRING, 'Mo-Su 08:00-18:00')
    expect(hours).toHaveLength(14)
    expect(hours?.slice(5, 8)).toEqual([
      [7680, 8280], // Sat 27, before the change
      [9060, 9660], // Sun 28, the day of the change, an hour fewer than 9120 since the start
      [10500, 11100], // Mon 29, after the change
    ])
    expect(localTime(SPRING, 7680)).toBe('2027-03-27 08:00:00')
    expect(localTime(SPRING, 9060)).toBe('2027-03-28 08:00:00')
    expect(localTime(SPRING, 10500)).toBe('2027-03-29 08:00:00')
  })

  it('opens at 08:00 local time on both sides of the autumn clock change', () => {
    const hours = hoursInWindow(AUTUMN, 'Mo-Su 08:00-18:00')
    expect(hours).toHaveLength(14)
    expect(hours?.slice(5, 8)).toEqual([
      [7680, 8280], // Sat 30, before the change
      [9180, 9780], // Sun 31, the day of the change, an hour more than 9120 since the start
      [10620, 11220], // Mon 1, after the change
    ])
    expect(localTime(AUTUMN, 9180)).toBe('2027-10-31 08:00:00')
  })

  it('counts the real minutes of a time that spans a clock change', () => {
    // 01:00-04:00 on the first Sunday lasts two hours in spring and four in autumn.
    expect(hoursInWindow(SPRING, 'Su 01:00-04:00')?.[0]).toEqual([8700, 8820])
    expect(hoursInWindow(AUTUMN, 'Su 01:00-04:00')?.[0]).toEqual([8700, 8940])
  })

  it.each([
    ['spring', SPRING],
    ['autumn', AUTUMN],
  ])('gives 24/7 the whole window when the %s clock change falls inside it', (_, windowStart) => {
    expect(hoursInWindow(windowStart, '24/7')).toEqual([[0, 20160]])
  })

  it('gives a place that is always closed an empty list, so its status is closed and not unknown', () => {
    expect(hoursInWindow(NOVEMBER, 'off')).toEqual([])
  })
})
