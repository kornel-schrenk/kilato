import type { Page } from '@playwright/test'
import { cellKey } from '../src/core/cells'
import type { Place } from '../src/core/types'
import { expect, siteManifest, test } from './fixtures'
import { box, button, centre, expectNear, geography, mapCentre, pinPlace, zoomTo } from './map-helpers'

const deakTer = { lat: 47.4975, lon: 19.0545 }
const failure = "Couldn't load places"
const searchFile = '/kilato/data/search.json'

const cafe = (name: string, metresNorth: number, more: Partial<Place> = {}): Place => ({
  id: name,
  cat: 'food',
  kind: 'cafe',
  name,
  // 0.001° of latitude is 111.19 m.
  lat: deakTer.lat + (metresNorth / 111.19) * 0.001,
  lon: deakTer.lon,
  ...more,
})

/** Makes the site hold just these places, in place of the fixture's. */
async function serve(page: Page, places: Place[]) {
  const inCell = (key: string) => places.filter((place) => cellKey(place.lat, place.lon) === key)
  await page.route('**/kilato/data/manifest.json', (route) =>
    route.fulfill({
      json: { ...siteManifest, cells: [...new Set(places.map((place) => cellKey(place.lat, place.lon)))], wikiLangs: [] },
    }),
  )
  await page.route('**/kilato/data/cells/*.json', (route) => {
    const key = new URL(route.request().url()).pathname.split('/').pop()!.replace('.json', '')
    return route.fulfill({ json: { places: inCell(key) } })
  })
  await page.route(`**${searchFile}`, (route) => route.fulfill({ json: { places } }))
}

const dataRequests = (page: Page) => {
  const paths: string[] = []
  page.on('request', (request) => {
    const { pathname } = new URL(request.url())
    if (pathname.includes('/data/')) paths.push(pathname)
  })
  return paths
}

const searchBox = (page: Page) => page.locator('header').getByRole('searchbox', { name: 'Search' })
const results = (page: Page) => page.locator('.search-result')
const resultNames = (page: Page) => results(page).locator('.place-name').allTextContents()
const result = (page: Page, name: string) => results(page).filter({ has: page.getByText(name, { exact: true }) })
const row = (page: Page, name: string) => page.locator('.place', { has: page.getByText(name, { exact: true }) })

async function explore(page: Page) {
  await page.goto('/kilato/')
  await button(page, 'Explore the map').click()
  await expect(page.locator('.pin')).toBeVisible()
  await expect(page.locator('img.leaflet-tile-loaded').first()).toBeAttached()
}

const cellRequest = ({ lat, lon }: Place) => `/kilato/data/cells/${cellKey(lat, lon)}.json`

// 3 km north of Deák Ferenc tér, in a cell a point there doesn't load.
const far = cafe('Far Kávé', 3000)
const beside = cafe('Beside Far', 3100)
const here = cafe('Here', 100)

/** Searches for a place by its name and picks it. */
async function pick(page: Page, place: Place) {
  await searchBox(page).fill(place.name)
  await result(page, place.name).click()
}

/** Makes this file wait until the returned function is called. */
async function hold(page: Page, path: string) {
  let release = () => {}
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(`**${path}`, async (route) => {
    await released
    await route.fallback()
  })
  return release
}

const holdCell = (page: Page, place: Place) => hold(page, cellRequest(place))

