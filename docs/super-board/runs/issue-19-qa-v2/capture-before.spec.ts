import { join } from 'node:path'
import { expect, test } from '../../../../e2e/fixtures'
import { button } from '../../../../e2e/map-helpers'

// The Before column of the PR: the base branch, with no search box. See capture.config.ts.
for (const [name, viewport] of [
  ['desktop', { width: 1920, height: 1080 }],
  ['tablet', { width: 1024, height: 768 }],
  ['mobile', { width: 375, height: 667 }],
] as const) {
  test.describe(name, () => {
    test.use({ viewport })

    test('the header, with no search box', async ({ page }) => {
      await page.goto('/kilato/')
      await button(page, 'Explore the map').click()
      await expect(page.locator('.place').first()).toBeVisible()
      await expect(page.locator('header input')).toHaveCount(0)
      await page.screenshot({ path: join(import.meta.dirname, `before-develop-${name}.png`) })
    })
  })
}
