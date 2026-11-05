import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page, Request } from '@playwright/test'
import { cellKey } from '../src/core/cells'
import { distanceMetres, nearby, type LatLon } from '../src/core/geo'
import type { CategoryId, CellFile, Place } from '../src/core/types'
import { categoryColors } from '../src/ui/categoryColors'
import { expect, test } from './fixtures'
import { box, button, centre, expectNear, geography, mapCentre, pinPlace, zoomTo } from './map-helpers'

const deakTer = { lat: 47.4975, lon: 19.0545 }
const failure = "Couldn't load places"

// 0.001° of latitude is 111.19 m, and of longitude 75.13 m at this latitude.
const atOffset = (metresNorth: number, metresEast = 0): LatLon => ({
  lat: deakTer.lat + (metresNorth / 111.19) * 0.001,
  lon: deakTer.lon + (metresEast / 75.13) * 0.001,
})

const cafe = (id: string, metresNorth: number, more: Partial<Place> = {}): Place => ({
  id,
  cat: 'food',
  kind: 'cafe',
  name: id,
  ...atOffset(metresNorth),
  ...more,
})

const keyOfCellRequest = (url: string) => new URL(url).pathname.split('/').pop()!.replace('.json', '')

/** Makes the site hold just these places, in place of the fixture's. */
async function serve(page: Page, places: Place[]) {
  const cells = new Map<string, Place[]>()
  for (const place of places) {
    const key = cellKey(place.lat, place.lon)
    cells.set(key, [...(cells.get(key) ?? []), place])
  }
  await page.route('**/kilato/data/manifest.json', (route) =>
    route.fulfill({ json: { cells: [...cells.keys()], wikiLangs: [] } }),
  )
  await page.route('**/kilato/data/cells/*.json', (route) =>
    route.fulfill({ json: { places: cells.get(keyOfCellRequest(route.request().url())) ?? [] } }),
  )
}

/** Makes these requests fail until the returned function is called. A move of the point tries them again too. */
async function breakRequests(page: Page, url: string) {
  let broken = true
  await page.route(url, (route) => (broken ? route.abort() : route.fallback()))
  return () => {
    broken = false
  }
}

const dataRequests = (page: Page) => {
  const paths: string[] = []
  page.on('request', (request) => {
    const { pathname } = new URL(request.url())
    if (pathname.includes('/data/')) paths.push(pathname)
  })
  return paths
}

const rowNames = (page: Page) => page.locator('.place-name').allTextContents()
const row = (page: Page, name: string) => page.locator('.place', { has: page.getByText(name, { exact: true }) })
const popup = (page: Page) => page.locator('.leaflet-popup-content')
const firstMeta = (page: Page) => page.locator('.place-meta').first()

/** Opens the page and starts exploring at Deák Ferenc tér. */
async function explore(page: Page, name = 'Explore the map') {
  await page.goto('/kilato/')
  await button(page, name).click()
  await expect(page.locator('.pin')).toBeVisible()
  await expect(page.locator('img.leaflet-tile-loaded').first()).toBeAttached()
  await expectNear(() => mapCentre(page), deakTer)
}

/**
 * The colours on the markers' canvas at these points on the screen, as #rrggbb, or null where
 * nothing is drawn. Markers leave nothing in the page to ask but their pixels.
 */
const pixels = (page: Page, points: { x: number; y: number }[]) =>
  page.evaluate((targets) => {
    const canvas = document.querySelector<HTMLCanvasElement>('.leaflet-places-pane canvas')
    if (!canvas) return targets.map(() => null)
    const area = canvas.getBoundingClientRect()
    const scale = canvas.width / area.width
    const context = canvas.getContext('2d')!
    return targets.map(({ x, y }) => {
      const [r, g, b, a] = context.getImageData((x - area.x) * scale, (y - area.y) * scale, 1, 1).data
      return a === 0 ? null : `#${[r, g, b].map((part) => part.toString(16).padStart(2, '0')).join('')}`
    })
  }, points)

async function markerColor(page: Page, place: LatLon) {
  const [color] = await pixels(page, [(await geography(page)).screen(place)])
  return color
}

// Past a plain marker's edge, 5.5 px from its centre, and on the middle of a highlighted marker's ring.
const ringColor = async (page: Page, place: LatLon) => {
  const { x, y } = (await geography(page)).screen(place)
  const [color] = await pixels(page, [{ x, y: y - 8 }])
  return color
}

async function tapMarker(page: Page, place: LatLon) {
  await expect.poll(() => markerColor(page, place)).not.toBeNull()
  const { x, y } = (await geography(page)).screen(place)
  await page.mouse.click(x, y)
}

