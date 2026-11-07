import { useEffect, useReducer } from 'preact/hooks'
import { initialPoint, nextPoint } from '../core/point'

// An older browser may have no Permissions API, and query rejects a name a browser doesn't know.
// Not knowing counts as not granted: the intro shows, and a press of its button asks.
async function locationGranted(): Promise<boolean> {
  try {
    return (await navigator.permissions.query({ name: 'geolocation' })).state === 'granted'
  } catch {
    return false
  }
}

/** The point the page is built around, and the dispatch that moves it. */
export function usePoint() {
  const [state, dispatch] = useReducer(nextPoint, initialPoint)

  useEffect(() => {
    void locationGranted().then((granted) => dispatch({ type: 'permission', granted }))
  }, [])

  useEffect(() => {
    if (!state.watching) return
    const watch = navigator.geolocation.watchPosition(
      ({ coords }) =>
        dispatch({ type: 'fix', lat: coords.latitude, lon: coords.longitude, accuracy: coords.accuracy }),
      (error) => dispatch({ type: 'locationError', denied: error.code === error.PERMISSION_DENIED }),
      { enableHighAccuracy: true },
    )
    return () => navigator.geolocation.clearWatch(watch)
  }, [state.watching])

  return [state, dispatch] as const
}
