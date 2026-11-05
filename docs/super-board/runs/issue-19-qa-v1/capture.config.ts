import { defineConfig } from '@playwright/test'

// QA's own run, apart from `npm run test:e2e`. From the repo root, after `npm run build`:
//   npx playwright test --config docs/super-board/runs/issue-19-qa-v1/capture.config.ts
process.env.PREVIEW_PORT ??= String(4173 + (process.pid % 1000))
const port = process.env.PREVIEW_PORT
const origin = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: '.',
  testMatch: 'capture.spec.ts',
  outputDir: '../../../../test-results/issue-19-qa',
  reporter: 'line',
  workers: 1,
  timeout: 90_000,
  use: {
    baseURL: origin,
    launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined },
    serviceWorkers: 'block',
  },
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `${origin}/kilato/`,
    cwd: '../../../..',
  },
})