const fixturePlaces = (): Place[] => {
  const folder = join(import.meta.dirname, '../test/fixtures/site-data/cells')
  return readdirSync(folder).flatMap(
    (file) => (JSON.parse(readFileSync(join(folder, file), 'utf8')) as CellFile).places,
  )
}

/** Places 40 m apart, or 12 px at zoom 15: past a marker's width, so a tap can't hit a neighbour. */
const grid = (count: number, spacing = 40) =>
  Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / 20)
    const col = index % 20
    return cafe(`Place ${index}`, 0, atOffset((row - 6) * spacing, (col - 10) * spacing))
  })

test.describe('a row', () => {
  const zsolnay = cafe('Zsolnay Kávéház', 120, { names: { hu: 'Zsolnay', en: 'Zsolnay Coffee House' } })

  test('shows the name, the name in the UI language, and the kind and distance', async ({ page }) => {
    await serve(page, [zsolnay])
    await explore(page)

    const shown = row(page, 'Zsolnay Kávéház')
    await expect(shown.locator('.place-name')).toHaveText('Zsolnay Kávéház')
    await expect(shown.locator('.place-other')).toHaveText('Zsolnay Coffee House')
    await expect(shown.locator('.place-meta')).toHaveText('Café · 120 m')
  })

  test.describe('on a Hungarian phone', () => {
    test.use({ locale: 'hu-HU' })

    test('is in Hungarian, and switching the language changes it', async ({ page }) => {
      await serve(page, [zsolnay])
      await explore(page, 'A térkép felfedezése')

      await expect(page.locator('.place-other')).toHaveText('Zsolnay')
      await expect(page.locator('.place-meta')).toHaveText('Kávézó · 120 m')

      await button(page, 'EN').click()

      await expect(page.locator('.place-other')).toHaveText('Zsolnay Coffee House')
      await expect(page.locator('.place-meta')).toHaveText('Café · 120 m')
    })
  })

  test('has no second line when the place has no name in the UI language', async ({ page }) => {
    await serve(page, [cafe('Csak magyarul', 120, { names: { hu: 'Magyarul' } })])
    await explore(page)
    await expect(page.locator('.place-name')).toHaveText('Csak magyarul')
    await expect(page.locator('.place-other')).toHaveCount(0)
  })

  test('shows a name with HTML in it as plain text, in the row and in the popup', async ({ page }) => {
    const name = '<b>Bold</b> & <img src=x>'
    await serve(page, [cafe(name, 120)])
    await explore(page)

    await page.locator('.place').click()

    await expect(page.locator('.place-name')).toHaveText(name)
    await expect(popup(page)).toHaveText(name)
    await expect(popup(page).locator('b, img')).toHaveCount(0)
  })

  test('wraps a long name, so a phone does not scroll sideways', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await serve(page, [cafe('Hosszú'.repeat(40), 120)])
    await explore(page)
    await expect(page.locator('.place')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375)
  })
})

test.describe('the list', () => {
  test('holds the places within 1,000 m of the point, nearest first', async ({ page }) => {
    await serve(page, [
      cafe('At 700 m', 700),
      cafe('At 1,010 m', 1010),
      cafe('At 990 m', 990),
      cafe('At 30 m', 30),
      cafe('At 150 m east', 0, atOffset(0, 150)),
    ])
    await explore(page)

    await expect.poll(() => rowNames(page)).toEqual(['At 30 m', 'At 150 m east', 'At 700 m', 'At 990 m'])
  })

  test('shows the fixture around Deák Ferenc tér, and adds 100 rows with each Show more', async ({ page }) => {
    await explore(page)

    // The fixture's nearest place, 16.5 m from Deák Ferenc tér, worked out apart from the page.
    await expect(page.locator('.place').first()).toContainText('Deák Ferenc tér metróállomás')
    await expect(page.locator('.place').first()).toContainText('Deák Ferenc tér metro station')
    await expect(firstMeta(page)).toHaveText('Wikipedia article · 20 m')

    // 308 of the fixture's 311 places are within 1 km.
    await expect(page.locator('.place')).toHaveCount(100)
    await button(page, 'Show more').click()
    await expect(page.locator('.place')).toHaveCount(200)
    await button(page, 'Show more').click()
    await expect(page.locator('.place')).toHaveCount(300)
    await button(page, 'Show more').click()
    await expect(page.locator('.place')).toHaveCount(308)
    await expect(button(page, 'Show more')).toHaveCount(0)
  })

  test('has no Show more for 100 rows or fewer', async ({ page }) => {
    await serve(page, grid(100))
    await explore(page)
    await expect(page.locator('.place')).toHaveCount(100)
    await expect(button(page, 'Show more')).toHaveCount(0)
  })

  test('follows the point when a tap moves it', async ({ page }) => {
    await serve(page, [cafe('Near', 100), cafe('Far', 900)])
    await explore(page)
    await expect.poll(() => rowNames(page)).toEqual(['Near', 'Far'])
    const { x, y } = (await geography(page)).screen(atOffset(800))

    await page.mouse.click(x + 30, y)

    await expect.poll(() => rowNames(page)).toEqual(['Far', 'Near'])
  })

  test.describe('with the permission granted', () => {
    test.use({
      geolocation: { latitude: deakTer.lat, longitude: deakTer.lon, accuracy: 10 },
      permissions: ['geolocation'],
    })

    test('follows a walk', async ({ page, context }) => {
      await serve(page, [cafe('Corner', 120)])
      await page.goto('/kilato/')
      await expect(firstMeta(page)).toHaveText('Café · 120 m')

      const { lat, lon } = atOffset(100)
      await context.setGeolocation({ latitude: lat, longitude: lon, accuracy: 10 })

      await expect(firstMeta(page)).toHaveText('Café · 20 m')
    })
  })
})

