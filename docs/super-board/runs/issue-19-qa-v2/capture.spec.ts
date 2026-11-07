import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { expect, test } from '../../../../e2e/fixtures'
import { box, button, expectNear, mapCentre } from '../../../../e2e/map-helpers'
import { placeSearch, type SearchPlace } from '../../../../src/core/search'

// Takes the screenshots of the QA handoff, and writes what it measures to probe.txt.
const here = import.meta.dirname
const shot = (page: Page, name: string) => page.screenshot({ path: join(here, `${name}.png`) })
const note = (line: string) => appendFileSync(join(here, 'probe.txt'), `${line}\n`)

const searchFile = '/kilato/data/search.json'
const searchBox = (page: Page) => page.locator('header').getByRole('searchbox')
const results = (page: Page) => page.locator('.search-result')
const row = (page: Page, name: string) => page.locator('.place', { has: page.getByText(name, { exact: true }) })

/** Fails the test on an uncaught error in the page. The shared fixture doesn't, and a stale stub hid behind that. */
function failOnPageError(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  return () => expect(errors, 'Uncaught errors in the page').toEqual([])
}

async function explore(page: Page) {
  await page.goto('/kilato/')
  await button(page, 'Explore the map').click()
  await expect(page.locator('.pin')).toBeVisible()
  await expect(page.locator('.place').first()).toBeVisible()
}

for (const [name, viewport] of [
  ['desktop', { width: 1920, height: 1080 }],
  ['tablet', { width: 1024, height: 768 }],
  ['mobile', { width: 375, height: 667 }],
] as const) {
  test.describe(name, () => {
    test.use({ viewport })

    test('the box, the results and a pick, from the real fixture', async ({ page }) => {
      const noPageError = failOnPageError(page)
      const asked: string[] = []
      page.on('request', (request) => asked.push(new URL(request.url()).pathname))
      await page.goto('/kilato/')
      await expect(button(page, 'Explore the map')).toBeVisible()
      await expect(page.locator('header input')).toBeVisible()
      await shot(page, `ac1-box-${name}`)
      expect(asked).not.toContain(searchFile)

      await button(page, 'Explore the map').click()
      await expect(page.locator('.place').first()).toBeVisible()
      expect(asked).not.toContain(searchFile)
      await searchBox(page).fill('kave')
      await expect(results(page)).toHaveCount(6)
      await shot(page, `ac2-kave-${name}`)

      await searchBox(page).fill('ka')
      await expect(results(page)).toHaveCount(20)
      await shot(page, `ac3-ka-${name}`)

      await searchBox(page).fill('kave')
      await results(page).filter({ hasText: 'Abbázia kávéház' }).click()
      await expect(row(page, 'Abbázia kávéház')).toHaveAttribute('aria-current', 'true')
      await expect(row(page, 'Abbázia kávéház')).toBeInViewport()
      await expect(page.locator('.pin')).toBeVisible()
      await page.waitForTimeout(600)
      await shot(page, `ac4-picked-${name}`)
      note(`${name}: ${asked.filter((path) => path === searchFile).length} request for search.json, and these cells: ${asked.filter((path) => path.includes('/cells/')).map((path) => path.split('/').pop()).join(' ')}`)
      noPageError()
    })
  })
}

