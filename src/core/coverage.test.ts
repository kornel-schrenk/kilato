import { describe, expect, it } from 'vitest'
import { coverageBox, inCoverage } from './coverage'

const { west, south, east, north } = coverageBox
const middle = { lat: (south + north) / 2, lon: (west + east) / 2 }
const nudge = 0.0001

it('is the box planning measured', () => {
  expect(coverageBox).toEqual({ west: 18.925, south: 47.35, east: 19.335, north: 47.62 })
})

it('covers a point in the middle', () => {
  expect(inCoverage(middle)).toBe(true)
})

describe.each([
  { edge: 'west', inside: { ...middle, lon: west + nudge }, outside: { ...middle, lon: west - nudge } },
  { edge: 'east', inside: { ...middle, lon: east - nudge }, outside: { ...middle, lon: east + nudge } },
  { edge: 'south', inside: { ...middle, lat: south + nudge }, outside: { ...middle, lat: south - nudge } },
  { edge: 'north', inside: { ...middle, lat: north - nudge }, outside: { ...middle, lat: north + nudge } },
])('at the $edge edge', ({ inside, outside }) => {
  it('covers a point just inside', () => {
    expect(inCoverage(inside)).toBe(true)
  })

  it('does not cover a point just outside', () => {
    expect(inCoverage(outside)).toBe(false)
  })
})

it.each([
  { edge: 'west', point: { ...middle, lon: west } },
  { edge: 'east', point: { ...middle, lon: east } },
  { edge: 'south', point: { ...middle, lat: south } },
  { edge: 'north', point: { ...middle, lat: north } },
])('covers a point exactly on the $edge edge', ({ point }) => {
  expect(inCoverage(point)).toBe(true)
})

it('does not cover Vienna', () => {
  expect(inCoverage({ lat: 48.2082, lon: 16.3738 })).toBe(false)
})