test.describe('the Wikipedia link', () => {
  // In the fixture, this place has a Hungarian, an English and a German article.
  const museum = 'Földalatti Vasúti Múzeum'
  const german = 'https://de.wikipedia.org/wiki/U-Bahn-Museum_Budapest'
  const hungarian = 'https://hu.wikipedia.org/wiki/F%C3%B6ldalatti_Vas%C3%BAti_M%C3%BAzeum'
  const english = 'https://en.wikipedia.org/wiki/Underground_Railway_Museum_(Budapest)'
  // And this one has only a Hungarian article.
  const busStation = 'Erzsébet tér autóbusz-pályaudvar'

  const articleLink = (page: Page, name: string) => page.locator('li', { has: row(page, name) }).getByRole('link')
  const titleFiles = (paths: string[]) => paths.filter((path) => path.includes('/wiki/'))

  async function expectLink(page: Page, name: string, text: string, href: string) {
    await expect(articleLink(page, name)).toHaveText(text)
    await expect(articleLink(page, name)).toHaveAttribute('href', href)
  }

  test.describe('with the locale de-AT', () => {
    test.use({ locale: 'de-AT' })

    test('goes to the German article in a new tab, whatever the UI language', async ({ page }) => {
      await explore(page)

      await expectLink(page, museum, 'Wikipedia · DE', german)
      await expect(articleLink(page, museum)).toHaveAttribute('target', '_blank')

      await button(page, 'HU').click()

      await expect(page.locator('html')).toHaveAttribute('lang', 'hu')
      await expectLink(page, museum, 'Wikipedia · DE', german)
    })

    test('fetches wiki/de.json once', async ({ page }) => {
      const paths = dataRequests(page)
      await explore(page)

      await expectLink(page, museum, 'Wikipedia · DE', german)
      expect(titleFiles(paths)).toEqual(['/kilato/data/wiki/de.json'])
    })

    test('goes to the Hungarian article of a place with no German one', async ({ page }) => {
      await explore(page)
      // Every link is Hungarian until the titles arrive, so this waits for them.
      await expectLink(page, museum, 'Wikipedia · DE', german)
      await expect(articleLink(page, busStation)).toHaveText('Wikipedia · HU')
    })

    test('stays German when the page opens again in the saved UI language', async ({ page }) => {
      await page.goto('/kilato/')
      await button(page, 'HU').click()
      await expect(page.locator('html')).toHaveAttribute('lang', 'hu')

      await explore(page, 'A térkép felfedezése')

      await expectLink(page, museum, 'Wikipedia · DE', german)
    })
  })

  test.describe('with the locale fr-FR, which the manifest does not list', () => {
    test.use({ locale: 'fr-FR' })

    test('fetches no wiki/fr.json, and goes to the Hungarian article', async ({ page }) => {
      const paths = dataRequests(page)
      await explore(page)

      await expectLink(page, museum, 'Wikipedia · HU', hungarian)
      expect(titleFiles(paths)).toEqual([])
    })
  })

  test.describe('with the locale hu-HU', () => {
    test.use({ locale: 'hu-HU' })

    test('goes to the Hungarian article, and fetches no titles', async ({ page }) => {
      const paths = dataRequests(page)
      await explore(page, 'A térkép felfedezése')

      await expectLink(page, museum, 'Wikipedia · HU', hungarian)
      expect(titleFiles(paths)).toEqual([])
    })
  })

  test('goes to the English article on an English phone, and fetches no titles', async ({ page }) => {
    const paths = dataRequests(page)
    await explore(page)

    await expectLink(page, museum, 'Wikipedia · EN', english)
    expect(titleFiles(paths)).toEqual([])
  })

  test('is not there for a place with no article', async ({ page }) => {
    await serve(page, [cafe('No article', 120), cafe('Has one', 240, { wiki: { hu: 'Cikk' } })])
    await explore(page)

    await expect(articleLink(page, 'Has one')).toBeVisible()
    await expect(articleLink(page, 'No article')).toHaveCount(0)
  })

  test('opens the article in a new tab, and leaves the row untapped', async ({ page, context }) => {
    await serve(page, [cafe('Has one', 240, { wiki: { hu: 'Cikk' } })])
    await explore(page)
    await context.route('https://hu.wikipedia.org/**', (route) => route.fulfill({ body: '' }))
    const newTab = context.waitForEvent('page')

    await articleLink(page, 'Has one').click()

    expect((await newTab).url()).toBe('https://hu.wikipedia.org/wiki/Cikk')
    await expect(page.locator('[aria-current]')).toHaveCount(0)
  })

  test('sends Wikipedia no Referer when the article opens', async ({ page, context }) => {
    await serve(page, [cafe('Has one', 240, { wiki: { hu: 'Cikk' } })])
    await explore(page)
    let referer: string | undefined = 'the article was not asked for'
    await context.route('https://hu.wikipedia.org/**', (route) => {
      referer = route.request().headers().referer
      return route.fulfill({ body: '' })
    })
    const newTab = context.waitForEvent('page')

    await articleLink(page, 'Has one').click()
    await (await newTab).waitForLoadState()

    expect(referer).toBeUndefined()
  })

  test('comes into view with its row when a marker is tapped', async ({ page }) => {
    const places = grid(100).map((place) => ({ ...place, wiki: { hu: place.name } }))
    await serve(page, places)
    await explore(page)
    await expect(page.locator('.place')).toHaveCount(100)
    const target = nearby(places, deakTer, 1000)[90].place
    await expect(articleLink(page, target.name)).not.toBeInViewport()

    await tapMarker(page, target)

    await expect(articleLink(page, target.name)).toBeInViewport()
  })
})

