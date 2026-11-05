import { describe, expect, it } from 'vitest'
import { deakTer, initialPoint, nextPoint, type PointEvent, type PointState } from './point'

const run = (events: PointEvent[], from: PointState = initialPoint) => events.reduce(nextPoint, from)

// 0.0001° of latitude is 11.12 m.
const fix = (lat: number, lon = 19.05, accuracy = 20): PointEvent => ({ type: 'fix', lat, lon, accuracy })
const start = 47.5

const intro = run([{ type: 'permission', granted: false }])
const following = run([{ type: 'permission', granted: true }, fix(start)])
const exploring = run([{ type: 'permission', granted: false }, { type: 'explore' }])
const pin = { lat: 47.51, lon: 19.06 }
const moved = run([{ type: 'tap', at: pin }], exploring)

describe('on load', () => {
  it('waits for the permission answer, with no point', () => {
    expect(initialPoint).toMatchObject({ mode: 'starting', point: null, watching: false })
  })

  it('with the permission granted, watches the location', () => {
    expect(run([{ type: 'permission', granted: true }])).toMatchObject({
      mode: 'following',
      point: null,
      watching: true,
    })
  })

  it('without it, shows the intro and does not touch the location', () => {
    expect(intro).toMatchObject({ mode: 'intro', point: null, watching: false })
  })
})

describe('from the intro', () => {
  const asked = run([{ type: 'useMyLocation' }], intro)

  it('Use my location keeps the intro up while it waits', () => {
    expect(asked).toMatchObject({ mode: 'intro', point: null, watching: true })
  })

  it('the first fix starts following there, at the start zoom for the screen', () => {
    expect(run([fix(start, 19.05, 30)], asked)).toMatchObject({
      mode: 'following',
      point: { lat: start, lon: 19.05 },
      accuracy: 30,
      watching: true,
      view: { center: { lat: start, lon: 19.05 }, zoom: 'forScreen' },
    })
  })

  const atDeak = {
    mode: 'exploring',
    point: deakTer,
    accuracy: null,
    watching: false,
    dragging: false,
    view: { center: deakTer, zoom: 15 },
  }

  it('Explore the map starts exploring at Deák Ferenc tér, zoom 15', () => {
    expect(deakTer).toEqual({ lat: 47.4975, lon: 19.0545 })
    expect(run([{ type: 'explore' }], intro)).toEqual(atDeak)
  })

  it('Explore the map also stops a location request still waiting', () => {
    expect(run([{ type: 'explore' }], asked)).toEqual(atDeak)
  })

  for (const denied of [true, false]) {
    it(`a location error (denied: ${denied}) starts exploring at Deák Ferenc tér, zoom 15`, () => {
      expect(run([{ type: 'locationError', denied }], asked)).toEqual(atDeak)
    })
  }

  it('the end of a drag that began during the intro does not move the point', () => {
    expect(run([{ type: 'dragStart' }, { type: 'explore' }, { type: 'dragEnd', center: pin }], intro)).toEqual(atDeak)
  })

  it('dragging and tapping the map do nothing until a choice is made', () => {
    const dragged = run(
      [{ type: 'dragStart' }, { type: 'dragEnd', center: pin }, { type: 'tap', at: pin }],
      intro,
    )
    expect(dragged).toEqual(intro)
  })
})

describe('with the permission granted but no fix yet', () => {
  const waiting = run([{ type: 'permission', granted: true }])

  it('a location error starts exploring at Deák Ferenc tér', () => {
    expect(run([{ type: 'locationError', denied: false }], waiting)).toMatchObject({
      mode: 'exploring',
      point: deakTer,
      view: { center: deakTer, zoom: 15 },
    })
  })

  it('a drag stops waiting and starts exploring at the map centre', () => {
    expect(run([{ type: 'dragStart' }, { type: 'dragEnd', center: pin }], waiting)).toMatchObject({
      mode: 'exploring',
      point: pin,
      watching: false,
    })
  })
})

