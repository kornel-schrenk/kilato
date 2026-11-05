import { distanceMetres } from '../src/core/geo'
import { expect, test } from './fixtures'
import { button, expectNear, mapCentre, pinPlace } from './map-helpers'

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
