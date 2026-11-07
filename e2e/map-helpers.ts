import type { Page } from '@playwright/test'
import { distanceMetres, type LatLon } from '../src/core/geo'
import { expect } from './fixtures'

export const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })

export type Box = { x: number; y: number; width: number; height: number }

// One evaluate, so the read can't fall between Leaflet removing a layer and adding its
// replacement. locator.boundingBox() finds the element and measures it in two steps, and
// it returns null when the layer is replaced in between. expect.poll doesn't retry a throw.
export async function box(page: Page, selector: string): Promise<Box> {
  const found = await page.evaluate((target) => {
    const rect = document.querySelector(target)?.getBoundingClientRect()
    return rect && { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  }, selector)
  if (!found) throw new Error(`${selector} is not on the page`)
  return found
}

// Reads the map's geography off a tile, so the tests need no hook into Leaflet. Only a tile of
// the current zoom is 256 px wide: after a gap in the frames, Leaflet can keep the level it
// zoomed from under the new one, scaled, until the next move. Waits out a zoom animation too.
export async function geography(page: Page) {
  const found = await page.waitForFunction(() => {
    const image = [...document.querySelectorAll<HTMLImageElement>('img.leaflet-tile-loaded')].find(
      (tile) => tile.getBoundingClientRect().width === 256,
    )
    if (!image) return null
    const [z, x, y] = new URL(image.src).pathname.slice(1).replace('.png', '').split('/').map(Number)
    const { left, top } = image.getBoundingClientRect()
    return { z, x, y, left, top }
  })
  const tile = (await found.jsonValue())!
  const size = 256 * 2 ** tile.z
  return {
    zoom: tile.z,
    /** The place under a point on the screen. */
    at(screenX: number, screenY: number): LatLon {
      const worldX = tile.x * 256 + screenX - tile.left
      const worldY = tile.y * 256 + screenY - tile.top
      return {
        lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * worldY) / size))) * 180) / Math.PI,
        lon: (worldX / size) * 360 - 180,
      }
    },
    /** The point on the screen over a place. */
    screen({ lat, lon }: LatLon) {
      const worldX = ((lon + 180) / 360) * size
      const sine = Math.sin((lat * Math.PI) / 180)
      const worldY = (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * size
      return { x: worldX - tile.x * 256 + tile.left, y: worldY - tile.y * 256 + tile.top }
    },
  }
}

export const centre = ({ x, y, width, height }: Box) => ({ x: x + width / 2, y: y + height / 2 })

export async function mapCentre(page: Page) {
  const { x, y } = centre(await box(page, '.leaflet-container'))
  return (await geography(page)).at(x, y)
}

/** The tip of the pin. */
export async function pinPlace(page: Page) {
  const { x, y, width, height } = await box(page, '.pin')
  return (await geography(page)).at(x + width / 2, y + height)
}

export async function circlePlace(page: Page, selector: string) {
  const { x, y } = centre(await box(page, selector))
  return (await geography(page)).at(x, y)
}

/** A circle's radius in metres: from its centre to its right edge. */
export async function circleRadius(page: Page, selector: string) {
  const found = await box(page, selector)
  const { x, y } = centre(found)
  const place = await geography(page)
  return distanceMetres(place.at(x, y), place.at(found.x + found.width, y))
}

/** Waits until a place, read from the page, is within `metres` of the target. */
export async function expectNear(read: () => Promise<LatLon>, target: LatLon, metres = 5) {
  await expect.poll(async () => distanceMetres(await read(), target)).toBeLessThan(metres)
}

/**
 * Presses a zoom button and waits for the zoom to finish. The new level's tiles appear as the
 * 250 ms animation starts, and Leaflet ignores another press or a drag until it ends.
 */
export async function zoomTo(page: Page, zoom: number) {
  const current = (await geography(page)).zoom
  await page.locator(`.leaflet-control-zoom-${zoom > current ? 'in' : 'out'}`).click()
  await expect.poll(async () => (await geography(page)).zoom).toBe(zoom)
  await expect(page.locator('.leaflet-zoom-anim')).toHaveCount(0)
}
