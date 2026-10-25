# Intent: Kilátó, a pocket lookout tower

Author: Kornel Schrenk · Status: draft

## Problem

When I stroll in the city, I like to look around. I grab my phone and want to see what is interesting nearby. Today I have to search for something specific. There is no quick way to just see what is around me.

## Proposed outcome

A web page that asks for your current location and shows what is nearby: places, companies and sights, on a map and in a list, with the ones most worth a look first. It runs in the phone's browser, with nothing to install and no account.

## Affected users and systems

- People strolling in the city with a phone, starting in Budapest, Hungary
- The browser's location service, OpenStreetMap data through the Overpass API, nearby articles from the Hungarian and English Wikipedia, and GitHub Pages for hosting

## Constraints

- English UI. Place names stay as OpenStreetMap has them.
- Browser only at the start, with no login and no API keys, so it can be a static site on GitHub Pages.
- Open data only, with the attribution its licences require.
- The location stays in the browser. Coordinates are rounded to about 100 m before any outside request, and the page says what is sent where.
- If location access is refused, the user can type a place or tap the map instead.
- Tests use recorded responses and a faked location, never the live services.
- MIT licence.

## Not now

- Jobs and events. They have no free data source that works without a key, so they would need a small server to hold API keys.
- Accounts and saved places.
- Native apps.

## Open questions

- How good is OpenStreetMap and Wikipedia coverage in Budapest for companies and for "something interesting"?
- Which map tiles can we use within their usage policy?
- How should "worth a look" weigh distance, category, opening hours and how notable a place is?
- Should Hungarian or English Wikipedia articles come first?
- How well must it work on slow mobile data?
