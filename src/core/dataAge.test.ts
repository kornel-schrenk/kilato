import { describe, expect, it } from 'vitest'
import { dataAge } from './dataAge'

const built = '2026-11-02T03:17:00.000Z'
const manifest = { osmDataAt: built, wikipediaAt: built }

describe('dataAge', () => {
  it('takes the date of the older source, whichever that is', () => {
    const older = '2026-10-30T10:00:00.000Z'
    const now = new Date('2026-11-05T10:00:00.000Z')

    for (const sources of [
      { osmDataAt: older, wikipediaAt: built },
      { osmDataAt: built, wikipediaAt: older },
    ]) {
      const { date, days } = dataAge(sources, now)
      expect(date.toISOString()).toBe(older)
      expect(days).toBe(6)
    }
  })

  it('counts whole days', () => {
    expect(dataAge(manifest, new Date('2026-11-02T03:17:00.000Z')).days).toBe(0)
    expect(dataAge(manifest, new Date('2026-11-05T03:16:59.999Z')).days).toBe(2)
    expect(dataAge(manifest, new Date('2026-11-05T03:17:00.000Z')).days).toBe(3)
  })

  it('warns only when the data is more than 10 days old', () => {
    expect(dataAge(manifest, new Date('2026-11-05T03:17:00.000Z')).stale).toBe(false)
    expect(dataAge(manifest, new Date('2026-11-12T03:17:00.000Z')).stale).toBe(false)
    expect(dataAge(manifest, new Date('2026-11-12T03:17:00.001Z')).stale).toBe(true)
    expect(dataAge(manifest, new Date('2026-11-13T03:17:00.000Z')).stale).toBe(true)
  })

  it('counts a phone clock behind the data as 0 days', () => {
    expect(dataAge(manifest, new Date('2026-10-30T12:00:00.000Z'))).toMatchObject({ days: 0, stale: false })
  })
})
