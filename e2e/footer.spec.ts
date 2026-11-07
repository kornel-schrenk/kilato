import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { expect, siteManifest, test } from './fixtures'
import { box, button } from './map-helpers'

// The fixture's osmDataAt and wikipediaAt.
const dataDate = '2026-11-02T03:17:00.000Z'
const dayMs = 24 * 60 * 60 * 1000

// Pinned, because the date on the page is the phone's local date.
test.use({ timezoneId: 'Europe/Budapest' })

const footer = (page: Page) => page.getByRole('contentinfo')
const ageLine = (page: Page) => footer(page).locator('.data-age')

/** Opens the page with the clock this long after the fixture's data date. */
async function openAged(page: Page, days: number) {
  await page.clock.setFixedTime(new Date(Date.parse(dataDate) + days * dayMs))
  await page.goto('/kilato/')
}

const noBackground = 'rgba(0, 0, 0, 0)'

test.describe('the data age', () => {
  for (const { days, text } of [
    { days: 3, text: 'Data from 2 Nov 2026 · 3 days old' },
    { days: 1, text: 'Data from 2 Nov 2026 · 1 day old' },
    { days: 0, text: 'Data from 2 Nov 2026 · 0 days old' },
    { days: 10, text: 'Data from 2 Nov 2026 · 10 days old' },
  ]) {
    test(`${days} days after the data date, the line reads "${text}", with no warning`, async ({ page }) => {
      await openAged(page, days)
      await expect(ageLine(page)).toHaveText(text)
      await expect(ageLine(page)).toHaveCSS('background-color', noBackground)
    })
  }

  test('11 days after the data date, the line turns into a warning', async ({ page }) => {
    await openAged(page, 11)
    await expect(ageLine(page)).toHaveText('Data from 2 Nov 2026 · 11 days old · may be out of date')
    await expect(ageLine(page)).not.toHaveCSS('background-color', noBackground)
  })

  test('10 and a half days after the data date, the line warns, though it counts 10 whole days', async ({ page }) => {
    await openAged(page, 10.5)
    await expect(ageLine(page)).toHaveText('Data from 2 Nov 2026 · 10 days old · may be out of date')
    await expect(ageLine(page)).not.toHaveCSS('background-color', noBackground)
  })

  for (const older of ['osmDataAt', 'wikipediaAt']) {
    test(`takes ${older} when it is the older date`, async ({ page }) => {
      await page.route('**/kilato/data/manifest.json', (route) =>
        route.fulfill({ json: { ...siteManifest, [older]: '2026-10-28T12:00:00.000Z' } }),
      )
      await page.clock.setFixedTime('2026-11-05T12:00:00.000Z')
      await page.goto('/kilato/')
      await expect(ageLine(page)).toHaveText('Data from 28 Oct 2026 · 8 days old')
    })
  }

  test.describe('on a Hungarian phone', () => {
    test.use({ locale: 'hu-HU' })

    test('3 days after the data date, the line is in Hungarian', async ({ page }) => {
      await openAged(page, 3)
      await expect(ageLine(page)).toHaveText('Adatok: 2026. nov. 2. · 3 napos')
      await expect(ageLine(page)).toHaveCSS('background-color', noBackground)
    })

    test('11 days after the data date, the warning is in Hungarian', async ({ page }) => {
      await openAged(page, 11)
      await expect(ageLine(page)).toHaveText('Adatok: 2026. nov. 2. · 11 napos · lehet, hogy elavult')
      await expect(ageLine(page)).not.toHaveCSS('background-color', noBackground)
    })
  })

  test('the line follows the language switch', async ({ page }) => {
    await openAged(page, 3)
    await expect(ageLine(page)).toHaveText('Data from 2 Nov 2026 · 3 days old')

    await button(page, 'HU').click()

    await expect(ageLine(page)).toHaveText('Adatok: 2026. nov. 2. · 3 napos')
  })

  test('with no manifest there is no line, and the links still work', async ({ page }) => {
    await page.route('**/kilato/data/manifest.json', (route) => route.abort())
    await page.goto('/kilato/')
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(ageLine(page)).toHaveCount(0)

    await footer(page).getByRole('button', { name: 'About', exact: true }).click()

    await expect(page.getByRole('dialog', { name: 'About' })).toBeVisible()
  })
})