test.describe('in Hungarian, on a phone', () => {
  test.use({ viewport: { width: 375, height: 667 }, locale: 'hu-HU' })

  test('the results', async ({ page }) => {
    await page.goto('/kilato/')
    await expect(page.locator('.intro-buttons')).toBeVisible()
    await searchBox(page).fill('kave')
    await expect(results(page)).toHaveCount(6)
    await shot(page, 'ac2-kave-hu-mobile')
  })
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test('Question 1: a failed search.json', async ({ page }) => {
    await page.route(`**${searchFile}`, (route) => route.abort())
    await explore(page)
    await searchBox(page).focus()
    await expect(page.getByText("Couldn't load places")).toBeVisible()
    await shot(page, 'q1-failure-mobile')
    const onTop = await page.evaluate(() =>
      ['.my-location', '.leaflet-control-zoom-in', '.leaflet-control-zoom-out'].map((selector) => {
        const { x, y, width, height } = document.querySelector(selector)!.getBoundingClientRect()
        const top = document.elementFromPoint(x + width / 2, y + height / 2)
        return `${selector} ${top?.closest('.search-results') ? 'is under the message' : 'can be reached'}`
      }),
    )
    note(`phone, search.json failed: ${onTop.join(', ')}`)
  })

  test('Question 2: what a tap on the map does with the results open', async ({ page }) => {
    await explore(page)
    await searchBox(page).fill('kave')
    await expect(results(page)).toHaveCount(6)
    const six = await box(page, '.search-results')
    const map = await box(page, '.map')
    note(`phone: 6 results are ${Math.round(six.height)} px tall from y ${Math.round(six.y)}, over a map of ${Math.round(map.height)} px from y ${Math.round(map.y)}`)
    await shot(page, 'q2-results-cover-map-mobile')

    await searchBox(page).fill('abba')
    await expect(results(page)).toHaveCount(1)
    await page.mouse.click(map.x + 40, map.y + map.height - 40)
    await expect(page.locator('.pin')).toBeVisible()
    await expect(results(page)).toHaveCount(1)
    await expect(searchBox(page)).not.toBeFocused()
    note('phone: a tap on the map below one result moves the point, and the result stays open with the query in the box')
  })

  test('Question 3: a pick whose category chip is off', async ({ page }) => {
    await explore(page)
    await button(page, 'Notable places').click()
    await expect(button(page, 'Notable places')).toHaveAttribute('aria-pressed', 'false')
    await searchBox(page).fill('abba')
    await results(page).filter({ hasText: 'Abbázia kávéház' }).click()
    await expect(page.locator('.pin')).toBeVisible()
    await expect(row(page, 'Abbázia kávéház')).toHaveCount(0)
    await expect(page.locator('[aria-current]')).toHaveCount(0)
    await page.waitForTimeout(600)
    await shot(page, 'q3-pick-chip-off-mobile')
    await button(page, 'Notable places').click()
    await expect(row(page, 'Abbázia kávéház')).toHaveAttribute('aria-current', 'true')
    note('phone, Notable places off: a pick moves the point and shows no row, and nothing says why. Turning the chip on lights the row')
  })

  test('Question 3: the same pick, and what happens next', async ({ page }) => {
    const notable = button(page, 'Notable places')
    const abbazia = row(page, 'Abbázia kávéház')
    const lit = page.locator('[aria-current]')
    const pickAbbazia = async () => {
      await searchBox(page).fill('abba')
      await results(page).filter({ hasText: 'Abbázia kávéház' }).click()
      await expect(results(page)).toHaveCount(0)
    }

    // The point moves on before the chip comes back.
    await explore(page)
    await notable.click()
    await pickAbbazia()
    await expect(lit).toHaveCount(0)
    // Waits for the map to finish going there, as a tap during that lands somewhere else.
    await expectNear(() => mapCentre(page), { lat: 47.50485, lon: 19.06327 }, 3)
    const map = await box(page, '.map')
    await page.mouse.click(map.x + map.width / 2, map.y + map.height / 2 + 60)
    await expect(page.locator('.place').first()).toBeVisible()
    await notable.click()
    await expect(abbazia).toBeVisible()
    await expect(lit).toHaveCount(0)
    note('phone, chip off: pick, then a tap on the map, then chip on: the row shows and nothing is lit')

    // A second pick, whose chip is on, before the chip comes back.
    await explore(page)
    await notable.click()
    await pickAbbazia()
    await searchBox(page).fill('minta kav')
    await results(page).filter({ hasText: 'Minta Kávézó' }).click()
    await expect(row(page, 'Minta Kávézó')).toHaveAttribute('aria-current', 'true')
    await notable.click()
    await expect(lit).toHaveCount(1)
    await expect(row(page, 'Minta Kávézó')).toHaveAttribute('aria-current', 'true')
    note('phone, chip off: pick, then a pick with its chip on, then chip on: only the second is lit')

    // A row tapped before the chip comes back.
    await explore(page)
    await notable.click()
    await pickAbbazia()
    await page.locator('.place').first().click()
    await expect(lit).toHaveCount(1)
    await notable.click()
    await expect(abbazia).toHaveAttribute('aria-current', 'true')
    await expect(lit).toHaveCount(1)
    note('phone, chip off: pick, then a tap on a row, then chip on: the highlight moves from the tapped row to the picked one')

    // Every chip off.
    await explore(page)
    for (const name of ['Sights', 'Notable places', 'Food & drink', 'Culture & leisure', 'Services', 'Shops']) {
      await button(page, name).click()
    }
    await expect(page.getByText('All categories are off.')).toBeVisible()
    await pickAbbazia()
    await expect(page.getByText('All categories are off.')).toBeVisible()
    await button(page, 'Turn them all back on').click()
    await expect(abbazia).toHaveAttribute('aria-current', 'true')
    note('phone, every chip off: a pick leaves the message up, and Turn them all back on lights the row')
  })

  test('how big the results are, and whether the last of 20 can be reached', async ({ page }) => {
    await explore(page)
    await searchBox(page).fill('ka')
    await expect(results(page)).toHaveCount(20)
    const heights = await results(page).evaluateAll((all) => all.map((one) => one.getBoundingClientRect().height))
    const list = await page.locator('.search-results').evaluate((one) => ({
      client: one.clientHeight,
      scroll: one.scrollHeight,
    }))
    note(`phone, 20 results: smallest result ${Math.min(...heights)} px, list shows ${list.client} of ${list.scroll} px`)
    const last = results(page).last()
    const name = (await last.locator('.place-name').textContent())!
    await last.click()
    await expect(row(page, name)).toHaveAttribute('aria-current', 'true')
    note(`phone: picked the 20th result, ${name}, and its row is highlighted`)
  })
})