test.describe('the search box', () => {
  test('sits in the header, and search.json loads only when it first gets focus', async ({ page }) => {
    const paths = dataRequests(page)
    await explore(page)
    await expect(page.locator('.place').first()).toBeVisible()
    await expect(searchBox(page)).toBeVisible()
    expect(paths).not.toContain(searchFile)

    await searchBox(page).focus()

    await expect.poll(() => paths.filter((path) => path === searchFile)).toHaveLength(1)
  })

  test('loads nothing of search.json at the intro until it gets focus', async ({ page }) => {
    const paths = dataRequests(page)
    await page.goto('/kilato/')
    await expect(button(page, 'Explore the map')).toBeVisible()
    await expect.poll(() => paths).toEqual(['/kilato/data/manifest.json'])

    await searchBox(page).focus()

    await expect.poll(() => paths).toEqual(['/kilato/data/manifest.json', searchFile])
  })

  test('asks for search.json once, however often it gets focus', async ({ page }) => {
    const paths = dataRequests(page)
    await explore(page)
    await searchBox(page).focus()
    await expect.poll(() => paths).toContain(searchFile)

    await page.locator('h1').click()
    await searchBox(page).focus()
    await page.locator('h1').click()
    await searchBox(page).fill('kave')

    await expect(results(page)).not.toHaveCount(0)
    expect(paths.filter((path) => path === searchFile)).toHaveLength(1)
  })

  test('asks for search.json once when it gets focus again while the file is on its way', async ({ page }) => {
    await serve(page, [cafe('Kávé', 100)])
    const release = await hold(page, searchFile)
    const paths = dataRequests(page)
    await explore(page)
    await searchBox(page).focus()
    await expect.poll(() => paths).toContain(searchFile)

    await page.locator('h1').click()
    await searchBox(page).focus()
    await page.locator('h1').click()
    await searchBox(page).fill('kave')
    release()

    await expect.poll(() => resultNames(page)).toEqual(['Kávé'])
    expect(paths.filter((path) => path === searchFile)).toHaveLength(1)
  })

  test.describe('on a Hungarian phone', () => {
    test.use({ locale: 'hu-HU' })

    test('is called Keresés', async ({ page }) => {
      await page.goto('/kilato/')
      await expect(page.locator('header').getByRole('searchbox', { name: 'Keresés' })).toBeVisible()
    })

    test('shows the Hungarian name under the name of a result', async ({ page }) => {
      await serve(page, [cafe('Parliament', 100, { names: { hu: 'Országház', en: 'Parliament' } })])
      await page.goto('/kilato/')

      await page.locator('header').getByRole('searchbox', { name: 'Keresés' }).fill('orszag')

      await expect(results(page).locator('.place-other')).toHaveText('Országház')
    })
  })

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 375, height: 667 } })

    test('fits, and its results are over the map, where a tap reaches them', async ({ page }) => {
      await serve(page, [far, here])
      await explore(page)
      const input = await box(page, 'header input')
      expect(input.width).toBeGreaterThan(100)

      await searchBox(page).fill('kave')

      await expect(results(page)).toHaveCount(1)
      const list = await box(page, '.search-results')
      expect(list.x).toBe(0)
      expect(list.width).toBe(375)
      expect(list.y).toBeLessThan((await box(page, '.map')).y + 10)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375)

      await results(page).click()

      await expect(row(page, far.name)).toHaveAttribute('aria-current', 'true')
      await expect(row(page, far.name)).toBeInViewport()
    })

    test('has 16 px text, below which Safari zooms the page when the box gets focus', async ({ page }) => {
      await page.goto('/kilato/')

      await expect(searchBox(page)).toHaveCSS('font-size', '16px')
    })

    test('wraps a long name in a result, so the results do not scroll sideways', async ({ page }) => {
      const long = cafe('Kávé'.repeat(60), 100)
      await serve(page, [long])
      await explore(page)

      await searchBox(page).fill('kave')

      await expect(results(page)).toHaveCount(1)
      const widths = await page
        .locator('.search-results')
        .evaluate((list) => ({ client: list.clientWidth, scroll: list.scrollWidth }))
      expect(widths.scroll).toBe(widths.client)
    })
  })

  test.describe('when search.json fails', () => {
    const failing = async (page: Page) => {
      let broken = true
      await page.route(`**${searchFile}`, (route) => (broken ? route.abort() : route.fallback()))
      return () => {
        broken = false
      }
    }

    test('shows the message, and Retry loads it', async ({ page }) => {
      const repair = await failing(page)
      await explore(page)
      await searchBox(page).focus()
      await expect(page.getByText(failure)).toBeVisible()
      repair()

      await button(page, 'Retry').click()

      await expect(page.getByText(failure)).toHaveCount(0)
      await searchBox(page).fill('kave')
      await expect(results(page)).not.toHaveCount(0)
    })

    test('the next focus asks again', async ({ page }) => {
      const repair = await failing(page)
      await explore(page)
      await searchBox(page).focus()
      await expect(page.getByText(failure)).toBeVisible()
      await page.locator('h1').click()
      repair()

      await searchBox(page).focus()

      await expect(page.getByText(failure)).toHaveCount(0)
      await searchBox(page).fill('kave')
      await expect(results(page)).not.toHaveCount(0)
    })

    test('a 404 counts as failing too', async ({ page }) => {
      await page.route(`**${searchFile}`, (route) => route.fulfill({ status: 404 }))
      await explore(page)

      await searchBox(page).focus()

      await expect(page.getByText(failure)).toBeVisible()
    })

    test('a 404 with valid JSON in it counts as failing too', async ({ page }) => {
      await page.route(`**${searchFile}`, (route) =>
        route.fulfill({ status: 404, json: { places: [cafe('Kávé', 100)] } }),
      )
      await explore(page)

      await searchBox(page).fill('kave')

      await expect(page.getByText(failure)).toBeVisible()
      await expect(results(page)).toHaveCount(0)
    })

    test('a page of HTML in its place counts as failing too, as a Wi-Fi login page would send', async ({ page }) => {
      await page.route(`**${searchFile}`, (route) =>
        route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Log in</title>' }),
      )
      await explore(page)

      await searchBox(page).focus()

      await expect(page.getByText(failure)).toBeVisible()
    })
  })
})

