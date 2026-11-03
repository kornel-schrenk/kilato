import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test as base } from '@playwright/test'

const fixtures = join(import.meta.dirname, '../test/fixtures')
const dataPath = '/kilato/data/'

/** Import `test` from here: it stubs every request a page makes and fails on any it doesn't know. */
export const test = base.extend({
  context: async ({ context, baseURL }, use) => {
    const unexpected: string[] = []

    await context.route('**/*', (route) => {
      const url = new URL(route.request().url())
      if (url.hostname === 'tile.openstreetmap.org') {
        return route.fulfill({ path: join(fixtures, 'tile.png') })
      }
      if (url.origin !== baseURL) {
        unexpected.push(url.href)
        return route.abort()
      }
      if (!url.pathname.startsWith(dataPath)) {
        return route.continue()
      }
      const file = join(fixtures, 'site-data', url.pathname.slice(dataPath.length))
      return existsSync(file) ? route.fulfill({ path: file }) : route.fulfill({ status: 404 })
    })

    await context.routeWebSocket(/./, (socket) => {
      unexpected.push(socket.url())
      return socket.close()
    })

    await use(context)

    expect(unexpected, 'Requests no test should make').toEqual([])
  },
})

export { expect }
