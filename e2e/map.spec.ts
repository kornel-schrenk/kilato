import type { Page, Request } from '@playwright/test'
import { distanceMetres, type LatLon } from '../src/core/geo'
import { expect, test } from './fixtures'
import { box, button, centre, circlePlace, circleRadius, expectNear, geography, mapCentre, pinPlace, zoomTo } from './map-helpers'

const deakTer = { lat: 47.4975, lon: 19.0545 }
const intro = "Kilátó shows what's interesting within 1 km of you. Your location stays on your phone."
const note = 'Tap or drag the map, or search.'

const map = (page: Page) => page.locator('.leaflet-container')
const pin = (page: Page) => page.locator('.pin')
const dot = (page: Page) => page.locator('.location-dot')
const accuracyCircle = (page: Page) => page.locator('.accuracy-circle')
const kmCircle = (page: Page) => page.locator('.km-circle')

/**
 * How much of a circle's line lies on the map, from 0 to 1, read at 360 points along it.
 * toBeVisible can't tell: it asks only for a non-empty box, which a circle off screen still has.
 */
async function lineOnMap(page: Page, selector: string) {
  const circle = await box(page, selector)
  const area = await box(page, '.leaflet-container')
  const { x, y } = centre(circle)
  const points = Array.from({ length: 360 }, (_, degrees) => {
    const angle = (degrees * Math.PI) / 180
    return { x: x + (circle.width / 2) * Math.cos(angle), y: y + (circle.height / 2) * Math.sin(angle) }
  })
  const inside = points.filter(
    (point) =>
      point.x >= area.x && point.x <= area.x + area.width && point.y >= area.y && point.y <= area.y + area.height,
  )
  return inside.length / points.length
}

/** Starts at the map's centre. The map keeps coasting a while after a quick drag. */
async function drag(page: Page, dx: number, dy: number, steps = 10) {
  const { x, y } = centre(await box(page, '.leaflet-container'))
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps })
  await page.mouse.up()
}

/**
 * A quick drag on a paused clock, so call page.clock.install() before opening the page.
 * Leaflet coasts only when the last moves came within 50 ms of each other, which a busy
 * machine misses in real time. The map is left coasting, and the clock paused.
 */
async function flick(page: Page, dx: number) {
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000))
  const { x, y } = centre(await box(page, '.leaflet-container'))
  await page.mouse.move(x, y)
  await page.mouse.down()
  for (let step = 1; step <= 4; step++) {
    await page.mouse.move(x + (dx * step) / 4, y)
    await page.clock.runFor(16)
  }
  await page.mouse.up()
}

/**
 * Replaces the browser's location with one the test feeds by hand, through sendFix. Chromium's
 * setGeolocation delivers a location error just before each new fix, and in exploring mode
 * that error alone ends a watch. So a test of "the drag stopped the watch" needs this one.
 */
const handFedLocation = (page: Page) =>
  page.addInitScript(() => {
    const watches = new Map<number, PositionCallback>()
    let next = 1
    navigator.geolocation.watchPosition = (success) => {
      watches.set(next, success)
      return next++
    }
    navigator.geolocation.clearWatch = (watch) => {
      watches.delete(watch)
    }
    Object.assign(window, { watches })
  })

const sendFix = (page: Page, { lat, lon }: LatLon) =>
  page.evaluate(
    ([latitude, longitude]) => {
      const { watches } = window as unknown as { watches: Map<number, PositionCallback> }
      for (const success of watches.values()) {
        success({ coords: { latitude, longitude, accuracy: 30 } } as GeolocationPosition)
      }
    },
    [lat, lon],
  )

const watchCount = (page: Page) =>
  page.evaluate(() => (window as unknown as { watches: Map<number, unknown> }).watches.size)

/** Opens the page and starts exploring at Deák Ferenc tér. */
async function explore(page: Page) {
  await page.goto('/kilato/')
  await button(page, 'Explore the map').click()
  await expect(pin(page)).toBeVisible()
  await expectNear(() => pinPlace(page), deakTer)
  await expect(page.locator('img.leaflet-tile-loaded').first()).toBeAttached()
}

/** Makes every watchPosition call fail with this error code. */
const failLocation = (page: Page, code: number) =>
  page.addInitScript((errorCode) => {
    navigator.geolocation.watchPosition = (_success, error) => {
      error?.({ code: errorCode, message: 'Faked', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 })
      return 1
    }
  }, code)

