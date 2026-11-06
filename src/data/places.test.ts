import { describe, expect, it, vi } from 'vitest'
import { placeLoader } from './places'

const deak = { lat: 47.4975, lon: 19.0545 }
// The row 4752 starts at 47.52: 2,502 m from Deák Ferenc tér, and 1,223 m from walkedNorth.
const farKey = '4752_1270'
// The row 4751 starts at 47.51: 1,390 m from Deák Ferenc tér, and 111 m from walkedNorth.
const walkedCell = '4751_1270'
const walkedNorth = { lat: 47.509, lon: 19.0545 }

const place = (id: string) => ({ id })
const manifest = { cells: ['4749_1270', '4750_1270', walkedCell, farKey], wikiLangs: ['de'] }
const cellFiles = {
  'cells/4749_1270.json': { places: [place('a'), place('b')] },
  'cells/4750_1270.json': { places: [place('c')] },
  [`cells/${walkedCell}.json`]: { places: [place('d')] },
  [`cells/${farKey}.json`]: { places: [place('far')] },
}

/**
 * Serves these files under data/, and records each path asked for. A file missing here gets a 404.
 * Vitest's base isn't the site's, so the page tests check the /kilato/ in front.
 */
function fakeSite(served: Record<string, unknown> = { 'manifest.json': manifest, ...cellFiles }) {
  const files = { ...served }
  const asked: string[] = []
  const fetchData = async (url: string) => {
    const path = url.slice(url.indexOf('data/') + 'data/'.length)
    asked.push(path)
    return path in files ? Response.json(files[path]) : new Response(null, { status: 404 })
  }
  return { asked, fetchData, files }
}

/** Lets every answer already on its way arrive. */
const settle = () => new Promise((resolve) => setTimeout(resolve))

const ids = (loader: ReturnType<typeof placeLoader>) => loader.places.map(({ id }) => id).sort()

