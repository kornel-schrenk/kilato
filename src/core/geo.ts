export interface LatLon {
  lat: number
  lon: number
}

const earthRadius = 6371000
const radians = (degrees: number) => (degrees * Math.PI) / 180

/** The haversine distance between two points, in metres. */
export function distanceMetres(a: LatLon, b: LatLon): number {
  const dLat = radians(b.lat - a.lat)
  const dLon = radians(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * earthRadius * Math.asin(Math.sqrt(h))
}
