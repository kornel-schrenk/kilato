import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'preact/hooks'
import { listRadius, type LatLon } from '../core/geo'
import { deakTer, startZoom, type PointEvent, type PointState } from '../core/point'
import type { Row } from '../core/rank'
import type { Place } from '../core/types'
import type { en } from '../i18n/en'
import { categoryColors } from './categoryColors'
import type { Selection } from './usePlaces'

const pointColor = '#1a56c4'
const markerStyle: L.CircleMarkerOptions = { radius: 5, color: '#fff', weight: 1 }
const highlightStyle: L.CircleMarkerOptions = { radius: 8, color: '#000', weight: 3 }

// The spec's Start zoom. 900 px is also where the layout switches, in index.html.
const zoomForScreen = () => (matchMedia('(min-width: 900px)').matches ? 15 : 14)

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
  rows: Row[]
  selection: Selection | null
  onSelect: (place: Place, source: Selection['source']) => void
  t: typeof en
}

export function MapView({ state, onEvent, rows, selection, onSelect, t }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map>(null)
  const zooming = useRef(false)
  const canvas = useRef<L.Canvas>(null)
  const markers = useRef(new Map<string, L.CircleMarker>())
  // The markers outlive a render, and the list's order can change under them.
  const select = useRef(onSelect)
  select.current = onSelect
  const { point, mode, accuracy, view } = state

  useEffect(() => {
    const map = L.map(container.current!, { zoomControl: false }).setView(toLeaflet(deakTer), startZoom)
    mapRef.current = map

    // Under the overlay pane, so the point draws on top. Leaflet's SVG root lets taps through to the canvas.
    map.createPane('places').style.zIndex = '350'
    canvas.current = L.canvas({ pane: 'places' })

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
    map.on('zoomstart', () => {
      zooming.current = true
    })
    map.on('zoomend', () => {
      zooming.current = false
    })

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
    if (!view) return
    const map = mapRef.current!
    const go = () =>
      map.setView(toLeaflet(view.center), view.zoom === 'forScreen' ? zoomForScreen() : (view.zoom ?? map.getZoom()))
    // Leaflet silently drops a new zoom asked for during a zoom animation, so this waits that one out.
    if (zooming.current) map.once('zoomend', go)
    else go()
    return () => {
      map.off('zoomend', go)
    }
  }, [view])

  useEffect(() => {
    if (!point) return
    const at = toLeaflet(point)
    // None of these is interactive: a tap on them has to reach the map.
    const shared = { interactive: false, color: pointColor }
    const layers: L.Layer[] = [
      L.circle(at, { ...shared, radius: listRadius, fill: false, weight: 2, className: 'km-circle' }),
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

  useEffect(() => {
    const group = L.layerGroup().addTo(mapRef.current!)
    markers.current = new Map(
      rows.map(({ place }) => [
        place.id,
        L.circleMarker(toLeaflet(place), {
          ...markerStyle,
          renderer: canvas.current!,
          fillColor: categoryColors[place.cat],
          fillOpacity: 1,
          // A tap on a marker picks the place. Reaching the map, it would also move the point.
          bubblingMouseEvents: false,
        })
          .on('click', () => select.current(place, 'marker'))
          .addTo(group),
      ]),
    )
    return () => {
      group.remove()
    }
  }, [rows])

  useEffect(() => {
    const marker = selection && markers.current.get(selection.place.id)
    if (!marker) return
    marker.setStyle(highlightStyle).bringToFront()
    return () => {
      marker.setStyle(markerStyle)
    }
  }, [rows, selection])

  useEffect(() => {
    if (selection?.source !== 'row') return
    const map = mapRef.current!
    const at = toLeaflet(selection.place)
    // An element, because Leaflet renders a string as HTML, and the name comes from OpenStreetMap.
    const name = document.createElement('span')
    name.textContent = selection.place.name
    // No autoPan: Leaflet would pan for a popup that doesn't fit, with the marker on screen.
    const popup = L.popup({ autoPan: false }).setLatLng(at).setContent(name).openOn(map)
    if (!map.getBounds().contains(at)) map.panTo(at)
    return () => {
      popup.remove()
    }
  }, [selection])

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