describe('placeLoader', () => {
  it('asks for the manifest on load, and for no cell until there is a point', async () => {
    const { asked, fetchData } = fakeSite()
    const loader = placeLoader(fetchData, () => {})

    loader.moveTo(null)
    await settle()

    expect(asked).toEqual(['manifest.json'])
    expect(loader.places).toEqual([])
    expect(loader.failed).toBe(false)
  })

  it('has no manifest until it arrives, and tells when it does', async () => {
    const { fetchData } = fakeSite()
    const onChange = vi.fn()
    const loader = placeLoader(fetchData, onChange)

    loader.moveTo(null)
    expect(loader.manifest).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
    await settle()

    expect(loader.manifest).toEqual(manifest)
    expect(onChange).toHaveBeenCalled()
  })

  it('has no manifest while it fails, and has it after a retry', async () => {
    const { fetchData, files } = fakeSite({})
    const loader = placeLoader(fetchData, () => {})
    loader.moveTo(null)
    await settle()
    expect(loader.manifest).toBeNull()

    files['manifest.json'] = manifest
    loader.retry()
    await settle()

    expect(loader.manifest).toEqual(manifest)
  })

  it('asks only for the cells within 1 km that the manifest lists', async () => {
    const { asked, fetchData } = fakeSite()
    const loader = placeLoader(fetchData, () => {})

    loader.moveTo(deak)
    await settle()

    // The circle touches other cells too, such as 4749_1269, but the manifest doesn't list them.
    expect(asked).toEqual(['manifest.json', 'cells/4749_1270.json', 'cells/4750_1270.json'])
    expect(ids(loader)).toEqual(['a', 'b', 'c'])
  })

  it('gives the start of the hours window once the manifest has arrived', async () => {
    const hoursWindowStart = '2026-11-01T23:00:00.000Z'
    const { fetchData } = fakeSite({ 'manifest.json': { ...manifest, hoursWindowStart } })
    const loader = placeLoader(fetchData, () => {})

    loader.moveTo(null)
    expect(loader.hoursWindowStart).toBeUndefined()
    await settle()

    expect(loader.hoursWindowStart).toBe(hoursWindowStart)
  })

  it('waits for a manifest still on its way, then loads the cells for the latest point', async () => {
    const { asked, fetchData } = fakeSite()
    const loader = placeLoader(fetchData, () => {})

    loader.moveTo(null)
    loader.moveTo(walkedNorth)
    loader.moveTo(deak)
    expect(asked).toEqual(['manifest.json'])
    await settle()

    expect(asked).toEqual(['manifest.json', 'cells/4749_1270.json', 'cells/4750_1270.json'])
  })

  it('asks for nothing when the point moves among loaded cells', async () => {
    const { asked, fetchData } = fakeSite()
    const loader = placeLoader(fetchData, () => {})
    loader.moveTo(deak)
    await settle()
    asked.length = 0

    loader.moveTo({ lat: deak.lat + 0.0001, lon: deak.lon })
    await settle()

    expect(asked).toEqual([])
  })

  it('asks only for the new cells when the point moves, and keeps the loaded ones in memory', async () => {
    const { asked, fetchData } = fakeSite()
    const loader = placeLoader(fetchData, () => {})
    loader.moveTo(deak)
    await settle()
    asked.length = 0

    loader.moveTo(walkedNorth)
    await settle()
    expect(asked).toEqual([`cells/${walkedCell}.json`])
    expect(ids(loader)).toEqual(['a', 'b', 'c', 'd'])
    asked.length = 0

    loader.moveTo(deak)
    await settle()
    expect(asked).toEqual([])
    expect(ids(loader)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('does not ask again for a cell still on its way', async () => {
    const { asked, fetchData } = fakeSite()
    const loader = placeLoader(fetchData, () => {})
    loader.moveTo(deak)
    await vi.waitFor(() => expect(asked).toContain('cells/4749_1270.json'))

    loader.moveTo({ lat: deak.lat + 0.0001, lon: deak.lon })
    loader.retry()
    await settle()

    expect(asked.filter((path) => path === 'cells/4749_1270.json')).toHaveLength(1)
    expect(ids(loader)).toEqual(['a', 'b', 'c'])
  })

  it('says when there is something new', async () => {
    const onChange = vi.fn()
    const { fetchData } = fakeSite()
    const loader = placeLoader(fetchData, onChange)

    loader.moveTo(deak)
    await settle()

    expect(onChange).toHaveBeenCalled()
    expect(ids(loader)).toEqual(['a', 'b', 'c'])
  })

  it('gives the same array until a cell arrives, so a list built from it stays the same', async () => {
    const { fetchData } = fakeSite()
    const loader = placeLoader(fetchData, () => {})
    loader.moveTo(deak)
    await settle()
    const before = loader.places

    loader.moveTo({ lat: deak.lat + 0.0001, lon: deak.lon })
    await settle()
    expect(loader.places).toBe(before)

    loader.moveTo(walkedNorth)
    await settle()
    expect(loader.places).not.toBe(before)
  })

  describe('the article titles in the phone language', () => {
    const germanTitles = { Q1: 'Deutscher Titel' }
    const withTitles = { 'manifest.json': manifest, ...cellFiles, 'wiki/de.json': germanTitles }
    const titleRequests = (asked: string[]) => asked.filter((path) => path.startsWith('wiki/'))

    it('asks for them once, when there is a point and the manifest lists the language', async () => {
      const { asked, fetchData } = fakeSite(withTitles)
      const loader = placeLoader(fetchData, () => {}, 'de')

      loader.moveTo(null)
      await settle()
      expect(titleRequests(asked)).toEqual([])
      expect(loader.wikiTitles).toBeNull()

      loader.moveTo(deak)
      await settle()
      expect(loader.wikiTitles).toEqual(germanTitles)

      loader.moveTo(walkedNorth)
      await settle()
      loader.retry()
      await settle()
      expect(titleRequests(asked)).toEqual(['wiki/de.json'])
    })

    it('asks for the file of the phone language, whichever the manifest lists', async () => {
      const spanishTitles = { Q1: 'Título español' }
      const { asked, fetchData } = fakeSite({
        ...withTitles,
        'manifest.json': { ...manifest, wikiLangs: ['de', 'es'] },
        'wiki/es.json': spanishTitles,
      })
      const loader = placeLoader(fetchData, () => {}, 'es')

      loader.moveTo(deak)
      await settle()

      expect(titleRequests(asked)).toEqual(['wiki/es.json'])
      expect(loader.wikiTitles).toEqual(spanishTitles)
    })

    /** A site whose titles don't arrive until `arrive` is called. */
    function siteWithLateTitles() {
      const site = fakeSite(withTitles)
      let arrive = () => {}
      const late = new Promise<void>((resolve) => {
        arrive = resolve
      })
      const fetchData = async (url: string) => {
        if (url.includes('wiki/')) await late
        return site.fetchData(url)
      }
      return { asked: site.asked, fetchData, arrive }
    }

    it('does not ask again while they are on their way', async () => {
      const { asked, fetchData, arrive } = siteWithLateTitles()
      const loader = placeLoader(fetchData, () => {}, 'de')
      loader.moveTo(deak)
      await settle()
      expect(loader.wikiTitles).toBeNull()

      loader.moveTo(walkedNorth)
      loader.retry()
      arrive()
      await settle()

      expect(titleRequests(asked)).toEqual(['wiki/de.json'])
      expect(loader.wikiTitles).toEqual(germanTitles)
    })

    it('says when they arrive', async () => {
      const onChange = vi.fn()
      const { fetchData, arrive } = siteWithLateTitles()
      const loader = placeLoader(fetchData, onChange, 'de')
      loader.moveTo(deak)
      await settle()
      expect(loader.wikiTitles).toBeNull()
      onChange.mockClear()

      arrive()
      await settle()

      expect(loader.wikiTitles).toEqual(germanTitles)
      expect(onChange).toHaveBeenCalled()
    })

    it('asks for nothing when the manifest does not list the language', async () => {
      const { asked, fetchData } = fakeSite(withTitles)
      const loader = placeLoader(fetchData, () => {}, 'fr')

      loader.moveTo(deak)
      await settle()

      expect(titleRequests(asked)).toEqual([])
      expect(loader.wikiTitles).toBeNull()
      expect(loader.failed).toBe(false)
    })

    it('reports a failed fetch, and Retry asks again', async () => {
      const { 'wiki/de.json': missing, ...withoutTitles } = withTitles
      const site = fakeSite(withoutTitles)
      const loader = placeLoader(site.fetchData, () => {}, 'de')
      loader.moveTo(deak)
      await settle()
      expect(loader.failed).toBe(true)
      expect(ids(loader)).toEqual(['a', 'b', 'c'])

      site.files['wiki/de.json'] = missing
      loader.retry()
      await settle()

      expect(loader.failed).toBe(false)
      expect(loader.wikiTitles).toEqual(germanTitles)
      expect(titleRequests(site.asked)).toEqual(['wiki/de.json', 'wiki/de.json'])
    })
  })

  describe('when a fetch fails', () => {
    const { 'cells/4749_1270.json': missing, ...withoutCell } = { 'manifest.json': manifest, ...cellFiles }

    it('reports a manifest that is not there, and Retry fetches it again', async () => {
      const onChange = vi.fn()
      const site = fakeSite({})
      const loader = placeLoader(site.fetchData, onChange)
      loader.moveTo(deak)
      await settle()
      expect(loader.failed).toBe(true)
      expect(onChange).toHaveBeenCalled()

      Object.assign(site.files, { 'manifest.json': manifest, ...cellFiles })
      loader.retry()
      expect(loader.failed).toBe(false)
      await settle()

      expect(site.asked.filter((path) => path === 'manifest.json')).toHaveLength(2)
      expect(loader.failed).toBe(false)
      expect(ids(loader)).toEqual(['a', 'b', 'c'])
    })

    it('reports a request the network dropped', async () => {
      const loader = placeLoader(() => Promise.reject(new TypeError('Failed to fetch')), () => {})
      loader.moveTo(deak)
      await settle()
      expect(loader.failed).toBe(true)
    })

    it('reports a file that is not JSON', async () => {
      const loader = placeLoader(async () => new Response('<html>'), () => {})
      loader.moveTo(deak)
      await settle()
      expect(loader.failed).toBe(true)
    })

    it('keeps the cells that did load, and Retry fetches only the one that failed', async () => {
      const site = fakeSite(withoutCell)
      const loader = placeLoader(site.fetchData, () => {})
      loader.moveTo(deak)
      await settle()
      expect(loader.failed).toBe(true)
      expect(ids(loader)).toEqual(['c'])
      site.asked.length = 0

      site.files['cells/4749_1270.json'] = missing
      loader.retry()
      await settle()

      expect(site.asked).toEqual(['cells/4749_1270.json'])
      expect(loader.failed).toBe(false)
      expect(ids(loader)).toEqual(['a', 'b', 'c'])
    })

    it('reports it again when Retry fails too', async () => {
      const site = fakeSite(withoutCell)
      const loader = placeLoader(site.fetchData, () => {})
      loader.moveTo(deak)
      await settle()

      loader.retry()
      expect(loader.failed).toBe(false)
      await settle()

      expect(loader.failed).toBe(true)
    })

    it('tries a failed cell again when the point moves and still needs it', async () => {
      const site = fakeSite(withoutCell)
      const loader = placeLoader(site.fetchData, () => {})
      loader.moveTo(deak)
      await settle()
      site.files['cells/4749_1270.json'] = missing

      loader.moveTo({ lat: deak.lat + 0.0001, lon: deak.lon })
      await settle()

      expect(loader.failed).toBe(false)
      expect(ids(loader)).toEqual(['a', 'b', 'c'])
    })

    it('tells the page when the failure clears because the point left the failed cell behind', async () => {
      const onChange = vi.fn()
      // Only the cell far north of Deák Ferenc tér exists, and it fails while the point is there.
      const site = fakeSite({ 'manifest.json': { cells: [farKey], wikiLangs: [] } })
      const loader = placeLoader(site.fetchData, onChange)
      loader.moveTo({ lat: 47.525, lon: 19.0545 })
      await settle()
      expect(loader.failed).toBe(true)
      onChange.mockClear()

      loader.moveTo(deak)

      expect(loader.failed).toBe(false)
      expect(onChange).toHaveBeenCalled()
    })
  })
})
