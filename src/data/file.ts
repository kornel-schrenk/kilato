export const dataFolder = `${import.meta.env.BASE_URL}data/`

/** Reads one data file as JSON. A response that is not ok is a failure, like a request that fails. */
export async function readDataFile<T>(fetchData: (url: string) => Promise<Response>, path: string): Promise<T> {
  const response = await fetchData(dataFolder + path)
  if (!response.ok) throw new Error(`${path}: ${response.status}`)
  return (await response.json()) as T
}
