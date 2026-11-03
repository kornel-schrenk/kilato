import { afterEach, expect, it, vi } from 'vitest'

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
})

it("launches Playwright's own Chromium when CHROMIUM_PATH is not set", async () => {
  vi.stubEnv('CHROMIUM_PATH', undefined)
  expect(await executablePath()).toBeUndefined()
})
