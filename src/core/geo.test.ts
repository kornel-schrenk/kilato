import { describe, expect, it } from 'vitest'
import { distanceMetres, nearby } from './geo'

const deak = { lat: 47.4975, lon: 19.0545 }

it('is 0 between a point and itself', () => {
  expect(distanceMetres(deak, deak)).toBe(0)
})

it('gives 111.19 m for 0.001° of latitude', () => {
  // 6,371,000 m × π / 180 × 0.001, worked out by hand.
  expect(distanceMetres(deak, { lat: 47.4985, lon: 19.0545 })).toBeCloseTo(111.19, 1)
})

it('shrinks a degree of longitude with the latitude', () => {
  // 6,371,000 m × acos(sin²φ + cos²φ × cos 1°) = 75,125 m: the law of cosines, a different formula.
  expect(distanceMetres(deak, { lat: 47.4975, lon: 20.0545 })).toBeCloseTo(75125, 0)
})

it('is the same in both directions', () => {
  const nyugati = { lat: 47.5105, lon: 19.0566 }
  expect(distanceMetres(deak, nyugati)).toBe(distanceMetres(nyugati, deak))
})

describe('nearby', () => {
  // 0.001° of latitude is 111.19 m.
  const north = (id: string, thousandths: number) => ({ id, lat: deak.lat + thousandths / 1000, lon: deak.lon })

  it('sorts the places nearest first, with each distance', () => {
    const rows = nearby([north('far', 5), north('near', 1), north('middle', 3)], deak, 1000)
    expect(rows.map(({ place }) => place.id)).toEqual(['near', 'middle', 'far'])
    expect(rows[0].metres).toBeCloseTo(111.19, 1)
    expect(rows[2].metres).toBeCloseTo(555.97, 1)
  })

  it('leaves out a place past the distance', () => {
    // 0.009° is 1,000.75 m, and 0.0089° is 989.64 m.
    const rows = nearby([north('out', 9), north('in', 8.9)], deak, 1000)
    expect(rows.map(({ place }) => place.id)).toEqual(['in'])
  })

  it('keeps a place exactly at the distance', () => {
    const edge = north('edge', 2)
    expect(nearby([edge], deak, distanceMetres(deak, edge))).toHaveLength(1)
  })

  it('counts haversine distance, so a degree of longitude is shorter than one of latitude', () => {
    // 0.012° of longitude here is 901.5 m, and 0.012° of latitude would be 1,334 m.
    const rows = nearby([{ id: 'east', lat: deak.lat, lon: deak.lon + 0.012 }, north('north', 12)], deak, 1000)
    expect(rows.map(({ place }) => place.id)).toEqual(['east'])
  })

  it('keeps the order of places at the same distance', () => {
    const rows = nearby([north('first', 1), north('second', 1)], deak, 1000)
    expect(rows.map(({ place }) => place.id)).toEqual(['first', 'second'])
  })
})