describe('following', () => {
  it('stays put when the location moves less than 15 m', () => {
    // 0.000134° is 14.9 m.
    const after = run([fix(start + 0.000134)], following)
    expect(after.point).toEqual({ lat: start, lon: 19.05 })
    expect(after.view).toBe(following.view)
  })

  it('moves the point, and the map with it, at 15 m', () => {
    // 0.000136° is 15.1 m.
    const point = { lat: start + 0.000136, lon: 19.05 }
    expect(run([fix(point.lat)], following)).toMatchObject({ point, view: { center: point } })
  })

  it('measures from the point, not from the last fix', () => {
    // Three steps of 11 m: only the second is 15 m or more from the point, at 22 m.
    const steps = [fix(start + 0.0001), fix(start + 0.0002), fix(start + 0.0003)]
    expect(run(steps, following).point).toEqual({ lat: start + 0.0002, lon: 19.05 })
  })

  it('takes the new accuracy from every fix, even when the point stays', () => {
    expect(run([fix(start, 19.05, 5)], following)).toMatchObject({
      point: { lat: start, lon: 19.05 },
      accuracy: 5,
    })
  })

  it('keeps the zoom the user has: no later fix asks for one', () => {
    expect(run([fix(start + 1)], following).view).not.toHaveProperty('zoom')
  })

  it('the first fix on load asks for the start zoom for the screen', () => {
    expect(following.view).toEqual({ center: { lat: start, lon: 19.05 }, zoom: 'forScreen' })
  })

  it('ignores a tap', () => {
    expect(run([{ type: 'tap', at: pin }], following)).toEqual(following)
  })

  it('a location error that is not a refusal keeps following from the last point', () => {
    expect(run([{ type: 'locationError', denied: false }], following)).toEqual(following)
  })

  it('a later refusal explores from the last point, not Deák Ferenc tér', () => {
    expect(run([{ type: 'locationError', denied: true }], following)).toEqual({
      ...following,
      mode: 'exploring',
      accuracy: null,
      watching: false,
    })
  })

  it('a drag switches to exploring and stops watching at once', () => {
    expect(run([{ type: 'dragStart' }], following)).toEqual({
      ...following,
      mode: 'exploring',
      accuracy: null,
      watching: false,
      dragging: true,
    })
  })

  it('the end of that drag moves the pin to the map centre', () => {
    expect(run([{ type: 'dragStart' }, { type: 'dragEnd', center: pin }], following).point).toEqual(pin)
  })

  it('a fix that was already on its way when the drag began is dropped', () => {
    const dragging = run([{ type: 'dragStart' }], following)
    expect(run([fix(start + 1)], dragging)).toEqual(dragging)
  })
})