// The spec's section, read here so the test can't drift from it: a bold title, then its bullets.
const spec = readFileSync(join(import.meta.dirname, '../spec/2026-11-02-kilato-mvp.md'), 'utf8')
const section = spec.slice(spec.indexOf('### What is sent where'), spec.indexOf('### About'))
const panelTexts = section
  .split(/^(?=\*\*[^*]+\*\*$)/m)
  .slice(1)
  .map((block) => {
    const [first, ...rest] = block.trim().split('\n')
    const bullets = rest.filter((line) => line.startsWith('- ')).map((line) => line.slice(2))
    return {
      title: first.replaceAll('**', ''),
      lines: bullets.map((line) => line.replaceAll('**', '')),
      bold: bullets.flatMap((line) => line.match(/(?<=\*\*)[^*]+(?=\*\*)/) ?? []),
    }
  })

const panels = [
  { locale: 'en-GB', ...panelTexts[0], close: 'Close', about: 'About' },
  { locale: 'hu-HU', ...panelTexts[1], close: 'Bezárás', about: 'Névjegy' },
]

test('the spec has the two panel texts this test reads', () => {
  expect(panelTexts.map(({ title, lines, bold }) => [title, lines.length, bold.length])).toEqual([
    ['What is sent where', 5, 4],
    ['Mi hová kerül', 5, 4],
  ])
})

for (const { locale, title, lines, bold, close, about } of panels) {
  test.describe(`What is sent where on a phone set to ${locale}`, () => {
    test.use({ locale })

    const expectSpecText = async (page: Page) => {
      const panel = page.getByRole('dialog', { name: title })
      await expect(panel.getByRole('heading')).toHaveText(title)
      await expect(panel.getByRole('listitem')).toHaveText(lines)
      await expect(panel.locator('strong')).toHaveText(bold)
    }

    test('opens from the footer with the text of the spec, word for word', async ({ page }) => {
      await page.goto('/kilato/')

      await footer(page).getByRole('button', { name: title, exact: true }).click()

      await expectSpecText(page)
    })

    test('opens from the intro with the same text', async ({ page }) => {
      await page.goto('/kilato/')

      await page.getByRole('main').getByRole('button', { name: title, exact: true }).click()

      await expectSpecText(page)
    })

    test('Close shuts it and gives the focus back', async ({ page }) => {
      await page.goto('/kilato/')
      const opener = footer(page).getByRole('button', { name: title, exact: true })
      await opener.click()

      await page.getByRole('dialog').getByRole('button', { name: close, exact: true }).click()

      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(opener).toBeFocused()
    })

    test('the footer holds both links', async ({ page }) => {
      await page.goto('/kilato/')
      await expect(footer(page).getByRole('button')).toHaveText([title, about])
    })
  })
}

