import { describe, expect, it } from 'vitest'
import { wikiLink } from './wiki'

const all = { q: 'Q1', hu: 'Magyar cím', en: 'English title' }
const german = { Q1: 'Deutscher Titel' }

describe('wikiLink', () => {
  it('is the article in the phone language, when that edition has one', () => {
    expect(wikiLink(all, 'de', german)).toEqual({
      text: 'Wikipedia · DE',
      url: 'https://de.wikipedia.org/wiki/Deutscher_Titel',
    })
    expect(wikiLink(all, 'hu', null)?.text).toBe('Wikipedia · HU')
    expect(wikiLink(all, 'en', null)?.text).toBe('Wikipedia · EN')
  })

  it('is the Hungarian article when the phone language has none', () => {
    expect(wikiLink({ q: 'Q2', hu: 'Magyar', en: 'English' }, 'de', german)).toEqual({
      text: 'Wikipedia · HU',
      url: 'https://hu.wikipedia.org/wiki/Magyar',
    })
  })

  it('is the Hungarian article while the phone language has no titles to look in', () => {
    expect(wikiLink(all, 'fr', null)?.text).toBe('Wikipedia · HU')
  })

  it('is the English article when there is nothing before it', () => {
    expect(wikiLink({ q: 'Q2', en: 'English' }, 'de', german)).toEqual({
      text: 'Wikipedia · EN',
      url: 'https://en.wikipedia.org/wiki/English',
    })
    expect(wikiLink({ en: 'English' }, 'hu', null)?.text).toBe('Wikipedia · EN')
  })

  it('is the Hungarian article on an English phone, when there is no English one', () => {
    expect(wikiLink({ hu: 'Magyar' }, 'en', null)?.text).toBe('Wikipedia · HU')
  })

  it('looks up no title for a place without a Wikidata id', () => {
    expect(wikiLink({ hu: 'Magyar' }, 'de', german)?.text).toBe('Wikipedia · HU')
  })

  it('is nothing for a place with no article', () => {
    expect(wikiLink(undefined, 'de', german)).toBeUndefined()
    expect(wikiLink({}, 'de', german)).toBeUndefined()
    expect(wikiLink({ q: 'Q2' }, 'de', german)).toBeUndefined()
  })

  describe('writes the title into the URL', () => {
    const urlOf = (hu: string) => wikiLink({ hu }, 'hu', null)?.url

    it('with underscores for spaces, and accents encoded', () => {
      expect(urlOf('Deák Ferenc tér (Budapest)')).toBe('https://hu.wikipedia.org/wiki/De%C3%A1k_Ferenc_t%C3%A9r_(Budapest)')
    })

    it('so that a question mark and a percent sign stay in the title', () => {
      expect(urlOf('Mi van?')).toBe('https://hu.wikipedia.org/wiki/Mi_van%3F')
      expect(urlOf('100% hús')).toBe('https://hu.wikipedia.org/wiki/100%25_h%C3%BAs')
    })

    it('leaving a slash as it is, as Wikipedia writes it', () => {
      expect(urlOf('AC/DC')).toBe('https://hu.wikipedia.org/wiki/AC/DC')
    })

    it('leaving the section an OpenStreetMap tag names', () => {
      expect(urlOf('Budapest#Terek')).toBe('https://hu.wikipedia.org/wiki/Budapest#Terek')
    })
  })
})