describe('exploring', () => {
  it('a tap moves the pin to the tap, and leaves the view alone', () => {
    expect(moved.point).toEqual(pin)
    expect(moved.view).toBe(exploring.view)
  })

  it('the end of a drag moves the pin to the map centre, and leaves the view alone', () => {
    const after = run([{ type: 'dragStart' }, { type: 'dragEnd', center: pin }], exploring)
    expect(after.point).toEqual(pin)
    expect(after.view).toBe(exploring.view)
  })

  it('the start of a drag does not move the pin yet', () => {
    expect(run([{ type: 'dragStart' }], moved).point).toEqual(pin)
  })

  it('a tap while the map still coasts keeps the pin at the tap when the map stops', () => {
    const coasting = run([{ type: 'dragStart' }, { type: 'tap', at: pin }], exploring)
    expect(run([{ type: 'dragEnd', center: deakTer }], coasting).point).toEqual(pin)
  })

  it('a fix with no request running is dropped', () => {
    expect(run([fix(start)], moved)).toEqual(moved)
  })

  describe('after My location', () => {
    const asked = run([{ type: 'useMyLocation' }], moved)

    it('the pin stays while it waits', () => {
      expect(asked).toMatchObject({ mode: 'exploring', point: pin, watching: true })
    })

    it('the first fix switches back to following, and the map goes there at the start zoom for the screen', () => {
      const point = { lat: start, lon: 19.05 }
      expect(run([fix(start)], asked)).toMatchObject({
        mode: 'following',
        point,
        accuracy: 20,
        watching: true,
        view: { center: point, zoom: 'forScreen' },
      })
    })

    it('a first fix closer than 15 m to the pin still switches, and still moves the point', () => {
      const near = { lat: pin.lat + 0.00001, lon: pin.lon }
      expect(run([fix(near.lat, near.lon)], asked)).toMatchObject({
        mode: 'following',
        point: near,
        view: { center: near },
      })
    })

    for (const denied of [true, false]) {
      it(`a location error (denied: ${denied}) leaves the pin where it is`, () => {
        expect(run([{ type: 'locationError', denied }], asked)).toEqual(moved)
      })
    }

    it('the end of a drag that began before the fix does not move the point', () => {
      const point = { lat: start, lon: 19.05 }
      const coasting = run([{ type: 'dragStart' }, { type: 'useMyLocation' }, fix(start)], moved)
      expect(run([{ type: 'dragEnd', center: pin }], coasting)).toMatchObject({ mode: 'following', point })
    })

    it('a drag cancels the request', () => {
      expect(run([{ type: 'dragStart' }, { type: 'dragEnd', center: deakTer }], asked)).toMatchObject({
        mode: 'exploring',
        point: deakTer,
        watching: false,
      })
    })

    it('a tap cancels the request', () => {
      expect(run([{ type: 'tap', at: deakTer }], asked)).toMatchObject({
        mode: 'exploring',
        point: deakTer,
        watching: false,
      })
    })
  })
})

describe('picking a search result', () => {
  const place = { lat: 47.52, lon: 19.07 }
  const pick: PointEvent = { type: 'pick', at: place }

  for (const [name, from] of [
    ['before the page knows the permission', initialPoint],
    ['at the intro', intro],
    ['while following', following],
    ['while exploring', moved],
  ] as const) {
    it(`${name}, starts exploring with the point at the place, and the map goes there at its own zoom`, () => {
      expect(run([pick], from)).toEqual({
        mode: 'exploring',
        point: place,
        accuracy: null,
        watching: false,
        dragging: false,
        view: { center: place },
      })
    })
  }

  it('stays when the permission answer comes after it', () => {
    expect(run([pick, { type: 'permission', granted: true }]).point).toEqual(place)
  })

  it('cancels a request for the location, so a late fix does not move the point', () => {
    expect(run([{ type: 'useMyLocation' }, pick, fix(start)], intro).point).toEqual(place)
  })

  it('stops following, so the next fix does not move the point', () => {
    expect(run([pick, fix(start)], following).point).toEqual(place)
  })

  it('keeps the point at the place when a map still coasting stops', () => {
    const coasting = run([{ type: 'dragStart' }, pick], moved)
    expect(run([{ type: 'dragEnd', center: deakTer }], coasting).point).toEqual(place)
  })

  it('leaves My location working', () => {
    expect(run([pick, { type: 'useMyLocation' }, fix(start)], following).mode).toBe('following')
  })
})

it('My location does nothing while following or before the page knows the permission', () => {
  expect(run([{ type: 'useMyLocation' }], following)).toEqual(following)
  expect(run([{ type: 'useMyLocation' }])).toEqual(initialPoint)
})

it('the permission answer counts only while the page is starting', () => {
  expect(run([{ type: 'permission', granted: true }], exploring)).toEqual(exploring)
})

it('a fix before the page knows the permission is dropped', () => {
  expect(run([fix(start)])).toEqual(initialPoint)
})

it('a location error with no request running changes nothing', () => {
  expect(run([{ type: 'locationError', denied: true }], moved)).toEqual(moved)
  expect(run([{ type: 'locationError', denied: true }], intro)).toEqual(intro)
})
