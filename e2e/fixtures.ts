import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test as base } from '@playwright/test'

const fixtures = join(import.meta.dirname, '../test/fixtures')

/** The site fixture's manifest, for a test that serves its own with a few fields changed. */
export const siteManifest = JSON.parse(readFileSync(join(fixtures, 'site-data/manifest.json'), 'utf8'))

const build = join(import.meta.dirname, '../dist')
const basePath = '/kilato/'
const dataPath = `${basePath}data/`

const isFile = (path: string) => statSync(path, { throwIfNoEntry: false })?.isFile() === true

// ponytail: the pathname stays encoded, so `..%2f` can't climb out of the build folder.
// A built file whose name needs encoding would fail the test. None does.
const isInBuild = (pathname: string) =>
  pathname.startsWith(basePath) && isFile(join(build, pathname.slice(basePath.length) || 'index.html'))

/** Import `test` from here: it stubs every request a page makes and fails on any it doesn't know. */
export const test = base.extend({
  context: async ({ context, baseURL }, use) => {
    const unexpected: string[] = []

    await context.route('**/*', (route) => {
      const url = new URL(route.request().url())
      if (url.hostname === 'tile.openstreetmap.org') {
        return route.fulfill({ path: join(fixtures, 'tile.png') })
      }
      const sameOrigin = url.origin === baseURL
      if (sameOrigin && url.pathname.startsWith(dataPath)) {
        const file = join(fixtures, 'site-data', url.pathname.slice(dataPath.length))
        return isFile(file) ? route.fulfill({ path: file }) : route.fulfill({ status: 404 })
      }
      if (sameOrigin && isInBuild(url.pathname)) {
        return route.continue()
      }
      unexpected.push(url.href)
      return route.abort()
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
