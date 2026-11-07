import { expect, it } from 'vitest'
import type { CategoryId } from '../core/types'
import { categoryColors, categoryTextColors } from './categoryColors'

it('gives the six categories six different colours', () => {
  expect(new Set(Object.values(categoryColors)).size).toBe(6)
})

// WCAG 2's relative luminance and contrast ratio.
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5]
    .map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
    .map((part) => (part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (one: string, other: string) => {
  const [light, dark] = [luminance(one), luminance(other)].sort((a, b) => b - a)
  return (light + 0.05) / (dark + 0.05)
}

it.each(Object.keys(categoryColors) as CategoryId[])('keeps the name on the %s chip readable', (id) => {
  expect(contrast(categoryColors[id], categoryTextColors[id])).toBeGreaterThanOrEqual(4.5)
})
