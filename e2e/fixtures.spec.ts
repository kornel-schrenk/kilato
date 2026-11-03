import { readFileSync } from 'node:fs'
import { expect, test } from './fixtures'

// These tests must fail. test.fail() counts them as passed only if they do, though the
// list reporter still marks them ✘. Each body only makes the request, so the fixture is
// all that can fail them.
for (const url of [
  'https://example.invalid/',
  'https://tile.openstreetmap.org.example.invalid/1/0/0.png',
  'https://example.invalid/kilato/data/manifest.json',
]) {
  test(`a request to ${url} fails the test`, async ({ page }) => {
    test.fail()
    await page.evaluate((target) => fetch(target).catch(() => null), url)
  })
}

test('an unexpected WebSocket fails the test', async ({ page }) => {
  test.fail()
  await page.evaluate(
    () =>
      new Promise((closed) => {
        new WebSocket('wss://example.invalid/').onclose = closed
      }),
  )
})

test('a tile request gets the blank tile', async ({ page }) => {
  const url = 'https://tile.openstreetmap.org/15/18514/11710.png'
  await page.goto('/kilato/')
  const [response] = await Promise.all([
    page.waitForResponse(url),
    page.evaluate(async (src) => {
      const tile = new Image()
      tile.src = src
      await tile.decode()
    }, url),
  ])
  expect(await response.body()).toEqual(readFileSync(new URL('../test/fixtures/tile.png', import.meta.url)))
})

test('a data request gets the file from site-data', async ({ page }) => {
  await page.goto('/kilato/')
  const manifest = await page.evaluate(() =>
    fetch('/kilato/data/manifest.json').then((response) => response.json()),
  )
  expect(manifest.version).toBe(1)
})

test('a data file that does not exist gets a 404', async ({ page }) => {
  await page.goto('/kilato/')
  const status = await page.evaluate(() =>
    fetch('/kilato/data/cells/none.json').then((response) => response.status),
  )
  expect(status).toBe(404)
})
