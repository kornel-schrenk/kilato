import { afterEach, expect, it, vi } from 'vitest'
import { previewPort } from '../e2e/preview-port'

// The ports the Fetch standard blocks (https://fetch.spec.whatwg.org/#port-blocking),
// as far as they can fall in a range of ports a test run may pick.
const BAD_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102,
  103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465,
  512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993,
  995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668,
  6669, 6679, 6697, 10080,
])

afterEach(() => {
  vi.unstubAllEnvs()
})

it('picks no port that browsers refuse, for any pid', () => {
  const bad = []
  for (let remainder = 0; remainder < 1000; remainder++) {
    if (BAD_PORTS.has(previewPort(remainder))) bad.push(remainder)
  }
  expect(bad).toEqual([])
})

it('gives at least 900 different ports across the pids, so parallel worktrees stay apart', () => {
  const ports = new Set<number>()
  for (let remainder = 0; remainder < 1000; remainder++) ports.add(previewPort(remainder))
  expect(ports.size).toBeGreaterThanOrEqual(900)
})

it('keeps PREVIEW_PORT as the port when it is set, and passes it to workers', async () => {
  vi.stubEnv('PREVIEW_PORT', '5060')
  vi.resetModules()
  const { default: config } = await import('../playwright.config')
  expect(process.env.PREVIEW_PORT).toBe('5060')
  expect(config.use?.baseURL).toBe('http://127.0.0.1:5060')
  expect(config.webServer).toMatchObject({ command: expect.stringContaining('--port 5060') })
}, 60_000)