test.describe('on the smallest phone, 320 px wide', () => {
  test.use({ viewport: { width: 320, height: 568 } })

  test('the header fits', async ({ page }) => {
    await page.goto('/kilato/')
    await expect(page.locator('header input')).toBeVisible()
    const input = await box(page, 'header input')
    const width = await page.evaluate(() => document.documentElement.scrollWidth)
    note(`320 px: the box is ${Math.round(input.width)} px wide, and the page ${width} px`)
    expect(width).toBe(320)
  })
})

test('the keyboard reaches a result and picks it', async ({ page }) => {
  await explore(page)
  await searchBox(page).fill('kave')
  await expect(results(page)).toHaveCount(6)
  await page.keyboard.press('Tab')
  await expect(results(page).first()).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('.place[aria-current]')).toHaveCount(1)
  note('keyboard: Tab from the box goes to the first result, and Enter picks it')
})

test('a search.json with no places field shows the message and leaves the page alive', async ({ page }) => {
  await page.route(`**${searchFile}`, (route) => route.fulfill({ json: {} }))
  await explore(page)
  await searchBox(page).focus()
  await expect(page.getByText("Couldn't load places")).toBeVisible()
  await expect(page.locator('.place').first()).toBeVisible()
  note('a file with no places field: the message shows and the rows stay')
})

test.describe('with the location at 47.49791, 19.05439', () => {
  test.use({
    geolocation: { latitude: 47.49791, longitude: 19.05439, accuracy: 10 },
    permissions: ['geolocation'],
  })

  test('a whole visit keeps the query and the location to itself', async ({ page, context }) => {
    const seen: { url: string; body: string | null }[] = []
    context.on('request', (request) => seen.push({ url: request.url(), body: request.postData() }))
    await page.goto('/kilato/')
    await expect(page.locator('.location-dot')).toBeVisible()
    await searchBox(page).fill('kavezo')
    await expect(results(page)).not.toHaveCount(0)
    await results(page).first().click()
    await expect(page.locator('.place[aria-current]')).toHaveCount(1)
    await button(page, 'My location').click()
    await expect(page.locator('.location-dot')).toBeVisible()
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }))
    const leaks = seen.filter(({ url, body }) =>
      [url, body ?? ''].some((text) => text.includes('kavezo') || text.includes('47.497') || text.includes('19.054')),
    )
    note(`a visit with a search, a pick and My location: ${seen.length} requests, ${seen.filter(({ body }) => body).length} with a body, ${leaks.length} with the query or the location, and in storage: ${stored}`)
    expect(leaks).toEqual([])
    expect(stored).not.toContain('kavezo')
  })
})

test('how long a search takes in this process, over 29,969 places', () => {
  const words = ['Kávé', 'Múzeum', 'Étterem', 'Könyvtár', 'Bolt', 'Patika', 'Söröző', 'Fűszeres', 'Őrház', 'Bank']
  const places: SearchPlace[] = Array.from({ length: 29_969 }, (_, index) => ({
    id: `n${index}`,
    cat: 'food',
    lat: 47.35 + (index % 400) * 0.001,
    lon: 18.9 + (index % 500) * 0.001,
    name: `${words[index % 10]} ${index} ${words[(index * 7) % 10]}`,
    ...(index % 3 === 0 && { names: { hu: `Magyar ${words[index % 10]} ${index}`, en: `English ${index}` } }),
  }))
  const start = performance.now()
  const search = placeSearch(places)
  const built = performance.now() - start
  const times = ['ka', 'kav', 'kave', 'kavez', 'mu', 'zzzz'].map((query) => {
    const before = performance.now()
    const found = search(query, { lat: 47.5, lon: 19.05 })
    return `${query}: ${Math.round(performance.now() - before)} ms, ${found.length} found`
  })
  note(`node, this Pi: folding 29,969 places took ${Math.round(built)} ms · ${times.join(' · ')}`)
})
