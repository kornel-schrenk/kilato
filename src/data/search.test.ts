import { describe, expect, it } from 'vitest'
import { loadSearchPlaces } from './search'

const places = [{ id: 'node/1', cat: 'sight', lat: 47.5, lon: 19.05, name: 'Parlament' }]

describe('loadSearchPlaces', () => {
  it('answers with the places of search.json', async () => {
    const asked: string[] = []
    const fetchData = async (url: string) => {
      asked.push(url)
      return Response.json({ places })
    }

    expect(await loadSearchPlaces(fetchData)).toEqual(places)
    expect(asked).toHaveLength(1)
    expect(asked[0]).toMatch(/data\/search\.json$/)
  })

  it('fails on a response that is not ok', async () => {
    const fetchData = async () => new Response(null, { status: 404 })

    await expect(loadSearchPlaces(fetchData)).rejects.toThrow('search.json: 404')
  })

  it('fails when the request itself fails', async () => {
    const fetchData = async () => {
      throw new TypeError('offline')
    }

    await expect(loadSearchPlaces(fetchData)).rejects.toThrow('offline')
  })
})
