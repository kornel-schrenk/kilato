export interface LatLon {
  lat: number
  lon: number
}

/** How far from the point a place still counts as near it, in metres. */
export const listRadius = 1000

const earthRadius = 6371000
const radians = (degrees: number) => (degrees * Math.PI) / 180

/** The haversine distance between two points, in metres. */
export function distanceMetres(a: LatLon, b: LatLon): number {
  const dLat = radians(b.lat - a.lat)
  const dLon = radians(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * earthRadius * Math.asin(Math.sqrt(h))
}

/** The places within `metres` of a point, nearest first. Places at the same distance keep their order. */
export function nearby<T extends LatLon>(places: T[], point: LatLon, metres: number): { place: T; metres: number }[] {
  return places
    .map((place) => ({ place, metres: distanceMetres(point, place) }))
    .filter((row) => row.metres <= metres)
    .sort((a, b) => a.metres - b.metres)
}