test.describe('the results', () => {
  test('start at 2 characters', async ({ page }) => {
    await serve(page, [cafe('Kávéház', 100)])
    await explore(page)

    await searchBox(page).fill('ká')
    await expect.poll(() => resultNames(page)).toEqual(['Kávéház'])

    await searchBox(page).fill('k')
    await expect(results(page)).toHaveCount(0)
  })

  test('ignore case and accents', async ({ page }) => {
    await serve(page, [cafe('Kávé', 100), cafe('Tea', 200)])
    await explore(page)

    await searchBox(page).fill('KAVE')

    await expect.poll(() => resultNames(page)).toEqual(['Kávé'])
  })

  test('look in names.hu and names.en, and show the name in the UI language under the name', async ({ page }) => {
    await serve(page, [
      cafe('Parliament', 100, { names: { hu: 'Országház' } }),
      cafe('Lánchíd', 200, { names: { en: 'Chain Bridge' } }),
    ])
    await explore(page)

    await searchBox(page).fill('orszag')
    await expect.poll(() => resultNames(page)).toEqual(['Parliament'])

    await searchBox(page).fill('chain')
    await expect.poll(() => resultNames(page)).toEqual(['Lánchíd'])
    await expect(results(page).locator('.place-other')).toHaveText('Chain Bridge')
  })

  test('put names beginning with the query first, each group nearest first', async ({ page }) => {
    await serve(page, [
      cafe('A Kávé 200', 200),
      cafe('Kávé 900', 900),
      cafe('A Kávé 100', 100),
      cafe('Kávé 500', 500),
    ])
    await explore(page)

    await searchBox(page).fill('kave')

    await expect.poll(() => resultNames(page)).toEqual(['Kávé 500', 'Kávé 900', 'A Kávé 100', 'A Kávé 200'])
  })

  test('stop at 20', async ({ page }) => {
    await serve(page, Array.from({ length: 25 }, (_, index) => cafe(`Kávé ${index}`, index * 10)))
    await explore(page)

    await searchBox(page).fill('kave')

    await expect(results(page)).toHaveCount(20)
    await expect(results(page).first()).toContainText('Kávé 0')
    await expect(results(page).last()).toContainText('Kávé 19')
  })

  test('have a line under each, as the rows do', async ({ page }) => {
    await serve(page, [cafe('Kávé 100', 100), cafe('Kávé 200', 200)])
    await explore(page)
    await expect(page.locator('.places li').first()).toHaveCSS('border-bottom', '1px solid rgb(221, 221, 221)')

    await searchBox(page).fill('kave')

    await expect(page.locator('.search-results li')).toHaveCount(2)
    await expect(page.locator('.search-results li').first()).toHaveCSS('border-bottom', '1px solid rgb(221, 221, 221)')
  })

  test('come from the fixture, in the order worked out apart from the page', async ({ page }) => {
    await explore(page)

    await searchBox(page).fill('kave')

    await expect
      .poll(() => resultNames(page))
      .toEqual([
        'Kávézó Pékség',
        'Minta Kávézó',
        'Centrál kávéház',
        'Múzeumkávézó',
        'Balaton kávéház',
        'Abbázia kávéház',
      ])
  })

  test('start from Deák Ferenc tér at the intro, with no point yet', async ({ page }) => {
    // The south place tells the fallback from a point anywhere south of all three, which would put it first.
    await serve(page, [cafe('Kávé 900', 900), cafe('Kávé south', -300), cafe('Kávé 100', 100)])
    await page.goto('/kilato/')
    await expect(button(page, 'Explore the map')).toBeVisible()

    await searchBox(page).fill('kave')

    await expect.poll(() => resultNames(page)).toEqual(['Kávé 100', 'Kávé south', 'Kávé 900'])
  })

  test('start from where the point has moved to', async ({ page }) => {
    await serve(page, [cafe('Kávé north', 300), cafe('Kávé south', -100)])
    await explore(page)
    await searchBox(page).fill('kave')
    await expect.poll(() => resultNames(page)).toEqual(['Kávé south', 'Kávé north'])
    await searchBox(page).fill('')
    const { x, y } = centre(await box(page, '.leaflet-container'))

    // 100 px north at zoom 15 is 323 m, right beside the north place.
    await page.mouse.click(x, y - 100)

    await expect.poll(async () => (await pinPlace(page)).lat).toBeGreaterThan(deakTer.lat + 0.001)
    await searchBox(page).fill('kave')
    await expect.poll(() => resultNames(page)).toEqual(['Kávé north', 'Kávé south'])
  })

  test('reorder when the point moves with the query still in the box', async ({ page }) => {
    await serve(page, [cafe('Kávé north', 300), cafe('Kávé south', -100)])
    await explore(page)
    await searchBox(page).fill('kave')
    await expect.poll(() => resultNames(page)).toEqual(['Kávé south', 'Kávé north'])
    const { x, y } = centre(await box(page, '.leaflet-container'))

    // 100 px north at zoom 15 is 323 m, right beside the north place. At this width the results sit over the list.
    await page.mouse.click(x, y - 100)

    await expect.poll(() => resultNames(page)).toEqual(['Kávé north', 'Kávé south'])
  })

  test('show up for a query typed while search.json was on its way', async ({ page }) => {
    await serve(page, [cafe('Kávé', 100)])
    const release = await hold(page, searchFile)
    await explore(page)
    await searchBox(page).fill('kave')
    await expect(results(page)).toHaveCount(0)

    release()

    await expect.poll(() => resultNames(page)).toEqual(['Kávé'])
  })

  test('show a name with HTML in it as plain text', async ({ page }) => {
    const name = '<b>Bold</b> & <img src=x> kave'
    await serve(page, [cafe(name, 100, { names: { en: '<i>Second</i>' } })])
    await explore(page)

    await searchBox(page).fill('kave')

    await expect(results(page).locator('.place-name')).toHaveText(name)
    await expect(results(page).locator('.place-other')).toHaveText('<i>Second</i>')
    await expect(results(page).locator('b, i, img')).toHaveCount(0)
  })
})

