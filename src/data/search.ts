import type { SearchFile } from '../core/types'
import { readDataFile } from './file'

/** Loads search.json and answers with its places. A failed request or response rejects. */
export async function loadSearchPlaces(
  fetchData: (url: string) => Promise<Response> = (url) => fetch(url),
): Promise<SearchFile['places']> {
  const file = await readDataFile<SearchFile>(fetchData, 'search.json')
  return file.places
}
