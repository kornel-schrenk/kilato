import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

const hungarian = 'A Kilátó megmutatja, mi érdekes 1 km-en belül körülötted.'
const english = "Kilátó shows what's interesting within 1 km of you."
const langChoice = 'kilato.lang'

const switchButton = (page: Page, name: 'HU' | 'EN') => page.getByRole('button', { name, exact: true })

for (const { locale, lang, text } of [
  { locale: 'hu-HU', lang: 'hu', text: hungarian },
  { locale: 'de-AT', lang: 'en', text: english },
  { locale: 'en-GB', lang: 'en', text: english },
]) {
  test.describe(`with the locale ${locale}`, () => {
    test.use({ locale })

    test(`the page is in the language ${lang}`, async ({ page }) => {
      await page.goto('/kilato/')
      await expect(page.getByText(text)).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('lang', lang)
    })
  })
}

for (const { languages, lang, text } of [
  { languages: ['de-AT', 'hu-HU'], lang: 'en', text: english },
  { languages: ['hu-HU', 'de-AT'], lang: 'hu', text: hungarian },
]) {
  test(`with the phone languages ${languages.join(', ')}, only the first counts`, async ({ page }) => {
    await page.addInitScript((list) => {
      Object.defineProperty(navigator, 'languages', { get: () => list })
    }, languages)
    await page.goto('/kilato/')
    await expect(page.getByText(text)).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', lang)
  })
}

for (const { locale, press, other, lang, before, after } of [
  { locale: 'hu-HU', press: 'EN', other: 'HU', lang: 'en', before: hungarian, after: english },
  { locale: 'en-GB', press: 'HU', other: 'EN', lang: 'hu', before: english, after: hungarian },
] as const) {
  test.describe(`on a phone set to ${locale}`, () => {
    test.use({ locale })

    test(`pressing ${press} switches at once and survives a reload`, async ({ page }) => {
      await page.goto('/kilato/')
      await expect(page.getByText(before)).toBeVisible()
      await expect(switchButton(page, other)).toHaveAttribute('aria-pressed', 'true')

      await switchButton(page, press).click()

      // Plain reads, which don't retry: the change must already be there.
      expect(await page.locator('main').textContent()).toContain(after)
      expect(await page.locator('html').getAttribute('lang')).toBe(lang)
      await expect(page.getByText(before)).toBeHidden()
      await expect(switchButton(page, press)).toHaveAttribute('aria-pressed', 'true')
      await expect(switchButton(page, other)).toHaveAttribute('aria-pressed', 'false')
      expect(await page.evaluate((key) => localStorage.getItem(key), langChoice)).toBe(lang)

      await page.reload()

      await expect(page.getByText(after)).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('lang', lang)
    })
  })
}

test.describe('on a phone set to hu-HU', () => {
  test.use({ locale: 'hu-HU' })

  test('opening the page saves nothing, so a later phone language still counts', async ({ page }) => {
    await page.goto('/kilato/')
    await expect(page.getByText(hungarian)).toBeVisible()
    expect(await page.evaluate(() => localStorage.length)).toBe(0)
  })

  test('pressing back to the phone language is kept too', async ({ page }) => {
    await page.goto('/kilato/')

    await switchButton(page, 'EN').click()
    await expect(page.getByText(english)).toBeVisible()
    await switchButton(page, 'HU').click()
    await expect(page.getByText(hungarian)).toBeVisible()
    expect(await page.evaluate((key) => localStorage.getItem(key), langChoice)).toBe('hu')

    await page.reload()

    await expect(page.getByText(hungarian)).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'hu')
  })

  test('the name of the switch changes with the language', async ({ page }) => {
    await page.goto('/kilato/')
    await expect(page.getByRole('group', { name: 'Nyelv' })).toBeVisible()

    await switchButton(page, 'EN').click()

    await expect(page.getByRole('group', { name: 'Language' })).toBeVisible()
  })

  test('the page keeps working when the browser blocks localStorage', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new DOMException('Blocked', 'SecurityError')
        },
      })
    })
    await page.goto('/kilato/')
    await expect(page.getByText(hungarian)).toBeVisible()

    await switchButton(page, 'EN').click()

    await expect(page.getByText(english)).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  })
})
