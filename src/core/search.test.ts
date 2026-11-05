import { describe, expect, it } from 'vitest'
import { placeSearch, type SearchPlace } from './search'

// 0.001° of latitude is 111 m, so `north` is about 111 m a step from the point.
const point = { lat: 47.5, lon: 19.05 }
const place = (name: string, north = 0, names?: SearchPlace['names']): SearchPlace => ({
  id: name,
  cat: 'food',
  lat: point.lat + north * 0.001,
  lon: point.lon,
  name,
  ...(names && { names }),
})

const found = (places: SearchPlace[], query: string) => placeSearch(places)(query, point).map(({ name }) => name)

describe('what matches', () => {
  it('ignores accents, so kave finds Kávé', () => {
    expect(found([place('Kávé'), place('Tea')], 'kave')).toEqual(['Kávé'])
  })

  it('ignores accents in the query too', () => {
    expect(found([place('Kave')], 'kávé')).toEqual(['Kave'])
  })

  it('knows the Hungarian long accents', () => {
    expect(found([place('Őrház'), place('Fűszeres')], 'orhaz')).toEqual(['Őrház'])
    expect(found([place('Őrház'), place('Fűszeres')], 'fusz')).toEqual(['Fűszeres'])
  })

  it('ignores case', () => {
    expect(found([place('Kávé')], 'KÁVÉ')).toEqual(['Kávé'])
    expect(found([place('KÁVÉ')], 'kávé')).toEqual(['KÁVÉ'])
  })

  it('finds the query anywhere in a name', () => {
    expect(found([place('Múzeumkávézó')], 'kave')).toEqual(['Múzeumkávézó'])
  })

  it('looks in names.hu and names.en', () => {
    const inHungarian = place('Parliament', 0, { hu: 'Országház' })
    const inEnglish = place('Országház', 0, { en: 'Parliament' })
    expect(found([inHungarian], 'orszag')).toEqual(['Parliament'])
    expect(found([inEnglish], 'parl')).toEqual(['Országház'])
  })

  it('finds nothing when no name has the query', () => {
    expect(found([place('Kávé', 0, { hu: 'Kávé', en: 'Coffee' })], 'tea')).toEqual([])
  })

  it('matches an accent typed as a separate mark, in the query or in the name', () => {
    expect(found([place('Kávé')], 'Kávé')).toEqual(['Kávé'])
    expect(found([place('Kávé')], 'kávé')).toEqual(['Kávé'])
  })

  it('reads the characters of a regular expression as plain text', () => {
    expect(found([place('Kávé (régi)'), place('Tea')], '(r')).toEqual(['Kávé (régi)'])
    expect(found([place('Kávé')], '.*')).toEqual([])
  })
})

describe('how long a query has to be', () => {
  it('finds nothing with one character', () => {
    expect(found([place('Kávé')], 'k')).toEqual([])
  })

  it('finds places with two', () => {
    expect(found([place('Kávé')], 'ká')).toEqual(['Kávé'])
  })

  it('counts neither the spaces around a query nor nothing at all', () => {
    expect(found([place('Kávé')], ' k ')).toEqual([])
    expect(found([place('Kávé')], '')).toEqual([])
    expect(found([place('Kávé')], ' ká ')).toEqual(['Kávé'])
  })

  it('counts an accented letter as one, however it is encoded', () => {
    expect(found([place('Ábel')], 'Á')).toEqual([])
  })
})

describe('the order', () => {
  it('puts names that begin with the query first, even when they are further away', () => {
    const places = [place('Nagy Kávéház', 1), place('Kávéház', 5)]
    expect(found(places, 'kave')).toEqual(['Kávéház', 'Nagy Kávéház'])
  })

  it('counts a place as beginning with the query when any of its names does', () => {
    const places = [place('Nagy Kávéház', 1), place('Nagy Sör', 5, { en: 'Kávé Bar' })]
    expect(found(places, 'kave')).toEqual(['Nagy Sör', 'Nagy Kávéház'])
  })

  it('puts the nearest first among names that begin with the query', () => {
    const places = [place('Kávé far', 5), place('Kávé south', -2), place('Kávé near', 1)]
    expect(found(places, 'kave')).toEqual(['Kávé near', 'Kávé south', 'Kávé far'])
  })

  it('puts the nearest first among the rest', () => {
    const places = [place('A Kávé far', 5), place('A Kávé south', -2), place('A Kávé near', 1)]
    expect(found(places, 'kave')).toEqual(['A Kávé near', 'A Kávé south', 'A Kávé far'])
  })

  it('keeps the 20 of the first group when the second group is nearer', () => {
    const beginning = Array.from({ length: 20 }, (_, index) => place(`Kávé ${index}`, 100 + index))
    const names = found([place('A Kávé nearest', 1), ...beginning], 'kave')
    expect(names).toHaveLength(20)
    expect(names).not.toContain('A Kávé nearest')
  })
})

describe('how many', () => {
  const many = Array.from({ length: 25 }, (_, index) => place(`Kávé ${index}`, 25 - index))

  it('stops at 20, and keeps the first 20 in order', () => {
    const names = found(many, 'kave')
    expect(names).toHaveLength(20)
    expect(names[0]).toBe('Kávé 24')
    expect(names[19]).toBe('Kávé 5')
  })

  it('keeps every field of the places it finds', () => {
    const one = place('Kávé', 1, { en: 'Coffee' })
    expect(placeSearch([one])('kave', point)).toEqual([one])
  })

  it('answers each query from the same places, at the point of that query', () => {
    const search = placeSearch([place('Kávé north', 1), place('Kávé south', -1)])
    const names = (query: string, north: number) =>
      search(query, { ...point, lat: point.lat + north * 0.001 }).map(({ name }) => name)
    expect(names('kave', 0.9)).toEqual(['Kávé north', 'Kávé south'])
    expect(names('kave', -0.9)).toEqual(['Kávé south', 'Kávé north'])
    expect(names('tea', 0)).toEqual([])
  })
})
