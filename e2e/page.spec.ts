import { expect, test } from './fixtures'

test('the page at /kilato/ is titled Kilátó', async ({ page }) => {
  await page.goto('/kilato/')
  await expect(page).toHaveTitle('Kilátó')
})

test('the build serves its assets under /kilato/', async ({ page }) => {
  await page.goto('/kilato/')
  await expect(page.locator('script[type=module]')).toHaveAttribute('src', /^\/kilato\/assets\//)
})

test('Preact renders into the page', async ({ page }) => {
  await page.goto('/kilato/')
  await expect(page.locator('#app main')).toBeAttached()
})
