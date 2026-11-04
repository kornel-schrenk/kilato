import { expect, it } from 'vitest'
import { cellKey } from './cells'

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
