import { expect, it } from 'vitest'
import { en } from './en'
import { hu } from './hu'

it('hu.ts and en.ts have the same keys', () => {
  expect(Object.keys(hu).sort()).toEqual(Object.keys(en).sort())
})