test.describe('loading', () => {
  test('fetches the manifest on load, and no cell before there is a point', async ({ page }) => {
    const paths = dataRequests(page)
    await page.goto('/kilato/')
    await expect(button(page, 'Explore the map')).toBeVisible()
    await expect.poll(() => paths).toContain('/kilato/data/manifest.json')
    expect(paths).toEqual(['/kilato/data/manifest.json'])
  })

  test('fetches each cell within 1 km that the manifest lists, once', async ({ page }) => {
    const paths = dataRequests(page)
    await explore(page)

    // The fixture's manifest lists these five, all within 1 km of Deák Ferenc tér.
    await expect(page.locator('.place').first()).toBeVisible()
    await expect.poll(() => paths.filter((path) => path.includes('/cells/')).length).toBe(5)
    expect(paths.toSorted()).toEqual([
      '/kilato/data/cells/4749_1269.json',
      '/kilato/data/cells/4749_1270.json',
      '/kilato/data/cells/4749_1271.json',
      '/kilato/data/cells/4750_1269.json',
      '/kilato/data/cells/4750_1270.json',
      '/kilato/data/manifest.json',
    ])
  })

  test('skips a cell the manifest does not list', async ({ page }) => {
    const paths = dataRequests(page)
    await serve(page, [cafe('Only one', 100)])
    await explore(page)
    await expect(page.locator('.place')).toHaveCount(1)
    expect(paths).toEqual(['/kilato/data/manifest.json', '/kilato/data/cells/4749_1270.json'])
  })

  test('fetches only the new cell when the point moves, and keeps the loaded ones', async ({ page }) => {
    const paths = dataRequests(page)
    // 4749_1272 starts 1,916 m east of Deák Ferenc tér, and 4749_1275 is further out still.
    await serve(page, [
      cafe('Here', 100),
      cafe('East', 0, { lat: deakTer.lat, lon: 19.0805 }),
      cafe('Too far east', 0, { lat: deakTer.lat, lon: 19.126 }),
    ])
    await explore(page)
    await expect.poll(() => rowNames(page)).toEqual(['Here'])
    expect(paths.filter((path) => path.includes('/cells/'))).toEqual(['/kilato/data/cells/4749_1270.json'])

    // 300 px east at zoom 15 is 967 m. East is then 986 m away, and Here 972 m.
    const { x, y } = centre(await box(page, '.leaflet-container'))
    await page.mouse.click(x + 300, y)

    await expect(row(page, 'East')).toBeVisible()
    await expect(row(page, 'Here')).toBeVisible()
    expect(paths.filter((path) => path.includes('/cells/'))).toEqual([
      '/kilato/data/cells/4749_1270.json',
      '/kilato/data/cells/4749_1272.json',
    ])
  })

  test('a failed manifest shows the message, and Retry tries again', async ({ page }) => {
    const repair = await breakRequests(page, '**/kilato/data/manifest.json')
    await explore(page)

    await expect(page.getByText(failure)).toBeVisible()
    await expect(page.locator('.place')).toHaveCount(0)
    const paths = dataRequests(page)
    repair()

    await button(page, 'Retry').click()

    await expect(page.locator('.place').first()).toBeVisible()
    await expect(page.getByText(failure)).toHaveCount(0)
    await expect(button(page, 'Retry')).toHaveCount(0)
    expect(paths.filter((path) => path.endsWith('manifest.json'))).toHaveLength(1)
  })

  test('a failed cell shows the message over what did load, and Retry fetches only that cell', async ({ page }) => {
    const repair = await breakRequests(page, '**/kilato/data/cells/4749_1270.json')
    const paths = dataRequests(page)
    await explore(page)

    await expect(page.getByText(failure)).toBeVisible()
    await expect(page.locator('.place').first()).toBeVisible()
    await expect(page.locator('.place').first()).not.toContainText('Deák Ferenc tér metróállomás')
    await expect.poll(() => paths.filter((path) => path.includes('/cells/')).length).toBe(5)
    paths.length = 0
    repair()

    await button(page, 'Retry').click()

    await expect(page.getByText(failure)).toHaveCount(0)
    await expect(page.locator('.place').first()).toContainText('Deák Ferenc tér metróállomás')
    expect(paths).toEqual(['/kilato/data/cells/4749_1270.json'])
  })

  test('a Retry that fails too shows the message again', async ({ page }) => {
    const repair = await breakRequests(page, '**/kilato/data/manifest.json')
    await explore(page)
    await expect(page.getByText(failure)).toBeVisible()
    const paths = dataRequests(page)

    await button(page, 'Retry').click()

    await expect.poll(() => paths).toEqual(['/kilato/data/manifest.json'])
    await expect(page.getByText(failure)).toBeVisible()
    repair()

    await button(page, 'Retry').click()

    await expect(page.locator('.place').first()).toBeVisible()
    await expect(page.getByText(failure)).toHaveCount(0)
  })

  test.describe('on a Hungarian phone', () => {
    test.use({ locale: 'hu-HU' })

    test('the message and Show more are in Hungarian', async ({ page }) => {
      const repair = await breakRequests(page, '**/kilato/data/manifest.json')
      await explore(page, 'A térkép felfedezése')

      await expect(page.getByText('Nem sikerült betölteni a helyeket')).toBeVisible()
      repair()
      await button(page, 'Újrapróbálás').click()

      await expect(button(page, 'Továbbiak megjelenítése')).toBeVisible()
    })
  })
})

