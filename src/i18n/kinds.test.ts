import { expect, it } from 'vitest'
import { CATEGORY_RULES } from '../../scripts/data/categories'
import { kindLabel, kindLabels } from './kinds'

const HISTORIC = ['monument', 'memorial', 'castle', 'ruins', 'building', 'archaeological_site', 'city_gate', 'citywalls', 'fort', 'manor', 'tomb', 'wayside_cross']
const SHOP = ['supermarket', 'convenience', 'clothes', 'shoes', 'books', 'florist', 'butcher', 'greengrocer', 'kiosk', 'tobacco', 'alcohol', 'wine', 'chemist', 'cosmetics', 'mobile_phone', 'electronics', 'computer', 'jewelry', 'gift', 'furniture', 'hardware', 'doityourself', 'pet', 'toys', 'sports', 'bicycle', 'department_store', 'mall', 'variety_store', 'second_hand', 'stationery', 'newsagent']

const tableValues = CATEGORY_RULES.flatMap((rule) => (rule.values === 'any' ? [] : rule.values))
const listed = [...new Set([...tableValues, ...HISTORIC, ...SHOP, 'article'])]

it('lists 12 historic and 32 shop values', () => {
  expect(HISTORIC).toHaveLength(12)
  expect(SHOP).toHaveLength(32)
})

it.each(listed)('has a Hungarian and an English label for %s', (kind) => {
  expect(kindLabels[kind]?.hu).toBeTruthy()
  expect(kindLabels[kind]?.en).toBeTruthy()
})

it('labels an article in both languages', () => {
  expect(kindLabel('notable', 'article', 'en')).toBe('Wikipedia article')
  expect(kindLabel('notable', 'article', 'hu')).toBe('Wikipédia-szócikk')
})

it('labels a listed kind in each language', () => {
  expect(kindLabel('food', 'cafe', 'en')).toBe('Café')
  expect(kindLabel('food', 'cafe', 'hu')).toBe('Kávézó')
})

it('falls back for an unlisted historic kind in sights', () => {
  expect(kindLabel('sights', 'wayside_shrine', 'en')).toBe('Historic site')
  expect(kindLabel('sights', 'wayside_shrine', 'hu')).toBe('Történelmi hely')
})

it('falls back for an unlisted kind in shops', () => {
  expect(kindLabel('shops', 'fabric', 'en')).toBe('Shop')
  expect(kindLabel('shops', 'fabric', 'hu')).toBe('Üzlet')
})

it('does not take a label another category lists', () => {
  expect(kindLabel('shops', 'swimming_pool', 'hu')).toBe('Üzlet')
  expect(kindLabel('shops', 'ice_cream', 'en')).toBe('Shop')
  expect(kindLabel('sights', 'park', 'en')).toBe('Historic site')
  expect(kindLabel('sights', 'museum', 'en')).toBe('Museum')
})

it.each(['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty'])('falls back for the inherited name %s', (kind) => {
  expect(kindLabel('shops', kind, 'en')).toBe('Shop')
  expect(kindLabel('sights', kind, 'hu')).toBe('Történelmi hely')
})

it('finds every listed value in its category', () => {
  for (const rule of CATEGORY_RULES) {
    if (rule.values === 'any') continue
    for (const kind of rule.values) expect(kindLabel(rule.cat, kind, 'en')).toBe(kindLabels[kind]?.en)
  }
  for (const kind of HISTORIC) expect(kindLabel('sights', kind, 'en')).toBe(kindLabels[kind]?.en)
  for (const kind of SHOP) expect(kindLabel('shops', kind, 'en')).toBe(kindLabels[kind]?.en)
})
