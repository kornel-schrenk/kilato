import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: '/kilato/',
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts', 'test/**/*.test.ts'],
    env: { TZ: 'Europe/Budapest' },
  },
})
