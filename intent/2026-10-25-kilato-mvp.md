# Intent: Kilátó, a pocket lookout tower

Author: Kornel Schrenk · Status: draft

## Problem

When I stroll in the city, I like to look around. I grab my phone and want to see what is interesting nearby. Today I have to search for something specific. There is no quick way to just see what is around me.

## Proposed outcome

A web page that asks for your current location and shows what is within 1 km: sights, notable places and everyday businesses such as shops, cafés and services, on a map and in a list. The list puts the nearest or the most relevant first and can be filtered by category. Nearest first is the default, and the user can switch to most relevant. A place shows whether it is open now, when its opening hours are known, and whether it has a Wikipedia article. The map and the list update as you walk. It runs in the phone's browser, with nothing to install and no account.

## Affected users and systems

- People strolling in the city with a phone, starting in Budapest, Hungary
- The browser's location service
- OpenStreetMap data from the Hungary extract, and geotagged articles from the Hungarian and English Wikipedia
- OpenStreetMap map tiles
- GitHub Actions to rebuild the data every week, and GitHub Pages for hosting

## Constraints

- English UI. Place names stay as OpenStreetMap has them.
- Browser only at the start, with no login and no API keys, so it can be a static site on GitHub Pages.
- The phone does not query OpenStreetMap or Wikipedia. Budapest's places and articles are prepared ahead of time, rebuilt every week and served with the page, so the data can be up to a week old.
- Wikipedia links go to the Hungarian article first, and to the English one as well when it exists.
- Map tiles come from OpenStreetMap, within its tile usage policy: attribution on the map, no prefetching, no offline use.
- Open data only, with the attribution its licences require.
- The location itself is never sent anywhere. Map tiles, and any data loaded by area, show roughly which area is on screen. The page says what is sent where.
- If location access is refused, the user can tap or pan the map, or search Kilátó's places by name.
- It should stay light enough for mobile data, but speed is not a hard target yet.
- Tests use recorded data and a faked location, never the live services.
- MIT licence.

## Not now

- Jobs and events. They have no free data source that works without a key, so they would need a small server to hold API keys.
- Firms and offices without a storefront. OpenStreetMap has few of them. Overture Maps has more, but they are mostly Facebook pages, parcel lockers and registered addresses.
- Cities other than Budapest. Elsewhere the page says it covers Budapest only for now.
- Accounts and saved places.
- Native apps.

## Answered in planning

The open questions of the first draft, answered on 2026-10-27 from measurements and decisions:

- **How good is the coverage in Budapest?** Good for sights and everyday places, thin for firms. Within 1 km of Újpest centre, OpenStreetMap has 331 shops and 70 cafés and restaurants, about two-thirds of them with opening hours, but only 36 offices. Hungarian Wikipedia has 3–7 times more nearby articles than English: 252 / 75 at Deák tér, 29 / 5 in Újpest centre, 15 / 2 in Csepel.
- **Which map tiles can we use?** OpenStreetMap's own tiles. Their policy allows light interactive use with attribution, a normal browser Referer, and no prefetching or offline use. OpenFreeMap or a self-hosted Protomaps file are the fallbacks.
- **How should "worth a look" weigh things?** The list has two orders, and category filters work with both. Nearest first is the default. Most relevant is one score that weighs distance, category, whether a place has a Wikipedia article and whether it is open now. The spec sets the weights.
- **Hungarian or English Wikipedia first?** Hungarian first, English as well when it exists.
- **How well must it work on slow mobile data?** Light enough for mobile data, with no hard target yet.
- **Live queries or prepared data?** This question came up during planning. The answer is prepared data: the public Overpass servers failed 7 of 8 queries during planning, and their policy discourages public apps that rely on them.
