import { describe, expect, it } from 'vitest'
import { hoursWindowMinutes, openStatus } from './hours'
import { adjustments, sortRows, type Order } from './rank'
import type { CategoryId, Place } from './types'

const windowStart = '2026-11-01T23:00:00.000Z'
const now = Date.parse('2026-11-02T10:00:00.000Z')
const statusOf = (place: Place) => openStatus(place.hours, windowStart, now)

const open: Place['hours'] = [[0, hoursWindowMinutes]]
const closed: Place['hours'] = []
const article: Place['wiki'] = { hu: 'Cikk' }

const rowAt = (metres: number, name: string, cat: Place['cat'], more: Partial<Place> = {}) => ({
  place: { id: name, cat, kind: 'any', lat: 0, lon: 0, name, ...more },
  metres,
})

const sorted = (rows: ReturnType<typeof rowAt>[], order: Order) =>
  sortRows(rows, order, statusOf).map(({ place }) => place.name)

describe('Nearest', () => {
  it('ignores everything but distance', () => {
    const rows = [
      rowAt(400, 'sight with an article', 'sights', { wiki: article, hours: open }),
      rowAt(60, 'closed bakery', 'food', { hours: closed }),
      rowAt(200, 'shop', 'shops'),
    ]
    expect(sorted(rows, 'nearest')).toEqual(['closed bakery', 'shop', 'sight with an article'])
  })

  it('keeps the order of rows at the same distance', () => {
    const rows = [rowAt(100, 'Zebra', 'shops'), rowAt(100, 'Alma', 'sights', { wiki: article })]
    expect(sorted(rows, 'nearest')).toEqual(['Zebra', 'Alma'])
  })
})

describe('Most relevant', () => {
  it('puts a sight with an article 400 m away before a closed bakery 60 m away', () => {
    const rows = [
      rowAt(60, 'closed bakery', 'food', { hours: closed }),
      rowAt(400, 'sight with an article', 'sights', { wiki: article }),
    ]
    expect(sorted(rows, 'relevant')).toEqual(['sight with an article', 'closed bakery'])
  })

  it('puts an open café 300 m away before a closed café 50 m away', () => {
    const rows = [
      rowAt(50, 'closed café', 'food', { hours: closed }),
      rowAt(300, 'open café', 'food', { hours: open }),
    ]
    expect(sorted(rows, 'relevant')).toEqual(['open café', 'closed café'])
  })

  it('puts a shop with an article 250 m away before a shop without one 50 m away', () => {
    const rows = [rowAt(50, 'plain shop', 'shops'), rowAt(250, 'shop with an article', 'shops', { wiki: article })]
    expect(sorted(rows, 'relevant')).toEqual(['shop with an article', 'plain shop'])
  })

  it('puts the nearer of two places with the same signals first', () => {
    const signals = { wiki: article, hours: open }
    const rows = [rowAt(120, 'further', 'sights', signals), rowAt(80, 'nearer', 'sights', signals)]
    expect(sorted(rows, 'relevant')).toEqual(['nearer', 'further'])
  })

  // These read the table for their distances, so that they still hold when the weights are tuned.
  describe('counts as its adjustment in the table', () => {
    const { category, status } = adjustments
    const cases: [string, Partial<Place>, number][] = [
      ['an article', { wiki: article }, adjustments.article],
      ['open', { hours: open }, status.open - status.unknown],
      ['closed', { hours: closed }, status.closed - status.unknown],
      ...(Object.keys(category) as CategoryId[]).map((cat): [string, Partial<Place>, number] => [
        cat,
        { cat },
        category[cat] - category.shops,
      ]),
    ]

    it.each(cases)('%s', (_, signal, adjustment) => {
      const plain = rowAt(500, 'plain', 'shops')
      const signalled = (metres: number) => rowAt(metres, 'signalled', 'shops', signal)

      expect(sorted([plain, signalled(500 - adjustment - 1)], 'relevant')).toEqual(['signalled', 'plain'])
      expect(sorted([signalled(500 - adjustment + 1), plain], 'relevant')).toEqual(['plain', 'signalled'])
    })
  })

  it('gives a tie to the nearer place, whatever the names, with every signal added up', () => {
    const adjustment = adjustments.article + adjustments.category.sights + adjustments.status.open
    const further = rowAt(50 - adjustment, 'Alma', 'sights', { wiki: article, hours: open })
    const nearer = rowAt(50, 'Zebra', 'shops')

    expect(sorted([further, nearer], 'relevant')).toEqual(['Zebra', 'Alma'])
  })

  it('gives a tie at the same distance to the name first in the Hungarian alphabet', () => {
    // By code unit, Á comes after Z. In English, Cs comes before Cu. In Hungarian, Cs is a letter after C.
    const rows = ['Zebra', 'Csarnok', 'Cukrászda', 'Ábel', 'Alma'].map((name) => rowAt(100, name, 'food'))

    expect(sorted(rows, 'relevant')).toEqual(['Ábel', 'Alma', 'Cukrászda', 'Csarnok', 'Zebra'])
  })
})

it.each<Order>(['nearest', 'relevant'])('leaves the rows it was given as they were, in %s order', (order) => {
  // The map draws these same rows, and a new order mustn't redraw it.
  const rows = [rowAt(300, 'far', 'sights'), rowAt(100, 'near', 'shops')]
  sortRows(rows, order, statusOf)
  expect(rows.map(({ place }) => place.name)).toEqual(['far', 'near'])
})