test.describe('layout', () => {
  for (const { width, height } of [
    { width: 375, height: 667 },
    { width: 899, height: 700 },
  ]) {
    test.describe(`at ${width} px wide`, () => {
      test.use({ viewport: { width, height } })

      test('the map sits below the header, at 45% of the viewport height', async ({ page }) => {
        await page.goto('/kilato/')
        await expect(map(page)).toBeVisible()

        const header = await box(page, 'header')
        const area = await box(page, '.leaflet-container')
        expect(header.y).toBe(0)
        expect(area.y).toBe(header.height)
        expect(area.x).toBe(0)
        expect(area.width).toBe(width)
        expect(area.height).toBeCloseTo(height * 0.45, 0)
      })
    })
  }

  for (const { width, height } of [
    { width: 900, height: 700 },
    { width: 1280, height: 720 },
  ]) {
    test.describe(`at ${width} px wide`, () => {
      test.use({ viewport: { width, height } })

      test('the map fills the left 60%, and the rest sits on the right', async ({ page }) => {
        await page.goto('/kilato/')
        await expect(map(page)).toBeVisible()

        const area = await box(page, '.leaflet-container')
        expect(area).toEqual({ x: 0, y: 0, width: width * 0.6, height })
        const header = await box(page, 'header')
        const main = await box(page, 'main')
        expect(header.x).toBe(width * 0.6)
        expect(header.width).toBe(width * 0.4)
        expect(main.x).toBe(width * 0.6)
        expect(main.y).toBe(header.height)
      })
    })
  }

  test('the header holds the name and the language switch', async ({ page }) => {
    await page.goto('/kilato/')
    const header = page.locator('header')
    await expect(header.getByRole('heading', { name: 'Kilátó' })).toBeVisible()
    await expect(header.getByRole('button', { name: 'HU', exact: true })).toBeVisible()
    await expect(header.getByRole('button', { name: 'EN', exact: true })).toBeVisible()
  })

  test('the page does not scroll sideways on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/kilato/')
    await expect(map(page)).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375)
  })
})

test.describe('tiles', () => {
  const tileRequests = (page: Page) => {
    const requests: Request[] = []
    page.on('request', (request) => {
      if (new URL(request.url()).hostname.endsWith('openstreetmap.org')) requests.push(request)
    })
    return requests
  }

  test('come only from tile.openstreetmap.org, for the view on screen', async ({ page }) => {
    const requests = tileRequests(page)
    await page.goto('/kilato/')
    // The tile holding Deák Ferenc tér at zoom 15, worked out from the slippy map formula.
    await expect(page.locator('img[src$="/15/18118/11458.png"]')).toHaveClass(/leaflet-tile-loaded/)

    const urls = requests.map((request) => request.url())
    expect(urls.length).toBeGreaterThan(0)
    for (const url of urls) {
      expect(url).toMatch(/^https:\/\/tile\.openstreetmap\.org\/15\/\d+\/\d+\.png$/)
    }

    // No prefetching: each tile asked for overlaps the map on screen.
    const view = await box(page, '.leaflet-container')
    const images = page.locator('img.leaflet-tile')
    expect(await images.count()).toBe(urls.length)
    for (const image of await images.all()) {
      const tile = await image.boundingBox()
      expect(tile!.x).toBeLessThan(view.x + view.width)
      expect(tile!.x + tile!.width).toBeGreaterThan(view.x)
      expect(tile!.y).toBeLessThan(view.y + view.height)
      expect(tile!.y + tile!.height).toBeGreaterThan(view.y)
    }
  })

  test('stop at zoom 19', async ({ page }) => {
    const requests = tileRequests(page)
    await page.goto('/kilato/')
    await expect(page.locator('img.leaflet-tile-loaded').first()).toBeAttached()

    for (let zoom = 16; zoom <= 19; zoom++) {
      await zoomTo(page, zoom)
    }

    await expect(page.locator('.leaflet-control-zoom-in')).toHaveClass(/leaflet-disabled/)
    const zooms = requests.map((request) => Number(new URL(request.url()).pathname.split('/')[1]))
    expect(Math.max(...zooms)).toBe(19)
  })

  test('are attributed to OpenStreetMap, with a link to its copyright page', async ({ page }) => {
    await page.goto('/kilato/')
    const link = page.locator('.leaflet-control-attribution').getByRole('link', {
      name: '© OpenStreetMap contributors',
      exact: true,
    })
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright')
  })

  test('the attribution is not covered, on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/kilato/')
    const link = page.locator('.leaflet-control-attribution a[href*="copyright"]')
    await expect(link).toBeVisible()
    // Throws if anything on top would take the click. `trial` doesn't follow the link.
    await link.click({ trial: true })
    const view = await box(page, '.leaflet-container')
    const area = await link.boundingBox()
    expect(area!.x).toBeGreaterThanOrEqual(view.x)
    expect(area!.x + area!.width).toBeLessThanOrEqual(view.x + view.width)
  })

  test('carry the default Referer, because the page sets no Referrer-Policy', async ({ page, baseURL }) => {
    const requests = tileRequests(page)
    const response = await page.goto('/kilato/')
    await expect(page.locator('img.leaflet-tile-loaded').first()).toBeAttached()

    expect(response!.headers()['referrer-policy']).toBeUndefined()
    await expect(page.locator('meta[name="referrer" i]')).toHaveCount(0)
    expect(await page.evaluate(() => [...document.images].map((image) => image.referrerPolicy))).not.toContainEqual(
      expect.stringMatching(/.+/),
    )
    // The browser's default sends the origin to another site.
    expect(await requests[0].headerValue('referer')).toBe(`${baseURL}/`)
  })

  test('the page registers no service worker', async ({ page }) => {
    await page.addInitScript(() => {
      const calls: unknown[] = []
      Object.assign(window, { serviceWorkerCalls: calls })
      navigator.serviceWorker.register = (...args: unknown[]) => {
        calls.push(args)
        return Promise.reject(new Error('Not allowed in this test'))
      }
    })
    await page.goto('/kilato/')
    await expect(page.locator('img.leaflet-tile-loaded').first()).toBeAttached()
    expect(await page.evaluate(() => (window as unknown as { serviceWorkerCalls: unknown[] }).serviceWorkerCalls)).toEqual([])
  })
})

