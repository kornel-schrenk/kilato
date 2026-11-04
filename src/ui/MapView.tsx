import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'preact/hooks'
import type { LatLon } from '../core/geo'
import { deakTer, startZoom, type PointEvent, type PointState } from '../core/point'
import type { en } from '../i18n/en'

const pointColor = '#1a56c4'
const kmRadius = 1000

// The tip of the pin is its bottom centre, so the anchor sits exactly on the point.
const pin = L.divIcon({
  className: 'pin',
  iconSize: [30, 40],
  iconAnchor: [15, 40],
  html: `<svg viewBox="0 0 30 40" width="30" height="40" aria-hidden="true">
    <path d="M15 40C15 40 2 23 2 14a13 13 0 0 1 26 0C28 23 15 40 15 40Z" fill="${pointColor}" stroke="#fff" stroke-width="2"/>
    <circle cx="15" cy="14" r="5" fill="#fff"/>
  </svg>`,
})

const toLeaflet = ({ lat, lon }: LatLon): L.LatLngTuple => [lat, lon]
const fromLeaflet = ({ lat, lng }: L.LatLng): LatLon => ({ lat, lon: lng })

interface Props {
  state: PointState
  onEvent: (event: PointEvent) => void
  t: typeof en
}

export function MapView({ state, onEvent, t }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map>(null)
  const { point, mode, accuracy, view } = state

  useEffect(() => {
    const map = L.map(container.current!, { zoomControl: false }).setView(toLeaflet(deakTer), startZoom)
    mapRef.current = map

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>',
    }).addTo(map)

    map.on('dragstart', () => onEvent({ type: 'dragStart' }))
    // The map coasts on after the finger lifts, and moveend is what fires when it stops.
    map.on('dragend', () => {
      map.once('moveend', () => onEvent({ type: 'dragEnd', center: fromLeaflet(map.getCenter()) }))
    })
    map.on('click', ({ latlng }) => onEvent({ type: 'tap', at: fromLeaflet(latlng) }))

    return () => {
      map.remove()
    }
  }, [])

  useEffect(() => {
    const zoom = L.control.zoom({ zoomInTitle: t.zoomIn, zoomOutTitle: t.zoomOut }).addTo(mapRef.current!)
    return () => {
      zoom.remove()
    }
  }, [t])

  useEffect(() => {
    if (view) mapRef.current!.setView(toLeaflet(view.center), view.zoom ?? mapRef.current!.getZoom())
  }, [view])

  useEffect(() => {
    if (!point) return
    const at = toLeaflet(point)
    // None of these is interactive: a tap on them has to reach the map.
    const shared = { interactive: false, color: pointColor }
    const layers: L.Layer[] = [
      L.circle(at, { ...shared, radius: kmRadius, fill: false, weight: 2, className: 'km-circle' }),
    ]
    if (mode === 'following') {
      layers.push(
        L.circle(at, {
          ...shared,
          radius: accuracy ?? 0,
          weight: 1,
          fillOpacity: 0.15,
          className: 'accuracy-circle',
        }),
        L.circleMarker(at, {
          ...shared,
          radius: 7,
          color: '#fff',
          weight: 2,
          fillColor: pointColor,
          fillOpacity: 1,
          className: 'location-dot',
        }),
      )
    } else {
      layers.push(L.marker(at, { icon: pin, interactive: false, keyboard: false }))
    }
    const group = L.layerGroup(layers).addTo(mapRef.current!)
    return () => {
      group.remove()
    }
  }, [point, mode, accuracy])

  return (
    <div class="map-area">
      <div ref={container} class="map" role="region" aria-label={t.map} />
      {mode === 'exploring' && (
        <button type="button" class="my-location" onClick={() => onEvent({ type: 'useMyLocation' })}>
          {t.myLocation}
        </button>
      )}
    </div>
  )
}