test.describe('the panels', () => {
  test('Esc shuts a panel, and it opens again', async ({ page }) => {
    await page.goto('/kilato/')
    const opener = footer(page).getByRole('button', { name: 'What is sent where', exact: true })
    await opener.click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await opener.click()
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  test('the intro link goes with the intro, and the footer link stays', async ({ page }) => {
    await page.goto('/kilato/')
    const name = { name: 'What is sent where', exact: true }
    await expect(page.getByRole('main').getByRole('button', name)).toBeVisible()

    await button(page, 'Explore the map').click()

    await expect(page.locator('.pin')).toBeVisible()
    await expect(page.getByRole('main').getByRole('button', name)).toHaveCount(0)
    await expect(footer(page).getByRole('button', name)).toBeVisible()
  })

  test('a panel opened after the language switch is in the new language', async ({ page }) => {
    await page.goto('/kilato/')

    await button(page, 'HU').click()
    await footer(page).getByRole('button', { name: 'Mi hová kerül', exact: true }).click()

    await expect(page.getByRole('dialog', { name: 'Mi hová kerül' }).getByRole('listitem').first()).toHaveText(
      panelTexts[1].lines[0],
    )
  })

  test('opening a panel asks for nothing', async ({ page }) => {
    await page.goto('/kilato/')
    await expect(ageLine(page)).toBeVisible()
    const requests: string[] = []
    page.on('request', (request) => requests.push(request.url()))

    await footer(page).getByRole('button', { name: 'What is sent where', exact: true }).click()
    await page.keyboard.press('Escape')
    await footer(page).getByRole('button', { name: 'About', exact: true }).click()

    await expect(page.getByRole('dialog', { name: 'About' })).toBeVisible()
    expect(requests).toEqual([])
  })
})

for (const { locale, about, sentences, linkName } of [
  {
    locale: 'en-GB',
    about: 'About',
    linkName: 'The code is on GitHub.',
    sentences: [
      /open source.*MIT licence/,
      /Map and place data.*© OpenStreetMap contributors.*Open Database License/,
      /titles and positions.*Wikipedia.*CC BY-SA 4\.0/,
      /drawn with Leaflet/,
    ],
  },
  {
    locale: 'hu-HU',
    about: 'Névjegy',
    linkName: 'A kód a GitHubon van.',
    sentences: [
      /nyílt forráskódú.*MIT-licenc/,
      /térkép és a helyek adatai.*© az OpenStreetMap közreműködői.*Open Database License/,
      /címei és helyzete.*Wikipédiából.*CC BY-SA 4\.0/,
      /Leaflet rajzolja/,
    ],
  },
]) {
  test.describe(`About on a phone set to ${locale}`, () => {
    test.use({ locale })

    test('opens from the footer and names the licences, the sources and Leaflet', async ({ page }) => {
      await page.goto('/kilato/')

      await footer(page).getByRole('button', { name: about, exact: true }).click()

      const panel = page.getByRole('dialog', { name: about })
      await expect(panel.getByRole('heading', { level: 2 })).toHaveText(about)
      for (const sentence of sentences) await expect(panel).toContainText(sentence)
    })

    test('links the repository, in a new tab', async ({ page }) => {
      await page.goto('/kilato/')

      await footer(page).getByRole('button', { name: about, exact: true }).click()

      const link = page.getByRole('dialog').getByRole('link', { name: linkName })
      await expect(link).toHaveAttribute('href', 'https://github.com/kornel-schrenk/kilato')
      await expect(link).toHaveAttribute('target', '_blank')
    })
  })
}

// What About has to carry, read here so the tests can't drift from the installed packages.
const root = join(import.meta.dirname, '..')
const dependencies = Object.keys(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).dependencies)
const licenceOf = (name: string) => readFileSync(join(root, 'node_modules', name, 'LICENSE'), 'utf8')

const openAbout = async (page: Page, about: string) => {
  await page.goto('/kilato/')
  await footer(page).getByRole('button', { name: about, exact: true }).click()
  return page.getByRole('dialog', { name: about })
}

/** An entry by its package's name. The page writes the name with a capital. */
const entry = (panel: Locator, name: string) =>
  panel.locator('details').filter({ has: panel.page().locator('summary', { hasText: new RegExp(`^${name}$`, 'i') }) })

for (const { locale, about, softwareUsed, close } of [
  { locale: 'en-GB', about: 'About', softwareUsed: 'Software used', close: 'Close' },
  { locale: 'hu-HU', about: 'Névjegy', softwareUsed: 'Felhasznált szoftverek', close: 'Bezárás' },
]) {
  test.describe(`Software used on a 375×667 phone set to ${locale}`, () => {
    test.use({ locale, viewport: { width: 375, height: 667 } })

    test('has its heading, with a Leaflet entry and a Preact entry, both closed', async ({ page }) => {
      const panel = await openAbout(page, about)

      await expect(panel.getByRole('heading', { level: 3 })).toHaveText(softwareUsed)
      await expect(panel.locator('summary')).toHaveText(['Leaflet', 'Preact'])
      await expect(panel.locator('details[open]')).toHaveCount(0)
      await expect(entry(panel, 'leaflet').locator('pre')).toBeHidden()
      await expect(entry(panel, 'preact').locator('pre')).toBeHidden()
    })

    test('Close is in view without scrolling', async ({ page }) => {
      const panel = await openAbout(page, about)

      await expect(panel.getByRole('button', { name: close, exact: true })).toBeInViewport({ ratio: 1 })
      expect(await panel.evaluate((dialog) => dialog.scrollTop)).toBe(0)
    })

    for (const name of dependencies) {
      test(`the ${name} entry opens to its LICENSE file, word for word, in English`, async ({ page }) => {
        const panel = await openAbout(page, about)

        await entry(panel, name).locator('summary').click()

        const text = entry(panel, name).locator('pre')
        await expect(text).toBeVisible()
        // With a string, toHaveText collapses runs of white space on both sides and matches the whole text.
        await expect(text).toHaveText(licenceOf(name))
        await expect(text).toHaveAttribute('lang', 'en')
      })
    }
  })
}

test.describe('Software used', () => {
  test('has an entry for every package in dependencies', async ({ page }) => {
    const panel = await openAbout(page, 'About')

    await expect(panel.locator('summary')).toHaveText(dependencies, { ignoreCase: true })
  })

  test('opening an entry asks for nothing', async ({ page }) => {
    const panel = await openAbout(page, 'About')
    await expect(panel).toBeVisible()
    const requests: string[] = []
    page.on('request', (request) => requests.push(request.url()))

    await entry(panel, 'leaflet').locator('summary').click()
    await entry(panel, 'preact').locator('summary').click()

    await expect(entry(panel, 'preact').locator('pre')).toBeVisible()
    expect(requests).toEqual([])
  })

  test.describe('at 375×667', () => {
    test.use({ viewport: { width: 375, height: 667 } })

    test('an entry is at least 44 px tall, to tap', async ({ page }) => {
      const panel = await openAbout(page, 'About')

      await expect(panel.locator('summary')).toHaveCount(dependencies.length)
      for (const summary of await panel.locator('summary').all()) {
        expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(44)
      }
    })

    test('with both entries open, the panel fits the screen, nothing scrolls sideways, and Close shuts it', async ({
      page,
    }) => {
      const panel = await openAbout(page, 'About')

      await entry(panel, 'leaflet').locator('summary').click()
      await entry(panel, 'preact').locator('summary').click()

      await expect(entry(panel, 'preact').locator('pre')).toBeVisible()
      const dialog = await box(page, 'dialog')
      expect(dialog.x).toBeGreaterThanOrEqual(0)
      expect(dialog.x + dialog.width).toBeLessThanOrEqual(375)
      expect(dialog.y).toBeGreaterThanOrEqual(0)
      expect(dialog.y + dialog.height).toBeLessThanOrEqual(667)
      expect(await panel.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0)

      await panel.getByRole('button', { name: 'Close', exact: true }).click()

      await expect(page.getByRole('dialog')).toHaveCount(0)
    })
  })
})

test.describe('the layout', () => {
  test.describe('at 375 px wide', () => {
    test.use({ viewport: { width: 375, height: 667 } })

    test('the footer comes last, under the list, and nothing scrolls sideways', async ({ page }) => {
      await openAged(page, 11)
      await expect(ageLine(page)).toBeVisible()

      const main = await box(page, 'main')
      const footerBox = await box(page, 'footer')
      expect(footerBox.y).toBeGreaterThanOrEqual(main.y + main.height)
      expect(footerBox.width).toBe(375)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375)
    })

    test('a panel fits the screen', async ({ page }) => {
      await page.goto('/kilato/')

      await footer(page).getByRole('button', { name: 'What is sent where', exact: true }).click()

      await expect(page.getByRole('dialog')).toBeVisible()
      const panel = await box(page, 'dialog')
      expect(panel.x).toBeGreaterThanOrEqual(0)
      expect(panel.x + panel.width).toBeLessThanOrEqual(375)
      expect(panel.y).toBeGreaterThanOrEqual(0)
      expect(panel.y + panel.height).toBeLessThanOrEqual(667)
    })
  })

  test.describe('at 1280 px wide', () => {
    test.use({ viewport: { width: 1280, height: 720 } })

    test('the footer sits at the bottom of the right column, and the map keeps its size', async ({ page }) => {
      await openAged(page, 3)
      await expect(ageLine(page)).toBeVisible()

      const footerBox = await box(page, 'footer')
      expect(footerBox.x).toBe(1280 * 0.6)
      expect(footerBox.width).toBe(1280 * 0.4)
      expect(footerBox.y + footerBox.height).toBe(720)
      // The spare height goes to the list, so the links reach that edge, not the top of a stretched footer.
      const link = await box(page, 'footer button:last-of-type')
      expect(720 - (link.y + link.height)).toBeLessThan(16)
      expect(await box(page, '.leaflet-container')).toEqual({ x: 0, y: 0, width: 1280 * 0.6, height: 720 })
    })
  })
})