test.describe('without a granted permission', () => {
  test('the page shows the intro and both buttons, and no point yet', async ({ page }) => {
    await page.goto('/kilato/')
    await expect(page.getByText(intro)).toBeVisible()
    await expect(button(page, 'Use my location')).toBeVisible()
    await expect(button(page, 'Explore the map')).toBeVisible()
    await expect(map(page)).toBeVisible()
    await expect(pin(page)).toHaveCount(0)
    await expect(dot(page)).toHaveCount(0)
    await expect(kmCircle(page)).toHaveCount(0)
    await expect(page.getByText(note)).toHaveCount(0)
    await expect(button(page, 'My location')).toHaveCount(0)
  })

  test.describe('on a Hungarian phone', () => {
    test.use({ locale: 'hu-HU' })

    test('the intro is in Hungarian', async ({ page }) => {
      await page.goto('/kilato/')
      await expect(
        page.getByText('A Kilátó megmutatja, mi érdekes 1 km-en belül körülötted. A helyzeted a telefonodon marad.'),
      ).toBeVisible()
      await expect(button(page, 'A helyzetem használata')).toBeVisible()
      await expect(button(page, 'A térkép felfedezése')).toBeVisible()
    })
  })

  test('the page does not ask for the location before a press', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.geolocation.watchPosition = () => {
        throw new Error('Asked too early')
      }
      navigator.geolocation.getCurrentPosition = () => {
        throw new Error('Asked too early')
      }
    })
    const errors: Error[] = []
    page.on('pageerror', (error) => errors.push(error))
    await page.goto('/kilato/')
    await expect(page.getByText(intro)).toBeVisible()
    expect(errors).toEqual([])
  })

  test('a permission refused on an earlier visit still gets the intro, and a press explores', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.permissions.query = () => Promise.resolve({ state: 'denied' } as PermissionStatus)
    })
    await page.goto('/kilato/')
    await expect(page.getByText(intro)).toBeVisible()

    await button(page, 'Use my location').click()

    await expect(page.getByText(note)).toBeVisible()
    await expect(pin(page)).toBeVisible()
  })

  test('a browser that rejects the permission question gets the intro', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.permissions.query = () => Promise.reject(new TypeError('Not supported'))
    })
    await page.goto('/kilato/')
    await expect(page.getByText(intro)).toBeVisible()
    await expect(button(page, 'Explore the map')).toBeVisible()
  })

  test('a browser with no Permissions API gets the intro', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'permissions', { value: undefined })
    })
    await page.goto('/kilato/')
    await expect(page.getByText(intro)).toBeVisible()
    await expect(button(page, 'Explore the map')).toBeVisible()
  })

  test('Explore the map stops a location request still waiting', async ({ page }) => {
    await handFedLocation(page)
    await page.goto('/kilato/')
    await button(page, 'Use my location').click()
    await expect.poll(() => watchCount(page)).toBe(1)

    await button(page, 'Explore the map').click()

    await expect(pin(page)).toBeVisible()
    await expect.poll(() => watchCount(page)).toBe(0)
  })

  const startsExploring = async (page: Page) => {
    await expect(page.getByText(note)).toBeVisible()
    await expect(page.getByText(intro)).toHaveCount(0)
    await expect(button(page, 'Explore the map')).toHaveCount(0)
    await expect(button(page, 'Use my location')).toHaveCount(0)
    await expect(pin(page)).toBeVisible()
    await expect(kmCircle(page)).toBeVisible()
    await expect(dot(page)).toHaveCount(0)
    await expectNear(() => pinPlace(page), deakTer)
    await expectNear(() => mapCentre(page), deakTer)
    await expect.poll(async () => (await geography(page)).zoom).toBe(15)
  }

  test('Explore the map starts exploring at Deák Ferenc tér, zoom 15', async ({ page }) => {
    await page.goto('/kilato/')
    await button(page, 'Explore the map').click()
    await startsExploring(page)
  })

  test('Explore the map goes back there after the map was moved during the intro', async ({ page }) => {
    await page.goto('/kilato/')
    await expect(page.getByText(intro)).toBeVisible()
    await expect(page.locator('img.leaflet-tile-loaded').first()).toBeAttached()
    await zoomTo(page, 16)
    await drag(page, 300, 100)
    await expect.poll(async () => distanceMetres(await mapCentre(page), deakTer)).toBeGreaterThan(100)

    await button(page, 'Explore the map').click()

    await startsExploring(page)
  })

  test('Explore the map still gets to zoom 15 when pressed while the map zooms', async ({ page }) => {
    await page.goto('/kilato/')
    await expect(page.getByText(intro)).toBeVisible()
    await expect(page.locator('img.leaflet-tile-loaded').first()).toBeAttached()

    // Both presses from inside the page: the zoom is a real 250 ms CSS transition, which a
    // faked clock can't hold open, and a press from the test could land after it has ended.
    await page.evaluate(
      (name) =>
        new Promise<void>((pressed) => {
          const pressOnceZooming = () => {
            if (!document.querySelector('.leaflet-zoom-anim')) {
              requestAnimationFrame(pressOnceZooming)
              return
            }
            ;[...document.querySelectorAll('button')].find((found) => found.textContent === name)!.click()
            pressed()
          }
          document.querySelector<HTMLElement>('.leaflet-control-zoom-in')!.click()
          pressOnceZooming()
        }),
      'Explore the map',
    )

    await startsExploring(page)
  })

  test('Explore the map goes there even while the map still coasts from a flick', async ({ page }) => {
    await page.clock.install()
    await page.goto('/kilato/')
    await expect(page.getByText(intro)).toBeVisible()
    await expect(page.locator('img.leaflet-tile-loaded').first()).toBeAttached()
    await flick(page, -200)
    await page.clock.runFor(100)

    await button(page, 'Explore the map').click()
    await page.clock.resume()

    await startsExploring(page)
  })

  test('moving the map during the intro starts nothing', async ({ page }) => {
    await page.goto('/kilato/')
    await expect(page.getByText(intro)).toBeVisible()
    await expect(page.locator('img.leaflet-tile-loaded').first()).toBeAttached()
    const { x, y } = centre(await box(page, '.leaflet-container'))

    await drag(page, 100, 50)
    await page.mouse.click(x, y)

    await expect(page.getByText(intro)).toBeVisible()
    await expect(pin(page)).toHaveCount(0)
    await expect(page.getByText(note)).toHaveCount(0)
  })

  test('a refusal starts exploring at Deák Ferenc tér, zoom 15', async ({ page }) => {
    await page.goto('/kilato/')
    await button(page, 'Use my location').click()
    await startsExploring(page)
  })

  for (const [code, name] of [
    [2, 'POSITION_UNAVAILABLE'],
    [3, 'TIMEOUT'],
  ] as const) {
    test(`a location error, ${name}, starts exploring at Deák Ferenc tér, zoom 15`, async ({ page }) => {
      await failLocation(page, code)
      await page.goto('/kilato/')
      await button(page, 'Use my location').click()
      await startsExploring(page)
    })
  }

  test('a press on Use my location, once allowed, starts following', async ({ page, context }) => {
    await context.setGeolocation({ latitude: 47.51, longitude: 19.06, accuracy: 25 })
    await page.goto('/kilato/')
    await expect(page.getByText(intro)).toBeVisible()
    await context.grantPermissions(['geolocation'])

    await button(page, 'Use my location').click()

    await expect(dot(page)).toBeVisible()
    await expect(page.getByText(intro)).toHaveCount(0)
    await expectNear(() => mapCentre(page), { lat: 47.51, lon: 19.06 })
  })
})

