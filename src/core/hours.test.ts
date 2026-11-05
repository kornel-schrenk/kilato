import { describe, expect, it } from 'vitest'
import { openStatus } from './hours'

/** Local midnight in Budapest on Monday 2 November, as the manifest stores it. */
const windowStart = '2026-11-01T23:00:00.000Z'
/** 07:00–22:00 local time on the first two days. */
const cafe: [number, number][] = [
  [420, 1320],
  [1860, 2760],
]
const allWeeks: [number, number][] = [[0, 20160]]

const statusAt = (hours: [number, number][] | undefined, instant: string) =>
  openStatus(hours, windowStart, Date.parse(instant))

describe('openStatus', () => {
  it('is open when now falls inside a pair', () => {
    expect(statusAt(cafe, '2026-11-02T12:00:00Z')).toBe('open')
  })

  it('is open inside a later pair', () => {
    expect(statusAt(cafe, '2026-11-03T12:00:00Z')).toBe('open')
  })

  it('is closed between the pairs', () => {
    expect(statusAt(cafe, '2026-11-03T03:00:00Z')).toBe('closed')
  })

  it('opens at the start of a pair', () => {
    expect(statusAt(cafe, '2026-11-02T05:59:59Z')).toBe('closed')
    expect(statusAt(cafe, '2026-11-02T06:00:00Z')).toBe('open')
  })

  it('closes at the end of a pair', () => {
    expect(statusAt(cafe, '2026-11-02T20:59:59Z')).toBe('open')
    expect(statusAt(cafe, '2026-11-02T21:00:00Z')).toBe('closed')
  })

  it('is closed for a place with an empty list, which is closed throughout', () => {
    expect(statusAt([], '2026-11-02T12:00:00Z')).toBe('closed')
  })

  it('is unknown for a place with no hours', () => {
    expect(statusAt(undefined, '2026-11-02T12:00:00Z')).toBe('unknown')
  })

  it.each([
    ['open', allWeeks],
    ['closed', []],
  ] as const)('is %s from the first moment of the window, and unknown before it', (inside, hours) => {
    expect(statusAt([...hours], '2026-11-01T22:59:59.999Z')).toBe('unknown')
    expect(statusAt([...hours], '2026-11-01T23:00:00.000Z')).toBe(inside)
  })

  it.each([
    ['open', allWeeks],
    ['closed', []],
  ] as const)('is %s up to the last moment of the window, and unknown from its end', (inside, hours) => {
    expect(statusAt([...hours], '2026-11-15T22:59:59.999Z')).toBe(inside)
    expect(statusAt([...hours], '2026-11-15T23:00:00.000Z')).toBe('unknown')
  })

  it('counts real minutes across a clock change', () => {
    // From the build's test: 08:00 local on Sunday 31 October, after the clocks went back an hour.
    const sunday: [number, number][] = [[9180, 9780]]
    const autumn = '2027-10-24T22:00:00.000Z'
    expect(openStatus(sunday, autumn, Date.parse('2027-10-31T06:59:59Z'))).toBe('closed')
    expect(openStatus(sunday, autumn, Date.parse('2027-10-31T07:00:00Z'))).toBe('open')
  })

  it.each([
    ['is missing', undefined],
    ['does not parse', 'soon'],
  ])('is unknown when the window start %s', (_, start) => {
    expect(openStatus(cafe, start, Date.parse('2026-11-02T12:00:00Z'))).toBe('unknown')
  })
})