test.describe('the markers', () => {
  test('are one circle for each listed place, on a canvas, and none past 1,000 m', async ({ page }) => {
    await explore(page)
    await expect(page.locator('.place').first()).toBeVisible()
    const listed = nearby(fixturePlaces(), deakTer, 1000).map(({ place }) => place)
    expect(listed).toHaveLength(308)

    const onScreen = async () => {
      const { screen } = await geography(page)
      return (await pixels(page, listed.map(screen))).filter((color) => color === null).length
    }

    await expect.poll(onScreen).toBe(0)
  })

  test('leave out a place past 1,000 m', async ({ page }) => {
    const out = cafe('Out', 1010)
    await serve(page, [cafe('In', 100), out])
    await explore(page)
    await expect.poll(() => markerColor(page, atOffset(100))).not.toBeNull()
    expect(await markerColor(page, out)).toBeNull()
  })

  const samples: [CategoryId, string][] = [
    ['sights', 'museum'],
    ['notable', 'article'],
    ['food', 'cafe'],
    ['leisure', 'park'],
    ['services', 'bank'],
    ['shops', 'books'],
  ]

  test('take the colour of their category, six in all', async ({ page }) => {
    const places = samples.map(([cat, kind], index) =>
      cafe(cat, 0, { cat, kind, ...atOffset(100 * (index + 1)) }),
    )
    await serve(page, places)
    await explore(page)

    for (const place of places) {
      await expect.poll(() => markerColor(page, place)).toBe(categoryColors[place.cat])
    }
    expect(new Set(places.map((place) => categoryColors[place.cat])).size).toBe(6)
  })

  test('follow the point when it moves away from a place', async ({ page }) => {
    const near = cafe('Near', 100)
    await serve(page, [near])
    await explore(page)
    await expect.poll(() => markerColor(page, near)).not.toBeNull()

    const { x, y } = centre(await box(page, '.leaflet-container'))
    // Deep south: 340 px at zoom 15 is 1,100 m, and the place was already 100 m to the north.
    await page.mouse.click(x, y + 340)

    await expect(page.locator('.place')).toHaveCount(0)
    await expect.poll(() => markerColor(page, near)).toBeNull()
  })
})