test.describe('on a Hungarian phone, exploring', () => {
  test.use({ locale: 'hu-HU' })

  test('the note and the map controls are in Hungarian too', async ({ page }) => {
    await page.goto('/kilato/')
    await button(page, 'A térkép felfedezése').click()
    await expect(page.getByText('Koppints a térképre, húzd el, vagy keress.')).toBeVisible()
    await expect(button(page, 'Helyzetem')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Térkép' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Nagyítás' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Kicsinyítés' })).toBeVisible()
  })

  test('switching the language keeps the pin, and renames the controls', async ({ page }) => {
    await page.goto('/kilato/')
    await button(page, 'A térkép felfedezése').click()
    await expect(pin(page)).toBeVisible()
    await expect(page.locator('img.leaflet-tile-loaded').first()).toBeAttached()

    await button(page, 'EN').click()

    await expect(page.getByText(note)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Zoom in' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Nagyítás' })).toHaveCount(0)
    await expectNear(() => pinPlace(page), deakTer)
  })
})

// 0.001° of latitude is 111.19 m.
const metresNorth = (place: LatLon, metres: number) => ({ lat: place.lat + (metres / 111.19) * 0.001, lon: place.lon })
const toFake = ({ lat, lon }: LatLon, accuracy = 30) => ({ latitude: lat, longitude: lon, accuracy })

