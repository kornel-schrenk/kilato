import { describe, expect, it } from 'vitest'
import { formatDate, formatNumber, phoneLanguage, uiLanguage } from './lang'

describe('phoneLanguage', () => {
  it('is the primary subtag of the first language', () => {
    expect(phoneLanguage(['de-AT', 'hu-HU'])).toBe('de')
    expect(phoneLanguage(['hu-HU', 'en-GB'])).toBe('hu')
    expect(phoneLanguage(['zh-Hant-TW'])).toBe('zh')
    expect(phoneLanguage(['hu'])).toBe('hu')
  })

  it('is empty when the browser lists no language', () => {
    expect(phoneLanguage([])).toBe('')
  })
})

describe('uiLanguage', () => {
  it('is Hungarian on a Hungarian phone and English on any other', () => {
    expect(uiLanguage(null, 'hu')).toBe('hu')
    expect(uiLanguage(null, 'en')).toBe('en')
    expect(uiLanguage(null, 'de')).toBe('en')
    expect(uiLanguage(null, '')).toBe('en')
  })

  it('follows the saved choice over the phone language', () => {
    expect(uiLanguage('en', 'hu')).toBe('en')
    expect(uiLanguage('hu', 'de')).toBe('hu')
  })

  it('ignores a saved value that is not a UI language', () => {
    expect(uiLanguage('de', 'hu')).toBe('hu')
    expect(uiLanguage('', 'de')).toBe('en')
  })
})

describe('formatNumber', () => {
  it('formats the same number differently for hu and en', () => {
    expect(formatNumber(1234.5, 'hu')).toBe('1234,5')
    expect(formatNumber(1234.5, 'en')).toBe('1,234.5')
  })
})

describe('formatDate', () => {
  // Noon UTC, so the day is the same in nearly every time zone a test runs in.
  const date = new Date('2026-11-02T12:00:00Z')

  it('writes dates the way the spec shows them', () => {
    expect(formatDate(date, 'hu')).toBe('2026. nov. 2.')
    expect(formatDate(date, 'en')).toBe('2 Nov 2026')
  })
})
