/** The key of the 0.01° by 0.015° cell around a point. The build and the page must share it. */
export function cellKey(lat: number, lon: number): string {
  return `${Math.floor(lat * 100)}_${Math.floor((lon * 200) / 3)}`
}
