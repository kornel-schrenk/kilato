import { describe, expect, it } from 'vitest'
import { cellKey, cellsWithin } from './cells'

it('gives Deák Ferenc tér the key the spec names', () => {
  expect(cellKey(47.4975, 19.0545)).toBe('4749_1270')
})

it('rounds both parts of the key down, even near the next cell', () => {
  // 47.509 × 100 = 4750.9 and 19.06 × 200 / 3 = 1270.67, so rounding to nearest would give 4751_1271.
  expect(cellKey(47.509, 19.06)).toBe('4750_1270')
})

it('moves to the next cell 0.01° north and 0.015° east', () => {
  expect(cellKey(47.5051, 19.0545)).toBe('4750_1270')
  expect(cellKey(47.4975, 19.0651)).toBe('4749_1271')
})

describe('cellsWithin', () => {
  const threeByThree = (rows: number[], cols: number[]) => rows.flatMap((row) => cols.map((col) => `${row}_${col}`))

  it('finds all nine cells from the middle of a cell', () => {
    // From 47.495, 19.0575 the nearest corner of a corner cell is 556 m north and 563 m east, so 791 m away.
    const keys = threeByThree([4748, 4749, 4750], [1269, 1270, 1271])
    expect(cellsWithin(keys, { lat: 47.495, lon: 19.0575 }, 1000)).toEqual(keys)
  })

  it('leaves out a corner the circle misses, though its row and its column are in reach', () => {
    // From 47.4915, 19.0535: the row starts 945 m north and the column 864 m east, so the corner is 1,280 m away.
    const keys = threeByThree([4748, 4749, 4750], [1269, 1270, 1271])
    const found = cellsWithin(keys, { lat: 47.4915, lon: 19.0535 }, 1000)
    expect(found).toEqual(keys.filter((key) => key !== '4750_1271'))
  })

  it('leaves out a cell whose nearest edge is over 1 km away', () => {
    // From 47.495, the row 4751 starts at 47.51: 0.015° north, or 1,668 m. The row 4750 starts 556 m north.
    expect(cellsWithin(['4750_1270', '4751_1270'], { lat: 47.495, lon: 19.0575 }, 1000)).toEqual(['4750_1270'])
  })

  it('looks only among the keys it is given', () => {
    expect(cellsWithin(['4749_1270'], { lat: 47.495, lon: 19.0575 }, 1000)).toEqual(['4749_1270'])
    expect(cellsWithin([], { lat: 47.495, lon: 19.0575 }, 1000)).toEqual([])
  })

  it('finds nothing far outside the box, at any latitude', () => {
    const keys = threeByThree([4748, 4749, 4750], [1269, 1270, 1271])
    expect(cellsWithin(keys, { lat: 40.7, lon: -74 }, 1000)).toEqual([])
    expect(cellsWithin(keys, { lat: 90, lon: 0 }, 1000)).toEqual([])
  })

  it('finds at most 3 × 3 cells from anywhere in the box', () => {
    const rows = Array.from({ length: 28 }, (_, index) => 4735 + index)
    const cols = Array.from({ length: 29 }, (_, index) => 1261 + index)
    const keys = threeByThree(rows, cols)
    for (let lat = 47.35; lat <= 47.62; lat += 0.0213) {
      for (let lon = 18.925; lon <= 19.335; lon += 0.0317) {
        const found = cellsWithin(keys, { lat, lon }, 1000).map((key) => key.split('_'))
        expect(new Set(found.map(([row]) => row)).size).toBeLessThanOrEqual(3)
        expect(new Set(found.map(([, col]) => col)).size).toBeLessThanOrEqual(3)
      }
    }
  })
})
