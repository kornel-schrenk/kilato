import { cellsWithin } from '../core/cells'
import { listRadius, type LatLon } from '../core/geo'
import type { CellFile, Manifest, Place } from '../core/types'

const dataFolder = `${import.meta.env.BASE_URL}data/`

/**
 * Loads the manifest, then the cells around the point. A loaded cell stays in memory, and what
 * failed or isn't loaded yet is asked for again on the next move or retry.
 *
 * `places` is every place loaded so far, as a new array only when a cell arrives. Read it,
 * `manifest` and `failed` after `onChange`.
 */
export function placeLoader(fetchData: (url: string) => Promise<Response>, onChange: () => void) {
  let manifest: Manifest | null = null
  let point: LatLon | null = null
  let places: Place[] = []
  let failed = false
  const loaded = new Set<string>()
  const onItsWay = new Set<string>()

  function request<T>(path: string, arrived: (file: T) => void) {
    if (onItsWay.has(path)) return
    onItsWay.add(path)
    void fetchData(dataFolder + path)
      .then((response) => {
        if (!response.ok) throw new Error(`${path}: ${response.status}`)
        return response.json() as Promise<T>
      })
      .then(arrived)
      .catch(() => {
        failed = true
      })
      .then(() => {
        onItsWay.delete(path)
        onChange()
      })
  }

  function load() {
    if (failed) {
      // Whatever failed and is still wanted gets asked for below.
      failed = false
      onChange()
    }
    if (!manifest) {
      request<Manifest>('manifest.json', (file) => {
        manifest = file
        load()
      })
    } else if (point) {
      for (const key of cellsWithin(manifest.cells, point, listRadius)) {
        if (loaded.has(key)) continue
        request<CellFile>(`cells/${key}.json`, (file) => {
          loaded.add(key)
          places = [...places, ...file.places]
        })
      }
    }
  }

  return {
    get manifest() {
      return manifest
    },
    get places() {
      return places
    },
    get failed() {
      return failed
    },
    moveTo(next: LatLon | null) {
      point = next
      load()
    },
    retry: load,
  }
}
