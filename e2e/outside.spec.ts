import { distanceMetres } from '../src/core/geo'
import { expect, test } from './fixtures'
import { box, button, centre, expectNear, geography, mapCentre, pinPlace, zoomTo } from './map-helpers'

const vienna = { lat: 48.2082, lon: 16.3738 }
const deakTer = { lat: 47.4975, lon: 19.0545 }

const messages = [
  { locale: 'en-GB', message: 'Kilátó covers Budapest only for now.', go: 'Go to Budapest', other: 'Tap or drag the map' },
  { locale: 'hu-HU', message: 'A Kilátó egyelőre csak Budapestet ismeri.', go: 'Irány Budapest', other: 'Koppints a térképre' },
]

for (const { locale, message, go, other } of messages) {
  test.describe(`with the location in Vienna and the locale ${locale}`, () => {
    test.use({
      locale,
      geolocation: { latitude: vienna.lat, longitude: vienna.lon, accuracy: 10 },
      permissions: ['geolocation'],
    })

    test('replaces the list with the message, and the button starts exploring at Deák Ferenc tér', async ({ page }) => {
      await page.goto('/kilato/')
      await expect(page.getByText(message)).toBeVisible()
      await expect(page.locator('.places')).toHaveCount(0)
      await expect(page.locator('.leaflet-container')).toBeVisible()
      expect(distanceMetres(await mapCentre(page), vienna)).toBeLessThan(50)

      await button(page, go).click()

      await expect(page.getByText(message)).toBeHidden()
      await expect(page.getByText(other)).toBeVisible()
      await expect(page.locator('.place').first()).toBeVisible()
      await expectNear(() => pinPlace(page), deakTer, 3)
    })
  })
}

test.describe('with the location in Vienna on a phone', () => {
  test.use({
    locale: 'en-GB',
    geolocation: { latitude: vienna.lat, longitude: vienna.lon, accuracy: 10 },
    permissions: ['geolocation'],
    viewport: { width: 375, height: 667 },
  })

  test('Go to Budapest is as tall as the other buttons', async ({ page }) => {
    await page.goto('/kilato/')

    await expect(page.getByText('Kilátó covers Budapest only for now.')).toBeVisible()
    expect((await button(page, 'Go to Budapest').boundingBox())!.height).toBeGreaterThanOrEqual(44)
  })
})

// The spec's Start zoom: 14 below 900 px wide, 15 from there, and Go to Budapest starts exploring at Deák Ferenc tér.
for (const { width, zoom } of [
  { width: 899, zoom: 14 },
  { width: 900, zoom: 15 },
]) {
  test.describe(`with the location in Vienna at ${width} px wide`, () => {
    test.use({
      locale: 'en-GB',
      geolocation: { latitude: vienna.lat, longitude: vienna.lon, accuracy: 10 },
      permissions: ['geolocation'],
      viewport: { width, height: 700 },
    })

    test(`Go to Budapest starts at zoom ${zoom}, whatever the zoom was`, async ({ page }) => {
      await page.goto('/kilato/')
      await expect(page.getByText('Kilátó covers Budapest only for now.')).toBeVisible()
      await expect.poll(async () => (await geography(page)).zoom).toBe(zoom)
      await zoomTo(page, zoom + 1)

      await button(page, 'Go to Budapest').click()

      await expectNear(() => pinPlace(page), deakTer, 3)
      await expect.poll(async () => (await geography(page)).zoom).toBe(zoom)
    })
  })
}

test.describe('while exploring', () => {
  const message = 'Kilátó covers Budapest only for now.'

  test.use({ locale: 'en-GB' })

  test('the message follows the tapped point out of the box and back', async ({ page }) => {
    await page.goto('/kilato/')
    await button(page, 'Explore the map').click()
    await expect(page.locator('.place').first()).toBeVisible()
    for (const zoom of [14, 13, 12, 11, 10]) await zoomTo(page, zoom)
    const area = await box(page, '.leaflet-container')
    const middle = centre(area)

    await page.mouse.click(area.x + area.width - 20, middle.y)
    await expect(page.getByText(message)).toBeVisible()
    await expect(page.locator('.places')).toHaveCount(0)

    await page.mouse.click(middle.x, middle.y)
    await expect(page.locator('.place').first()).toBeVisible()
    await expect(page.getByText(message)).toHaveCount(0)
  })

  test('the map takes a tap and a drag while the message is up', async ({ page }) => {
    await page.goto('/kilato/')
    await button(page, 'Explore the map').click()
    await expect(page.locator('.place').first()).toBeVisible()
    for (const zoom of [14, 13, 12, 11, 10]) await zoomTo(page, zoom)
    const area = await box(page, '.leaflet-container')
    const middle = centre(area)
    await page.mouse.click(area.x + area.width - 20, middle.y)
    await expect(page.getByText(message)).toBeVisible()
    const tapped = await pinPlace(page)

    await page.mouse.click(area.x + area.width - 60, middle.y - 40)
    await expect.poll(async () => distanceMetres(await pinPlace(page), tapped)).toBeGreaterThan(1000)
    const before = await mapCentre(page)
    await page.mouse.move(middle.x, middle.y)
    await page.mouse.down()
    await page.mouse.move(middle.x - 300, middle.y, { steps: 12 })
    await page.mouse.up()

    await expect.poll(async () => distanceMetres(await mapCentre(page), before)).toBeGreaterThan(1000)
    await expect(page.getByText(message)).toBeVisible()
    expect((await geography(page)).zoom).toBe(10)
  })
})
