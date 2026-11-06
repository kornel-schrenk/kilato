import { distanceMetres, type LatLon } from './geo'

export const deakTer: LatLon = { lat: 47.4975, lon: 19.0545 }

/** While following, the point moves only when the location is this many metres from it. */
const followStep = 15

export interface PointState {
  mode: 'starting' | 'intro' | 'following' | 'exploring'
  /** What the list is built around. Null until there is a fix or a place to explore. */
  point: LatLon | null
  /** The fix's accuracy in metres, while following. */
  accuracy: number | null
  /** A location watch should be running. It also runs while a request waits for its first fix. */
  watching: boolean
  /** A drag that counts is running or coasting, and its end moves the point. */
  dragging: boolean
  /**
   * The last view the map was asked to go to. A new object is a new request. With no zoom, the map
   * keeps the one it has. `forScreen` is the spec's start zoom for this screen, which only the page can read.
   */
  view: { center: LatLon; zoom?: 'forScreen' } | null
}

export type PointEvent =
  | { type: 'permission'; granted: boolean }
  | { type: 'useMyLocation' }
  | { type: 'explore' }
  | { type: 'fix'; lat: number; lon: number; accuracy: number }
  | { type: 'locationError'; denied: boolean }
  | { type: 'dragStart' }
  | { type: 'dragEnd'; center: LatLon }
  | { type: 'tap'; at: LatLon }
  | { type: 'pick'; at: LatLon }

export const initialPoint: PointState = {
  mode: 'starting',
  point: null,
  accuracy: null,
  watching: false,
  dragging: false,
  view: null,
}

const exploreAt = (view: NonNullable<PointState['view']>): PointState => ({
  mode: 'exploring',
  point: view.center,
  accuracy: null,
  watching: false,
  dragging: false,
  view,
})

const exploreDeakTer = () => exploreAt({ center: deakTer, zoom: 'forScreen' })

export function nextPoint(state: PointState, event: PointEvent): PointState {
  switch (event.type) {
    case 'permission':
      if (state.mode !== 'starting') return state
      return event.granted ? { ...state, mode: 'following', watching: true } : { ...state, mode: 'intro' }

    case 'useMyLocation':
      return state.mode === 'intro' || state.mode === 'exploring' ? { ...state, watching: true } : state

    case 'explore':
      return exploreDeakTer()

    case 'fix': {
      // The watch stops only after the next paint, so a fix can still arrive after a drag began.
      if (!state.watching) return state
      const point = { lat: event.lat, lon: event.lon }
      const walkedFrom = state.mode === 'following' ? state.point : null
      if (walkedFrom && distanceMetres(walkedFrom, point) < followStep) {
        return { ...state, accuracy: event.accuracy }
      }
      return {
        ...state,
        mode: 'following',
        point,
        accuracy: event.accuracy,
        dragging: false,
        // Only the start of following picks a zoom. A walk keeps the one the user chose.
        view: walkedFrom ? { center: point } : { center: point, zoom: 'forScreen' },
      }
    }

    case 'locationError':
      if (!state.watching) return state
      if (state.mode === 'exploring') return { ...state, watching: false }
      if (state.mode === 'following' && state.point) {
        // A walker's fix drops out now and then, in a tunnel or a doorway. Only a refusal ends the walk,
        // and it leaves the point where it is: throwing them to Deák Ferenc tér would help nobody.
        return event.denied ? { ...state, mode: 'exploring', accuracy: null, watching: false } : state
      }
      return exploreDeakTer()

    case 'dragStart':
      return state.mode === 'following' || state.mode === 'exploring'
        ? { ...state, mode: 'exploring', accuracy: null, watching: false, dragging: true }
        : state

    case 'dragEnd':
      // A coast can outlast the choice that replaced it: Explore the map, or a first fix, sends the
      // map somewhere new, and that move stopping the coast fires this with the old centre.
      return state.dragging ? { ...state, point: event.center, dragging: false } : state

    case 'tap':
      // Leaflet lets a coast run on through a tap. The tap is the later choice, so the coast's end must not undo it.
      return state.mode === 'exploring' ? { ...state, point: event.at, watching: false, dragging: false } : state

    case 'pick':
      // From any mode: the search box is there from the start, and it needs no location.
      return exploreAt({ center: event.at })
  }
}
