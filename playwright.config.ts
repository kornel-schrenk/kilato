import { defineConfig } from '@playwright/test'

// Each run gets its own port. super-board runs verify in several worktrees at once,
// and a shared port would test another checkout's build. Workers inherit the variable.
process.env.PREVIEW_PORT ??= String(4173 + (process.pid % 1000))
const port = process.env.PREVIEW_PORT
const origin = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: 'e2e',
  use: {
    baseURL: origin,
    launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined },
    // Playwright's routes don't see requests a service worker answers.
    serviceWorkers: 'block',
  },
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `${origin}/kilato/`,
  },
})