test.describe('tapping a row', () => {
  const near = cafe('Near', 200)
  const next = cafe('Next', 400)

  test('highlights its marker and opens a popup with the name, and nothing moves', async ({ page }) => {
    await serve(page, [near, next])
    await explore(page)
    await expect.poll(() => markerColor(page, near)).toBe(categoryColors.food)
    expect(await ringColor(page, near)).toBeNull()
    const before = await mapCentre(page)

    await row(page, 'Near').click()

    await expect(row(page, 'Near')).toHaveAttribute('aria-current', 'true')
    await expect(popup(page)).toHaveText('Near')
    await expect.poll(() => ringColor(page, near)).toBe('#000000')
    await expectNear(() => mapCentre(page), before, 1)
    await expectNear(() => pinPlace(page), deakTer, 2)
    await expect(firstMeta(page)).toHaveText('Café · 200 m')
  })

  test('moves the highlight and the popup to the next row tapped', async ({ page }) => {
    await serve(page, [near, next])
    await explore(page)
    await row(page, 'Near').click()
    await expect(popup(page)).toHaveText('Near')
    await expect.poll(() => ringColor(page, near)).toBe('#000000')

    await row(page, 'Next').click()

    // The old popup fades out over 200 ms.
    await expect(popup(page).filter({ hasText: 'Next' })).toBeVisible()
    await expect(popup(page)).toHaveCount(1)
    await expect(row(page, 'Next')).toHaveAttribute('aria-current', 'true')
    await expect(row(page, 'Near')).not.toHaveAttribute('aria-current')
    await expect.poll(() => ringColor(page, next)).toBe('#000000')
    await expect.poll(() => ringColor(page, near)).toBeNull()
  })

  test('draws the highlighted marker over a neighbour that hid it', async ({ page }) => {
    // 3 m is 1 px at zoom 15. The further place draws later, so it covers the nearer one's centre.
    const hidden = cafe('Near', 200)
    await serve(page, [hidden, cafe('Over it', 203, { cat: 'shops', kind: 'books' })])
    await explore(page)
    await expect.poll(() => markerColor(page, hidden)).toBe(categoryColors.shops)

    await row(page, 'Near').click()

    await expect.poll(() => markerColor(page, hidden)).toBe(categoryColors.food)
  })

  test('opens the popup again after it was closed', async ({ page }) => {
    await serve(page, [near])
    await explore(page)
    await row(page, 'Near').click()
    await expect(popup(page)).toHaveText('Near')
    await page.locator('.leaflet-popup-close-button').click()
    await expect(popup(page)).toHaveCount(0)

    await row(page, 'Near').click()

    await expect(popup(page)).toHaveText('Near')
  })

  test('does not pan for a marker on screen, even when its popup would not fit', async ({ page }) => {
    // 985 m is 305 px at zoom 15: on the 720 px map, but less than a popup's height from its top edge.
    const edge = cafe('Near the top edge', 985)
    await serve(page, [edge])
    await explore(page)
    await expect.poll(() => markerColor(page, edge)).not.toBeNull()
    const before = await mapCentre(page)

    await page.locator('.place').click()

    await expect(popup(page)).toHaveText('Near the top edge')
    // Leaflet's pan to fit a popup would have started by now, with a move of a few dozen metres.
    await page.waitForTimeout(400)
    await expectNear(() => mapCentre(page), before, 1)
  })

  test('pans the map to a marker off screen, and leaves the point', async ({ page }) => {
    const far = cafe('Off screen', 600)
    await serve(page, [far])
    await explore(page)
    await zoomTo(page, 16)
    await zoomTo(page, 17)
    expect((await geography(page)).screen(far).y).toBeLessThan((await box(page, '.leaflet-container')).y)

    await page.locator('.place').click()

    await expect(popup(page)).toHaveText('Off screen')
    await expectNear(() => mapCentre(page), far, 3)
    await expectNear(() => pinPlace(page), deakTer, 2)
    await expect(button(page, 'My location')).toBeVisible()
    await expect(firstMeta(page)).toHaveText('Café · 600 m')
    await expect.poll(() => ringColor(page, far)).toBe('#000000')
  })

  test.describe('while following', () => {
    test.use({
      geolocation: { latitude: deakTer.lat, longitude: deakTer.lon, accuracy: 10 },
      permissions: ['geolocation'],
    })

    test('pans to a marker off screen, and still follows from the location', async ({ page, context }) => {
      const far = cafe('Off screen', 600)
      await serve(page, [far])
      await page.goto('/kilato/')
      await expect(page.locator('.location-dot')).toBeVisible()
      await expectNear(() => mapCentre(page), deakTer)
      await zoomTo(page, 16)
      await zoomTo(page, 17)

      await page.locator('.place').click()

      await expectNear(() => mapCentre(page), far, 3)
      await expect(button(page, 'My location')).toHaveCount(0)
      await expect(firstMeta(page)).toHaveText('Café · 600 m')

      const walked = atOffset(100)
      await context.setGeolocation({ latitude: walked.lat, longitude: walked.lon, accuracy: 10 })

      await expectNear(() => mapCentre(page), walked, 3)
      await expect(firstMeta(page)).toHaveText('Café · 500 m')
    })
  })
})

