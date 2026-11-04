import { expect, it } from 'vitest'
import { distanceMetres } from './geo'

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