const home = { lat: 47.51, lon: 19.06 }

test.describe('with the permission granted', () => {
  test.use({ geolocation: toFake(home), permissions: ['geolocation'] })

  /** Sets the location with a new accuracy, and waits until the page has taken the fix. */
  async function walkTo(page: Page, place: LatLon, accuracy: number) {
    await page.context().setGeolocation(toFake(place, accuracy))
    await expect.poll(() => circleRadius(page, '.accuracy-circle')).toBeCloseTo(accuracy, -1)
  }

  test('the page follows the location, with no intro', async ({ page }) => {
    await page.goto('/kilato/')

    await expect(dot(page)).toBeVisible()
    await expect(page.getByText(intro)).toHaveCount(0)
    await expect(button(page, 'Use my location')).toHaveCount(0)
    await expect(pin(page)).toHaveCount(0)
    await expect(button(page, 'My location')).toHaveCount(0)
    await expect(page.getByText(note)).toHaveCount(0)
    await expectNear(() => mapCentre(page), home)
    await expectNear(() => circlePlace(page, '.location-dot'), home)
    await expect.poll(async () => (await geography(page)).zoom).toBe(15)
  })

  test('it asks watchPosition for high accuracy', async ({ page }) => {
    await page.addInitScript(() => {
      const options: unknown[] = []
      Object.assign(window, { watchOptions: options })
      const { watchPosition } = navigator.geolocation
      navigator.geolocation.watchPosition = function (success, error, given) {
        options.push(given)
        return watchPosition.call(this, success, error, given)
      }
    })
    await page.goto('/kilato/')
    await expect(dot(page)).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as { watchOptions: unknown[] }).watchOptions)).toEqual([
      { enableHighAccuracy: true },
    ])
  })

  test('the location dot sits inside its accuracy circle and the 1 km circle', async ({ page }) => {
    await page.goto('/kilato/')
    await expect(dot(page)).toBeVisible()
    await expect(accuracyCircle(page)).toBeVisible()
    await expect(kmCircle(page)).toBeVisible()
    await expectNear(() => mapCentre(page), home)

    await expectNear(() => circlePlace(page, '.accuracy-circle'), home)
    await expectNear(() => circlePlace(page, '.km-circle'), home)
    expect(await circleRadius(page, '.accuracy-circle')).toBeCloseTo(30, -1)
    const radius = await circleRadius(page, '.km-circle')
    expect(radius).toBeGreaterThan(990)
    expect(radius).toBeLessThan(1010)
  })

  test('walking 20 m moves the point, and the map with it', async ({ page }) => {
    await page.goto('/kilato/')
    await expect(dot(page)).toBeVisible()
    await expectNear(() => mapCentre(page), home)

    const next = metresNorth(home, 20)
    await page.context().setGeolocation(toFake(next))

    await expectNear(() => mapCentre(page), next, 4)
    await expectNear(() => circlePlace(page, '.location-dot'), next, 4)
    await expectNear(() => circlePlace(page, '.km-circle'), next, 4)
  })

  // At zoom 19 a pixel is 0.2 m, so these tests can tell 14 m from 16 m. The map can sit
  // 1.5 m off the location by then: its earlier pan to the location was in whole pixels at
  // zoom 15. So a test that expects no pan compares with the centre this returns.
  async function atZoom19(page: Page) {
    await page.goto('/kilato/')
    await expect(dot(page)).toBeVisible()
    await expectNear(() => mapCentre(page), home)
    for (let zoom = 16; zoom <= 19; zoom++) {
      await zoomTo(page, zoom)
    }
    return mapCentre(page)
  }

  test('walking 14 m moves nothing but the accuracy circle', async ({ page }) => {
    const before = await atZoom19(page)

    await walkTo(page, metresNorth(home, 14), 10)

    await expectNear(() => mapCentre(page), before, 0.5)
    await expectNear(() => circlePlace(page, '.location-dot'), home, 0.5)
    await expectNear(() => circlePlace(page, '.km-circle'), home, 0.5)
  })

  test('walking 16 m moves the point', async ({ page }) => {
    await atZoom19(page)
    const next = metresNorth(home, 16)

    await walkTo(page, next, 10)

    await expectNear(() => mapCentre(page), next, 0.5)
    await expectNear(() => circlePlace(page, '.location-dot'), next, 0.5)
  })

  test('two 10 m steps move the point once, measured from the point', async ({ page }) => {
    const before = await atZoom19(page)

    await walkTo(page, metresNorth(home, 10), 10)
    await expectNear(() => mapCentre(page), before, 0.5)

    const next = metresNorth(home, 20)
    await walkTo(page, next, 20)
    await expectNear(() => mapCentre(page), next, 0.5)
  })

  test('a walk keeps the zoom the user chose', async ({ page }) => {
    await atZoom19(page)
    const next = metresNorth(home, 40)

    await walkTo(page, next, 10)

    await expectNear(() => mapCentre(page), next, 0.5)
    expect((await geography(page)).zoom).toBe(19)
  })

  test('tapping the map while following changes nothing', async ({ page }) => {
    await page.goto('/kilato/')
    await expect(dot(page)).toBeVisible()
    await expectNear(() => mapCentre(page), home)
    const { x, y } = centre(await box(page, '.leaflet-container'))

    await page.mouse.click(x + 80, y + 40)

    await expect(button(page, 'My location')).toHaveCount(0)
    await expect(pin(page)).toHaveCount(0)
    await expect(dot(page)).toBeVisible()
    await expectNear(() => circlePlace(page, '.location-dot'), home)
  })

  test('a location error on load starts exploring at Deák Ferenc tér', async ({ page }) => {
    await failLocation(page, 2)
    await page.goto('/kilato/')
    await expect(page.getByText(note)).toBeVisible()
    await expect(pin(page)).toBeVisible()
    await expectNear(() => pinPlace(page), deakTer)
  })

  test('dragging switches to exploring, with the pin at the map centre', async ({ page }) => {
    await page.goto('/kilato/')
    await expect(dot(page)).toBeVisible()
    await expectNear(() => mapCentre(page), home)

    await drag(page, -120, 60)

    await expect(pin(page)).toBeVisible()
    await expect(dot(page)).toHaveCount(0)
    await expect(accuracyCircle(page)).toHaveCount(0)
    await expect(button(page, 'My location')).toBeVisible()
    await expect(page.getByText(note)).toBeVisible()
    await expect.poll(async () => distanceMetres(await pinPlace(page), home)).toBeGreaterThan(100)
    await expectNear(() => mapCentre(page), await pinPlace(page))
    await expectNear(() => circlePlace(page, '.km-circle'), await pinPlace(page))
  })

  test('after that drag, walking moves nothing', async ({ page }) => {
    await handFedLocation(page)
    await page.goto('/kilato/')
    await page.waitForFunction(() => (window as unknown as { watches: Map<number, unknown> }).watches.size === 1)
    await sendFix(page, home)
    await expect(dot(page)).toBeVisible()
    await expectNear(() => mapCentre(page), home)
    await drag(page, -120, 60)
    await expect(pin(page)).toBeVisible()
    await expect.poll(async () => distanceMetres(await pinPlace(page), await mapCentre(page))).toBeLessThan(5)
    const left = await pinPlace(page)

    await sendFix(page, metresNorth(home, 500))
    // The fix has already reached any watch still running. This leaves time for the page to draw it.
    await page.waitForTimeout(200)

    await expect(dot(page)).toHaveCount(0)
    await expectNear(() => pinPlace(page), left)
    await expectNear(() => mapCentre(page), left)
  })

  test('a drag stops the location watch, and My location starts just one again', async ({ page }) => {
    await handFedLocation(page)
    await page.goto('/kilato/')
    await expect.poll(() => watchCount(page)).toBe(1)
    await sendFix(page, home)
    await expect(dot(page)).toBeVisible()
    await expectNear(() => mapCentre(page), home)

    await drag(page, -120, 60)
    await expect(pin(page)).toBeVisible()
    await expect.poll(() => watchCount(page)).toBe(0)

    await button(page, 'My location').click()
    await expect.poll(() => watchCount(page)).toBe(1)
  })

  test('My location switches back to following, at the location now', async ({ page }) => {
    await page.goto('/kilato/')
    await expect(dot(page)).toBeVisible()
    await expectNear(() => mapCentre(page), home)
    await drag(page, -120, 60)
    await expect(button(page, 'My location')).toBeVisible()
    const walked = metresNorth(home, 200)
    await page.context().setGeolocation(toFake(walked))

    await button(page, 'My location').click()

    await expect(dot(page)).toBeVisible()
    await expect(pin(page)).toHaveCount(0)
    await expect(button(page, 'My location')).toHaveCount(0)
    await expect(page.getByText(note)).toHaveCount(0)
    await expectNear(() => mapCentre(page), walked)
    await expectNear(() => circlePlace(page, '.location-dot'), walked)
  })

  // The spec's Start zoom: 14 below 900 px wide, 15 from there. The share is how much of the 1 km
  // circle's line that leaves on the map, worked out from its radius of 310 px at 15 and 155 px at 14.
  for (const { width, height, zoom, share } of [
    { width: 320, height: 568, zoom: 14, share: 0.62 },
    { width: 375, height: 667, zoom: 14, share: 0.84 },
    { width: 390, height: 844, zoom: 14, share: 1 },
    { width: 412, height: 915, zoom: 14, share: 1 },
    { width: 768, height: 1024, zoom: 14, share: 1 },
    { width: 899, height: 700, zoom: 14, share: 1 },
    { width: 900, height: 700, zoom: 15, share: 0.67 },
    { width: 1024, height: 768, zoom: 15, share: 0.91 },
    { width: 1280, height: 720, zoom: 15, share: 1 },
    { width: 1920, height: 1080, zoom: 15, share: 1 },
  ]) {
    test.describe(`at ${width}x${height}`, () => {
      test.use({ viewport: { width, height } })

      test(`following starts at zoom ${zoom}, with ${share * 100}% of the 1 km circle on the map`, async ({ page }) => {
        await page.goto('/kilato/')
        await expect(dot(page)).toBeVisible()

        await expect.poll(async () => (await geography(page)).zoom).toBe(zoom)
        await expect.poll(() => lineOnMap(page, '.km-circle')).toBeCloseTo(share, 1)
      })
    })
  }

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 375, height: 667 } })

    test('My location goes back to zoom 14, whatever the zoom was', async ({ page }) => {
      await page.goto('/kilato/')
      await expect(dot(page)).toBeVisible()
      await expect.poll(async () => (await geography(page)).zoom).toBe(14)
      await zoomTo(page, 15)
      await drag(page, -60, 30)
      await button(page, 'My location').click()

      await expect(dot(page)).toBeVisible()
      await expect.poll(async () => (await geography(page)).zoom).toBe(14)
      await expect.poll(() => lineOnMap(page, '.km-circle')).toBeCloseTo(0.84, 1)
    })

    test('a later walk keeps the zoom the user chose, even with the circle off the map', async ({ page }) => {
      await page.goto('/kilato/')
      await expect(dot(page)).toBeVisible()
      await expect.poll(async () => (await geography(page)).zoom).toBe(14)
      await zoomTo(page, 15)
      const next = metresNorth(home, 100)

      await page.context().setGeolocation(toFake(next))

      await expectNear(() => mapCentre(page), next)
      expect((await geography(page)).zoom).toBe(15)
      expect(await lineOnMap(page, '.km-circle')).toBe(0)
    })
  })

  test('following resumes after My location: the next walk moves the map', async ({ page }) => {
    await page.goto('/kilato/')
    await expect(dot(page)).toBeVisible()
    await expectNear(() => mapCentre(page), home)
    await drag(page, -120, 60)
    await button(page, 'My location').click()
    await expect(dot(page)).toBeVisible()
    await expectNear(() => mapCentre(page), home)

    const next = metresNorth(home, 100)
    await page.context().setGeolocation(toFake(next))

    await expectNear(() => mapCentre(page), next)
  })
})