test.describe('picking a result', () => {
  test('starts exploring with the point at the place, loads its cell and highlights its row', async ({ page }) => {
    await serve(page, [here, far, beside])
    const paths = dataRequests(page)
    await explore(page)
    await expect(row(page, here.name)).toBeVisible()
    expect(paths).not.toContain(cellRequest(far))

    await pick(page, far)

    await expect(row(page, far.name)).toHaveAttribute('aria-current', 'true')
    await expect(row(page, beside.name)).not.toHaveAttribute('aria-current')
    await expect(row(page, here.name)).toHaveCount(0)
    expect(paths).toContain(cellRequest(far))
    await expectNear(() => pinPlace(page), far, 2)
    await expectNear(() => mapCentre(page), far, 3)
    await expect(button(page, 'My location')).toBeVisible()
  })

  test('highlights the row of a place from the real files, whose search.json and cell name it alike', async ({ page }) => {
    await explore(page)
    await searchBox(page).fill('kave')

    await result(page, 'Abbázia kávéház').click()

    await expect(row(page, 'Abbázia kávéház')).toHaveAttribute('aria-current', 'true')
    await expect(page.locator('[aria-current]')).toHaveCount(1)
  })

  test('closes the results, empties the box and takes the focus out of it', async ({ page }) => {
    await serve(page, [here, far])
    await explore(page)

    await pick(page, far)

    await expect(results(page)).toHaveCount(0)
    await expect(searchBox(page)).toHaveValue('')
    await expect(searchBox(page)).not.toBeFocused()
  })

  test('takes the focus out of the box when the tap itself leaves it there, as Safari on a phone does', async ({ page }) => {
    await serve(page, [here, far])
    await explore(page)
    await searchBox(page).fill(far.name)
    await expect(result(page, far.name)).toBeVisible()
    await expect(searchBox(page)).toBeFocused()

    // A mouse click would move the focus to the button by itself, so the test above can't tell.
    await result(page, far.name).dispatchEvent('click')

    await expect(row(page, far.name)).toHaveAttribute('aria-current', 'true')
    await expect(searchBox(page)).not.toBeFocused()
  })

  test('keeps the zoom the user chose', async ({ page }) => {
    await serve(page, [here, far])
    await explore(page)
    await zoomTo(page, 16)

    await pick(page, far)

    await expectNear(() => mapCentre(page), far, 3)
    expect((await geography(page)).zoom).toBe(16)
  })

  test('moves the highlight off the row tapped before, with its popup', async ({ page }) => {
    const near = cafe('Near', 150)
    await serve(page, [here, near])
    await explore(page)
    await row(page, here.name).click()
    await expect(page.locator('.leaflet-popup-content')).toHaveText(here.name)

    await pick(page, near)

    await expect(row(page, near.name)).toHaveAttribute('aria-current', 'true')
    await expect(row(page, here.name)).not.toHaveAttribute('aria-current')
    await expect(page.locator('.leaflet-popup-content')).toHaveCount(0)
  })

  test('works from the intro', async ({ page }) => {
    await serve(page, [here, far])
    await page.goto('/kilato/')
    await expect(button(page, 'Explore the map')).toBeVisible()

    await pick(page, far)

    await expect(row(page, far.name)).toHaveAttribute('aria-current', 'true')
    await expect(button(page, 'Explore the map')).toHaveCount(0)
    await expect(page.getByText('Tap or drag the map, or search.')).toBeVisible()
    await expectNear(() => pinPlace(page), far, 2)
  })

  test('picks the same place again after the row lost its highlight', async ({ page }) => {
    await serve(page, [here, far])
    await explore(page)
    await pick(page, far)
    await expect(row(page, far.name)).toHaveAttribute('aria-current', 'true')
    await expectNear(() => mapCentre(page), far, 3)
    const { x, y } = centre(await box(page, '.leaflet-container'))

    // 340 px south at zoom 15 is 1,100 m, which leaves the place past the 1 km.
    await page.mouse.click(x, y + 340)
    await expect(row(page, far.name)).toHaveCount(0)

    await pick(page, far)

    await expect(row(page, far.name)).toHaveAttribute('aria-current', 'true')
  })

  test('shows and scrolls to its row, even past the rows showing among places at one spot', async ({ page }) => {
    const crowd = Array.from({ length: 150 }, (_, index) => cafe(`Stall ${index}`, 3000))
    await serve(page, [here, ...crowd])
    await explore(page)

    await pick(page, crowd[149])

    await expect(row(page, 'Stall 149')).toHaveAttribute('aria-current', 'true')
    await expect(row(page, 'Stall 149')).toBeInViewport()
    await expect(page.locator('.place')).toHaveCount(150)
  })

  test('brings its article link into view with its row', async ({ page }) => {
    const crowd = Array.from({ length: 100 }, (_, index) => cafe(`Stall ${index}`, 3000, { wiki: { hu: `Stall ${index}` } }))
    await serve(page, [here, ...crowd])
    await explore(page)

    await pick(page, crowd[99])

    await expect(row(page, 'Stall 99')).toHaveAttribute('aria-current', 'true')
    await expect(page.locator('li', { has: row(page, 'Stall 99') }).getByRole('link')).toBeInViewport()
  })

  test('counts the rows showing in Most relevant, when that is the order', async ({ page }) => {
    // The nearest of all once the point is on it, and the last in Most relevant, behind the cafés.
    const shop = cafe('The Shop', 3000, { cat: 'shops', kind: 'supermarket' })
    const crowd = Array.from({ length: 120 }, (_, index) => cafe(`Stall ${index}`, 3000))
    await serve(page, [here, shop, ...crowd])
    await explore(page)
    await button(page, 'Most relevant').click()
    await expect(button(page, 'Most relevant')).toHaveAttribute('aria-pressed', 'true')

    await pick(page, shop)

    await expect(page.locator('.place')).toHaveCount(121)
    await expect(page.locator('.place-name').last()).toHaveText(shop.name)
    await expect(row(page, shop.name)).toHaveAttribute('aria-current', 'true')
    await expect(row(page, shop.name)).toBeInViewport()
  })

  test('leaves an off chip off, and highlights the row if the chip comes back on', async ({ page }) => {
    const shop = cafe('Beside Shop', 3100, { cat: 'shops', kind: 'supermarket' })
    await serve(page, [here, far, shop])
    await explore(page)
    await button(page, 'Food & drink').click()
    await expect(button(page, 'Food & drink')).toHaveAttribute('aria-pressed', 'false')

    await pick(page, far)

    await expect(row(page, shop.name)).toBeVisible()
    await expectNear(() => pinPlace(page), far, 2)
    await expect(button(page, 'Food & drink')).toHaveAttribute('aria-pressed', 'false')
    await expect(row(page, far.name)).toHaveCount(0)
    await expect(page.locator('[aria-current]')).toHaveCount(0)

    await button(page, 'Food & drink').click()

    await expect(row(page, far.name)).toHaveAttribute('aria-current', 'true')
  })

  test('highlights the row only once the slow cell has arrived', async ({ page }) => {
    await serve(page, [here, far])
    const release = await holdCell(page, far)
    await explore(page)

    await pick(page, far)

    await expectNear(() => pinPlace(page), far, 2)
    await expect(page.locator('.place')).toHaveCount(0)
    release()
    await expect(row(page, far.name)).toHaveAttribute('aria-current', 'true')
  })

  test('leaves the row alone when the point moves on before the cell arrives', async ({ page }) => {
    await serve(page, [here, far])
    const release = await holdCell(page, far)
    await explore(page)
    await pick(page, far)
    await expectNear(() => mapCentre(page), far, 3)
    const { x, y } = centre(await box(page, '.leaflet-container'))

    // 100 px at zoom 15 is 323 m, so the place stays in the list.
    await page.mouse.click(x, y + 100)
    await expect.poll(async () => (await pinPlace(page)).lat).toBeLessThan(far.lat - 0.001)
    release()

    await expect(row(page, far.name)).toBeVisible()
    await expect(page.locator('[aria-current]')).toHaveCount(0)
  })

  test('highlights only the second of two picks made while their cells were on the way', async ({ page }) => {
    // 700 m from `far`, so `far` stays in the list, and in the next cell north.
    const second = cafe('Second Far', 3700)
    await serve(page, [here, far, second])
    const releaseFar = await holdCell(page, far)
    const releaseSecond = await holdCell(page, second)
    await explore(page)
    await pick(page, far)
    await expectNear(() => pinPlace(page), far, 2)
    await pick(page, second)
    await expectNear(() => pinPlace(page), second, 2)

    releaseFar()
    await expect(row(page, far.name)).toBeVisible()
    await expect(page.locator('[aria-current]')).toHaveCount(0)
    releaseSecond()

    await expect(row(page, second.name)).toHaveAttribute('aria-current', 'true')
    await expect(row(page, far.name)).not.toHaveAttribute('aria-current')
  })

  test('highlights the row after a failed cell and a Retry', async ({ page }) => {
    await serve(page, [here, far])
    let broken = true
    await page.route(`**${cellRequest(far)}`, (route) => (broken ? route.abort() : route.fallback()))
    await explore(page)

    await pick(page, far)

    await expect(page.getByText(failure)).toBeVisible()
    broken = false
    await button(page, 'Retry').click()
    await expect(row(page, far.name)).toHaveAttribute('aria-current', 'true')
  })

  test.describe('while following', () => {
    test.use({
      geolocation: { latitude: deakTer.lat, longitude: deakTer.lon, accuracy: 10 },
      permissions: ['geolocation'],
    })

    test('stops following, and My location goes back', async ({ page }) => {
      await serve(page, [here, far])
      await page.goto('/kilato/')
      await expect(page.locator('.location-dot')).toBeVisible()
      await expect(row(page, here.name)).toBeVisible()

      await pick(page, far)

      await expect(row(page, far.name)).toHaveAttribute('aria-current', 'true')
      await expect(page.locator('.location-dot')).toHaveCount(0)
      await expectNear(() => pinPlace(page), far, 2)

      await button(page, 'My location').click()

      await expect(page.locator('.location-dot')).toBeVisible()
      await expect(row(page, here.name)).toBeVisible()
    })
  })
})

test.describe('with the location at 47.49791, 19.05439', () => {
  test.use({
    geolocation: { latitude: 47.49791, longitude: 19.05439, accuracy: 10 },
    permissions: ['geolocation'],
  })

  test('the query and the location stay out of every request', async ({ page, context }) => {
    const urls: string[] = []
    context.on('request', (request) => urls.push(request.url()))
    await page.goto('/kilato/')
    await expect(page.locator('.location-dot')).toBeVisible()

    await searchBox(page).fill('kavezo')
    await expect(results(page)).not.toHaveCount(0)

    const search = urls.filter((url) => url.includes('search.json'))
    expect(search).toHaveLength(1)
    expect(new URL(search[0]).search).toBe('')
    for (const url of urls) {
      expect(url).not.toContain('kavezo')
      expect(url).not.toContain('47.497')
      expect(url).not.toContain('19.054')
    }
  })
})
