import { readFileSync } from 'node:fs'
import { expect, test } from './fixtures'

// These tests must fail. test.fail() counts them as passed only if they do, though the
// list reporter still marks them ✘. Each body only makes the request, so the fixture is
// all that can fail them.
for (const url of [
  'https://example.invalid/',
  'https://example.invalid/kilato/',
  'https://tile.openstreetmap.org.example.invalid/1/0/0.png',
  'https://example.invalid/kilato/data/manifest.json',
]) {
  test(`a request to ${url} fails the test`, async ({ page }) => {
    test.fail()
    await page.evaluate((target) => fetch(target).catch(() => null), url)
  })
}

// Same origin, but not a file of the build: the preview answers some of these with a 200
// index.html, so only the fixture can catch them. test.fail() comes after goto, so a page
// that doesn't open is a plain failure.
for (const path of [
  '/outside.json',
  '/outside/index.html',
  '/data/manifest.json',
  '/kilato/missing.js',
  '/kilato/assets/',
  '/kilato/..%2fpackage.json',
]) {
  test(`a same-origin request to ${path} fails the test`, async ({ page }) => {
    await page.goto('/kilato/')
    test.fail()
    await page.evaluate((target) => fetch(target).catch(() => null), path)
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

for (const path of ['/kilato/data/cells/none.json', '/kilato/data/']) {
  test(`a data request to ${path}, which is not a file, gets a 404`, async ({ page }) => {
    await page.goto('/kilato/')
    const status = await page.evaluate(
      (target) => fetch(target).then((response) => response.status),
      path,
    )
    expect(status).toBe(404)
  })
}