test.describe('exploring', () => {
  test('the end of a slow drag moves the pin to the map centre', async ({ page }) => {
    await explore(page)

    await drag(page, -150, 80, 30)

    await expect.poll(async () => distanceMetres(await pinPlace(page), deakTer)).toBeGreaterThan(200)
    await expectNear(() => mapCentre(page), await pinPlace(page))
    await expectNear(() => circlePlace(page, '.km-circle'), await pinPlace(page))
  })

  test('a quick drag coasts on, and the pin ends up at the centre of where the map stopped', async ({ page }) => {
    await page.clock.install()
    await explore(page)

    await flick(page, -200)
    await page.clock.runFor(2000)
    await page.clock.resume()

    // The drag itself is 200 px, about 650 m at zoom 15. Past 800 m, the map has coasted on.
    await expect.poll(async () => distanceMetres(await pinPlace(page), deakTer)).toBeGreaterThan(800)
    const { x, y, width, height } = await box(page, '.pin')
    const area = centre(await box(page, '.leaflet-container'))
    expect(Math.abs(x + width / 2 - area.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(y + height - area.y)).toBeLessThanOrEqual(1)
  })

  test('a tap moves the pin to the tap, and leaves the map where it is', async ({ page }) => {
    await explore(page)
    const before = await mapCentre(page)
    const { x, y } = centre(await box(page, '.leaflet-container'))
    const tapped = (await geography(page)).at(x + 90, y - 50)

    await page.mouse.click(x + 90, y - 50)

    await expectNear(() => pinPlace(page), tapped, 2)
    await expectNear(() => circlePlace(page, '.km-circle'), tapped, 2)
    await expectNear(() => mapCentre(page), before, 2)
  })

  test('a tap while the map coasts keeps the pin at the tap when the map stops', async ({ page }) => {
    await page.clock.install()
    await explore(page)
    await flick(page, -200)
    await page.clock.runFor(100)
    const { x, y } = centre(await box(page, '.leaflet-container'))
    const tapped = (await geography(page)).at(x + 90, y - 50)

    await page.mouse.click(x + 90, y - 50)
    await page.clock.runFor(2000)
    await page.clock.resume()

    await expectNear(() => pinPlace(page), tapped, 5)
    await expectNear(() => circlePlace(page, '.km-circle'), tapped, 5)
  })

  test('the 1 km circle is 1 km at any zoom', async ({ page }) => {
    await explore(page)
    await zoomTo(page, 14)

    const radius = await circleRadius(page, '.km-circle')
    expect(radius).toBeGreaterThan(990)
    expect(radius).toBeLessThan(1010)
  })

  test('a press on a zoom button does not count as a tap', async ({ page }) => {
    await explore(page)

    await zoomTo(page, 16)

    await expectNear(() => pinPlace(page), deakTer, 2)
  })

  test('a press on My location does not count as a tap', async ({ page }) => {
    await explore(page)

    await button(page, 'My location').click()

    // Refused here, so exploring goes on. A tap on the map under the button would have moved the pin.
    await page.waitForTimeout(200)
    await expect(pin(page)).toBeVisible()
    await expectNear(() => pinPlace(page), deakTer, 2)
  })

  test('tapping on the pin still counts as a tap', async ({ page }) => {
    await explore(page)
    const { x, y } = centre(await box(page, '.km-circle'))
    const onThePin = (await geography(page)).at(x, y - 20)

    await page.mouse.click(x, y - 20)

    await expectNear(() => pinPlace(page), onThePin, 2)
  })

  test('tapping on the line of the 1 km circle still counts as a tap', async ({ page }) => {
    await explore(page)
    // The circle has no fill, so its line at the top is the only part of it that could take a tap.
    const { x, y, width } = await box(page, '.km-circle')
    const onTheLine = (await geography(page)).at(x + width / 2, y + 1)

    await page.mouse.click(x + width / 2, y + 1)

    await expectNear(() => pinPlace(page), onTheLine, 2)
  })

  test('My location asks for the permission when it is needed, and follows once allowed', async ({ page, context }) => {
    await context.setGeolocation(toFake(home))
    await explore(page)
    await context.grantPermissions(['geolocation'])

    await button(page, 'My location').click()

    await expect(dot(page)).toBeVisible()
    await expect(pin(page)).toHaveCount(0)
    await expectNear(() => mapCentre(page), home)
  })

  test('a refused My location leaves the pin where the user put it', async ({ page }) => {
    await explore(page)
    const { x, y } = centre(await box(page, '.leaflet-container'))
    const tapped = (await geography(page)).at(x + 90, y - 50)
    await page.mouse.click(x + 90, y - 50)
    await expectNear(() => pinPlace(page), tapped, 2)

    await button(page, 'My location').click()
    await page.waitForTimeout(200)

    await expect(button(page, 'My location')).toBeVisible()
    await expect(page.getByText(note)).toBeVisible()
    await expectNear(() => pinPlace(page), tapped, 2)
    await expectNear(() => mapCentre(page), deakTer)
  })

  test('a location error on My location leaves the pin too, and it can be pressed again', async ({ page }) => {
    await failLocation(page, 2)
    await explore(page)
    const calls = () => page.evaluate(() => (window as unknown as { watchCalls: number }).watchCalls)
    await page.evaluate(() => {
      const fail = navigator.geolocation.watchPosition
      Object.assign(window, { watchCalls: 0 })
      navigator.geolocation.watchPosition = function (...args) {
        ;(window as unknown as { watchCalls: number }).watchCalls++
        return fail.apply(this, args)
      }
    })

    await button(page, 'My location').click()
    await expect.poll(calls).toBe(1)
    await button(page, 'My location').click()
    await expect.poll(calls).toBe(2)

    await expect(pin(page)).toBeVisible()
    await expectNear(() => pinPlace(page), deakTer, 2)
  })
})

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 667 } })

  test('a tap moves the pin to the tap', async ({ page }) => {
    await explore(page)
    const { x, y } = centre(await box(page, '.leaflet-container'))
    const tapped = (await geography(page)).at(x + 60, y - 40)

    await page.touchscreen.tap(x + 60, y - 40)

    await expectNear(() => pinPlace(page), tapped, 4)
  })

  test('a finger drag moves the pin to the map centre, with no tap on top', async ({ page, context }) => {
    await explore(page)
    const { x, y } = centre(await box(page, '.leaflet-container'))
    const touch = await context.newCDPSession(page)
    const finger = (type: 'touchStart' | 'touchMove' | 'touchEnd', atX: number, atY: number) =>
      touch.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x: atX, y: atY }],
      })

    await finger('touchStart', x, y)
    for (let step = 1; step <= 10; step++) await finger('touchMove', x - step * 12, y + step * 6)
    await finger('touchEnd', x - 120, y + 60)

    await expect.poll(async () => distanceMetres(await pinPlace(page), deakTer)).toBeGreaterThan(100)
    await expectNear(() => mapCentre(page), await pinPlace(page))
  })
})
