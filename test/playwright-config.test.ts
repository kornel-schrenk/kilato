import { afterEach, expect, it, vi } from 'vitest'

// Each case loads @playwright/test afresh, which takes over 5 s on a busy machine.
// super-board runs several verify runs at once, so this file gets more time than the default.
const LOAD_TIMEOUT_MS = 60_000

async function executablePath() {
  vi.resetModules()
  const { default: config } = await import('../playwright.config')
  return config.use?.launchOptions?.executablePath
}

afterEach(() => {
  vi.unstubAllEnvs()
})

it('launches the browser named by CHROMIUM_PATH', async () => {
  vi.stubEnv('CHROMIUM_PATH', '/usr/bin/chromium')
  expect(await executablePath()).toBe('/usr/bin/chromium')
}, LOAD_TIMEOUT_MS)

it("launches Playwright's own Chromium when CHROMIUM_PATH is not set", async () => {
  vi.stubEnv('CHROMIUM_PATH', undefined)
  expect(await executablePath()).toBeUndefined()
}, LOAD_TIMEOUT_MS)