test.describe('after a tap on a row, on a walk', () => {
  test.use({
    geolocation: { latitude: deakTer.lat, longitude: deakTer.lon, accuracy: 10 },
    permissions: ['geolocation'],
  })

  test('the row, the marker and the popup stay, and the map follows the walk', async ({ page, context }) => {
    const near = cafe('Near', 300)
    await serve(page, [near])
    await page.goto('/kilato/')
    await expect(page.locator('.location-dot')).toBeVisible()
    await page.locator('.place').click()
    await expect(popup(page)).toHaveText('Near')

    const walked = atOffset(100)
    await context.setGeolocation({ latitude: walked.lat, longitude: walked.lon, accuracy: 10 })

    await expect(firstMeta(page)).toHaveText('Café · 200 m')
    await expectNear(() => mapCentre(page), walked, 3)
    await expect(page.locator('.place')).toHaveAttribute('aria-current', 'true')
    await expect(popup(page)).toHaveText('Near')
    await expect.poll(() => ringColor(page, near)).toBe('#000000')
  })
})

test.describe('tapping a marker', () => {
  test('highlights its row, and the point stays with no popup', async ({ page }) => {
    const near = cafe('Near', 200)
    await serve(page, [near, cafe('Next', 400)])
    await explore(page)
    await expect(page.locator('.place')).toHaveCount(2)

    await tapMarker(page, near)

    await expect(row(page, 'Near')).toHaveAttribute('aria-current', 'true')
    await expect(row(page, 'Next')).not.toHaveAttribute('aria-current')
    await expect.poll(() => ringColor(page, near)).toBe('#000000')
    await expect(popup(page)).toHaveCount(0)
    await expectNear(() => pinPlace(page), deakTer, 2)
    await expect(firstMeta(page)).toHaveText('Café · 200 m')
  })

  test('makes its row look different from the others', async ({ page }) => {
    const near = cafe('Near', 200)
    await serve(page, [near, cafe('Next', 400)])
    await explore(page)
    await expect(page.locator('.place')).toHaveCount(2)
    const plain = await row(page, 'Near').evaluate((element) => getComputedStyle(element).backgroundColor)

    await tapMarker(page, near)

    await expect(row(page, 'Near')).not.toHaveCSS('background-color', plain)
    await expect(row(page, 'Next')).toHaveCSS('background-color', plain)
  })

  test('reaches the marker through the pin and the 1 km circle above it', async ({ page }) => {
    const atThePin = cafe('At the pin', 30)
    await serve(page, [atThePin])
    await explore(page)

    await tapMarker(page, atThePin)

    await expect(page.locator('.place')).toHaveAttribute('aria-current', 'true')
    await expectNear(() => pinPlace(page), deakTer, 2)
  })

  test('scrolls its row into view, and shows it first if it is past the rows showing', async ({ page }) => {
    const places = grid(250)
    await serve(page, places)
    await explore(page)
    await expect(page.locator('.place')).toHaveCount(100)
    // This one's row is on the second page of rows.
    const target = nearby(places, deakTer, 1000)[149].place

    await tapMarker(page, target)

    await expect(page.locator('.place')).toHaveCount(200)
    await expect(row(page, target.name)).toHaveAttribute('aria-current', 'true')
    await expect(row(page, target.name)).toBeInViewport()
    await expectNear(() => pinPlace(page), deakTer, 2)
  })

  test('scrolls down to a row already showing', async ({ page }) => {
    const places = grid(100)
    await serve(page, places)
    await explore(page)
    await expect(page.locator('.place')).toHaveCount(100)
    const target = nearby(places, deakTer, 1000)[90].place
    await expect(row(page, target.name)).not.toBeInViewport()

    await tapMarker(page, target)

    await expect(row(page, target.name)).toBeInViewport()
  })

  test('keeps the rows already showing when the row is further up', async ({ page }) => {
    const places = grid(250)
    await serve(page, places)
    await explore(page)
    await button(page, 'Show more').click()
    await expect(page.locator('.place')).toHaveCount(200)

    await tapMarker(page, nearby(places, deakTer, 1000)[10].place)

    await expect(page.locator('[aria-current]')).toHaveCount(1)
    await expect(page.locator('.place')).toHaveCount(200)
  })

  test('a tap beside a marker still moves the point', async ({ page }) => {
    const near = cafe('Near', 200)
    await serve(page, [near])
    await explore(page)
    await expect.poll(() => markerColor(page, near)).not.toBeNull()
    const geo = await geography(page)
    const { x, y } = geo.screen(near)
    const beside = geo.at(x + 40, y)

    await page.mouse.click(x + 40, y)

    await expectNear(() => pinPlace(page), beside, 2)
    await expect(page.locator('[aria-current]')).toHaveCount(0)
  })

  test('a drag that starts on a marker moves the map, and picks nothing', async ({ page }) => {
    const near = cafe('Near', 200)
    await serve(page, [near])
    await explore(page)
    await expect.poll(() => markerColor(page, near)).not.toBeNull()
    const { x, y } = (await geography(page)).screen(near)

    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x - 60, y + 60, { steps: 10 })
    await page.mouse.up()

    await expect.poll(async () => distanceMetres(await pinPlace(page), deakTer)).toBeGreaterThan(100)
    await expect(page.locator('[aria-current]')).toHaveCount(0)
  })

  test('a place the point moves away from loses its highlight and its popup, for good', async ({ page }) => {
    await serve(page, [cafe('Near', 200)])
    await explore(page)
    await row(page, 'Near').click()
    await expect(popup(page)).toHaveText('Near')
    // A drag, because a tap would close the popup by itself. 340 px at zoom 15 is 1,100 m, and this one goes south.
    const { x, y } = centre(await box(page, '.leaflet-container'))
    const dragBy = async (dy: number) => {
      await page.mouse.move(x, y)
      await page.mouse.down()
      await page.mouse.move(x, y + dy, { steps: 20 })
      await page.waitForTimeout(100)
      await page.mouse.up()
    }

    await dragBy(-340)

    await expect(page.locator('.place')).toHaveCount(0)
    await expect(popup(page)).toHaveCount(0)

    await dragBy(340)

    await expect(page.locator('.place')).toHaveCount(1)
    await expect(page.locator('.place')).not.toHaveAttribute('aria-current')
    await expect(popup(page)).toHaveCount(0)
  })

  test.describe('on a touch screen', () => {
    test.use({ hasTouch: true, viewport: { width: 375, height: 667 } })

    test('a finger on a marker highlights its row and brings it into view', async ({ page }) => {
      // Far enough from the others to hit it at any zoom, and the last of 111 rows.
      const target = cafe('Alone', 0, atOffset(0, 400))
      await serve(page, [...grid(110, 15), target])
      await explore(page)
      await expect(page.locator('.place')).toHaveCount(100)
      await expect.poll(() => markerColor(page, target)).not.toBeNull()
      const { x, y } = (await geography(page)).screen(target)

      await page.touchscreen.tap(x, y)

      await expect(row(page, target.name)).toHaveAttribute('aria-current', 'true')
      await expect(row(page, target.name)).toBeInViewport()
      await expectNear(() => pinPlace(page), deakTer, 3)
    })
  })
})

test.describe('with the location at 47.49791, 19.05439', () => {
  test.use({
    geolocation: { latitude: 47.49791, longitude: 19.05439, accuracy: 10 },
    permissions: ['geolocation'],
  })

  test('no request URL or body holds the location', async ({ page, context }) => {
    const requests: Request[] = []
    context.on('request', (request) => requests.push(request))
    await page.goto('/kilato/')
    await expect(page.locator('.location-dot')).toBeVisible()
    await expect(page.locator('.place')).toHaveCount(100)
    await page.locator('.place').first().click()
    await expect(popup(page)).toBeVisible()
    await button(page, 'Show more').click()
    await expect(page.locator('.place')).toHaveCount(200)
    await expect(page.locator('img.leaflet-tile-loaded').first()).toBeAttached()

    const urls = requests.map((request) => request.url())
    expect(urls.filter((url) => url.includes('/kilato/data/cells/')).length).toBeGreaterThan(0)
    expect(urls.filter((url) => url.includes('tile.openstreetmap.org')).length).toBeGreaterThan(0)
    for (const request of requests) {
      for (const sent of [request.url(), request.postData() ?? '']) {
        expect(sent).not.toContain('47.497')
        expect(sent).not.toContain('19.054')
      }
    }
  })
})
