import { describe, expect, it } from 'vitest'
import { secondName } from './names'

describe('secondName', () => {
  const place = { names: { hu: 'Szent István-bazilika', en: "St. Stephen's Basilica" } }

  it('is names.hu when the UI is Hungarian', () => {
    expect(secondName(place, 'hu')).toBe('Szent István-bazilika')
  })

  it('is names.en when the UI is English', () => {
    expect(secondName(place, 'en')).toBe("St. Stephen's Basilica")
  })

  it('is nothing when the place has no name in the UI language', () => {
    expect(secondName({ names: { en: 'Parliament' } }, 'hu')).toBeUndefined()
    expect(secondName({ names: { hu: 'Országház' } }, 'en')).toBeUndefined()
  })

  it('is nothing when the place has no other names', () => {
    expect(secondName({}, 'hu')).toBeUndefined()
    expect(secondName({}, 'en')).toBeUndefined()
  })
})
