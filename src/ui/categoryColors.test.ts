import { expect, it } from 'vitest'
import { categoryColors } from './categoryColors'

it('gives the six categories six different colours', () => {
  expect(new Set(Object.values(categoryColors)).size).toBe(6)
})
