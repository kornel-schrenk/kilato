# Spec: Kilátó MVP

Intent: [Kilátó, a pocket lookout tower](../intent/2026-10-25-kilato-mvp.md) · Author: Claude, from the accepted intent · Status: accepted

This spec says how to build the accepted intent. It settles the stack, the data files, the rules the page follows and the tests, so each issue cut from it can be built without guessing. The product constraints stay in the intent, and this spec doesn't repeat them.

## Overview

Kilátó has two halves, and they meet in static files.

1. **The weekly data build** runs on GitHub Actions. It cuts Budapest's places out of the OpenStreetMap Hungary extract, fetches geotagged articles from the Hungarian and English Wikipedia, merges the two and writes JSON files.
2. **The page** is a static site on GitHub Pages. It finds the phone's location, loads the data files for the area around it, and shows the places within 1 km on a map and in a list. All the work happens on the phone, so the location never leaves it.

## Decisions for review

In these places the spec chooses between real options. Each one is easy to change in review and harder to change once the issues exist.

1. **Data by area, not one file for the city.** The page loads the places in squares about 1.1 km wide, at most nine at a time. On the extract of 2026-11-03, the nine squares around Deák Ferenc tér in the city centre hold 6,515 places and come to 287 KB compressed. One file with all 29,969 places would be about 1.3 MB at that rate, on every first visit. `search.json` is 681 KB compressed, and loads only when the search box first gets focus. The cost is that GitHub Pages sees which squares you load, which the intent already allows.
2. **Opening hours are worked out in the build.** The phone gets ready-made open times for the next 14 days instead of a parser for the full `opening_hours` syntax. The cost: if the build stalls for two weeks, open status disappears, by which time the data age warning has been showing for four days.
3. **One Wikipedia link per place:** the phone's language, then Hungarian, then English.
4. **What is left out:** places without a name, memorial plaques and stolpersteine, and offices.
5. **Six categories**, as in the [category table](#categories). Wikipedia articles that match no OpenStreetMap place become their own category, Notable places.
6. **Relevance is counted in metres.** A Wikipedia article is worth 300 m, and a closed place counts as 300 m further away. The full table is in [Order](#order).
7. **Only the language choice is remembered.** The sort order and the filters start fresh on every visit.
8. **Exploring moves the point only by hand.** Once you drag or tap the map, the list stays around that point until you press My location.
9. **Stack:** TypeScript for both the page and the build, Preact for the page, Leaflet for the map.

## Stack

| Part | Choice | Why |
|---|---|---|
| Language | TypeScript, strict mode | One language for the page and the data build, with shared types |
| Runtime | Node 24 LTS, npm | Current LTS, and npm comes with it |
| Page | Preact with Vite | Plain components at about 4 KB |
| Map | Leaflet 1.9 with OpenStreetMap raster tiles | About 40 KB. These are the tiles chosen in planning |
| Unit tests | Vitest | Core logic and the data build |
| Page tests | Playwright with Chromium | Faked location, faked clock, all network requests stubbed |
| OpenStreetMap processing | osmium-tool, run only in the deploy workflow | Fast filtering of the 328 MB extract. Installed with apt on the runner |
| Opening hours | the `opening_hours` npm package, in the data build only | Handles the full OpenStreetMap syntax and Hungarian public holidays. It is LGPL-3.0 and never ships to the phone |

There is no other UI framework, no CSS framework, no service worker (the tile policy forbids offline use), no analytics and no cookies.

```
index.html
src/
  core/          pure logic, no DOM: types, geo, cells, rank, hours, wiki, names, search, lang
  data/          loads the data files in the page
  ui/            Preact components
  i18n/          hu.ts, en.ts, kinds.ts
  main.tsx
scripts/data/    the data build: categories, osm, hours, wikipedia, merge, write, build
test/fixtures/   recorded OpenStreetMap and Wikipedia data, the site fixture data, a blank tile
e2e/             Playwright tests
.github/workflows/
  ci.yml
  deploy.yml
```

The site lives at `https://kornel-schrenk.github.io/kilato/`, so Vite's `base` is `/kilato/`.

## Data build

`npm run data:build -- --pbf <hungary-latest.osm.pbf> --out <dir>` runs the whole build. It runs with `TZ=Europe/Budapest`, because opening hours are in local time.

### Coverage box

Budapest is the box with west 18.925, south 47.35, east 19.335 and north 47.62, the box planning measured. It takes in a little of the towns around the city. The build keeps only the places inside it, and the page treats a point inside it as covered.

### Places from OpenStreetMap

The build runs osmium-tool in three steps.

1. `osmium extract -s smart -b 18.925,47.35,19.335,47.62` cuts the box out of the Hungary extract.
2. `osmium tags-filter` keeps the objects that match the [category table](#categories). The build generates the filter expressions from that table, so the two can't drift apart.
3. `osmium export -f geojsonseq --add-unique-id=type_id -x print_record_separator=false`, with a config that sets `linear_tags` to false, writes one GeoJSON feature per line. Nodes become points, and closed ways and multipolygons become polygons. Open ways are left out.

A pure function then turns those lines into places, so tests can feed it a recorded file.

- The id is `n`, `w` or `r` followed by the OpenStreetMap id. If osmium writes an area id as `a<n>`, convert it with libosmium's rule: an even `n` is way `n / 2`, an odd `n` is relation `(n − 1) / 2`.
- A polygon's position is the area-weighted centroid of its outer ring.
- Coordinates are rounded to 5 decimals, about 1 m.
- A place without a `name` tag is left out.
- Memorial plaques and stolpersteine are left out: objects whose `memorial` or `memorial:type` tag is `plaque` or `stolperstein`. Budapest has thousands of them, and they would crowd every list.
- `names.hu` comes from `name:hu` and `names.en` from `name:en`. Each one is kept only when it differs from `name`.
- The `wikidata` and `wikipedia` tags are kept for the [merge](#merge).

### Categories

Each place gets exactly one category. The rules are checked from top to bottom, and the first match wins. A place's `kind` is the tag value that matched, such as `cafe`.

| Category | Id | OpenStreetMap tags |
|---|---|---|
| Sights | `sights` | `tourism` = attraction, museum, gallery, viewpoint, artwork, zoo, aquarium, theme_park · any `historic` value · `amenity` = place_of_worship, fountain |
| Food & drink | `food` | `amenity` = cafe, restaurant, fast_food, bar, pub, biergarten, ice_cream, food_court · `shop` = bakery, pastry |
| Culture & leisure | `leisure` | `amenity` = theatre, cinema, arts_centre, library, community_centre, events_venue, nightclub, music_venue, planetarium · `leisure` = park, garden, playground, sports_centre, fitness_centre, swimming_pool, water_park, escape_game, bowling_alley |
| Services | `services` | `amenity` = pharmacy, bank, bureau_de_change, post_office, clinic, doctors, dentist, veterinary, hospital, police, townhall, fuel, car_wash, car_rental, driving_school · `shop` = hairdresser, beauty, massage, tattoo, laundry, dry_cleaning, travel_agency, copyshop, optician, tailor, shoe_repair, photo |
| Shops | `shops` | any other `shop` value except `vacant` |
| Notable places | `notable` | none: these are geotagged Wikipedia articles that match no place above |

`office` objects are not in the table, because the intent leaves out firms without a storefront.

**Kind labels.** `src/i18n/kinds.ts` holds a Hungarian and an English label for:

- every value in the table;
- these `historic` values: monument, memorial, castle, ruins, building, archaeological_site, city_gate, citywalls, fort, manor, tomb, wayside_cross;
- these `shop` values: supermarket, convenience, clothes, shoes, books, florist, butcher, greengrocer, kiosk, tobacco, alcohol, wine, chemist, cosmetics, mobile_phone, electronics, computer, jewelry, gift, furniture, hardware, doityourself, pet, toys, sports, bicycle, department_store, mall, variety_store, second_hand, stationery, newsagent;
- `article`, which is "Wikipedia article" / "Wikipédia-szócikk".

Any other `historic` value shows "Historic site" / "Történelmi hely", and any other `shop` value shows "Shop" / "Üzlet".

### Articles from Wikipedia

The build asks the Wikipedia API of the Hungarian and the English edition. The dumps come out only twice a month, so the API is what keeps articles as fresh as the build.

1. Split the box into tiles 0.05° tall and 0.075° wide, about 5.6 km each way.
2. For each tile, call `list=geosearch` with `gsbbox`, `gslimit=500`, `gsprimary=primary` and `gsnamespace=0`. If a tile returns 500 results, split it into four and ask again.
3. For the pages found, 50 page ids per call, request `prop=pageprops|langlinks` with `ppprop=wikibase_item` and `lllimit=max`, following `continue` until it ends.

Every call sends `User-Agent: Kilato/1.0 (https://github.com/kornel-schrenk/kilato)`, `maxlag=5` and `formatversion=2`. Calls run one at a time, and each is retried up to three times with backoff after an error or a `maxlag` reply. Planning counted 2,644 Hungarian articles in the box, so a build makes about 150 calls.

The fetch module takes `fetch` as a parameter. Tests replay recorded responses from `test/fixtures/wikipedia/` and never call the API.

Articles in both editions with the same Wikidata id count as one article, positioned where the Hungarian one is.

### Merge

1. An article attaches to every OpenStreetMap place whose `wikidata` tag equals the article's Wikidata id.
2. If no place matches that way, it attaches to the places whose `wikipedia` tag (`hu:Title` or `en:Title`) names it. Underscores count as spaces.
3. A place whose `wikipedia` tag matched no fetched article still gets that link, with the title taken from the tag.
4. An article that attached to nothing becomes a place in `notable`, with kind `article`.
   - Its `name` is the Hungarian title, or the English one when there is no Hungarian article, without a trailing parenthesis such as " (Budapest)".
   - `names.en` is the English title, cut the same way, when it differs from `name`.
   - Its id is the Wikidata id. Without one, it is `huwiki:<pageid>` or `enwiki:<pageid>`.

### Opening hours

The phone doesn't parse `opening_hours`. The build turns each value into the times the place is open over the next 14 days, and the phone only looks them up.

- The window starts at local midnight in Budapest on the day of the build and lasts 14 days. The manifest stores its start as a UTC instant.
- The build gives `opening_hours` Hungary as the country, so public holidays count, for example `PH off`.
- A place's `hours` is a list of `[start, end]` pairs in minutes since the window start, clipped to the window. `24/7` becomes `[[0, 20160]]`.
- A value that doesn't parse, or that has any interval marked unknown inside the window, gives no `hours`, so the page shows no open status.

A weekly build leaves a week of slack. Past the window, the page treats every place's hours as unknown.

### Data files

The build writes this tree, which the deploy publishes at `/kilato/data/`.

```
data/
  manifest.json
  cells/<key>.json     the places in one cell, one file per non-empty cell
  wiki/<lang>.json     article titles in one language, for every language except hu and en
  search.json          every place's name and position, for search
  LICENSE.txt          the data licences
```

**Cells.** A cell is 0.01° of latitude by 0.015° of longitude, about 1.1 km by 1.1 km in Budapest. Its key is `<floor(lat × 100)>_<floor(lon × 200 / 3)>`, such as `4749_1270` for Deák Ferenc tér. The build and the page compute keys with the same function in `src/core/cells.ts`. The 1 km circle around any point touches at most 3 × 3 cells.

The types live in `src/core/types.ts`, and both the build and the page use them.

```ts
type CategoryId = 'sights' | 'notable' | 'food' | 'leisure' | 'services' | 'shops'

interface Manifest {
  version: 1
  builtAt: string           // ISO instant the build finished
  osmDataAt: string         // ISO instant of the extract's replication timestamp
  wikipediaAt: string       // ISO instant the Wikipedia fetch started
  hoursWindowStart: string  // ISO instant of local midnight in Budapest on the build day
  box: [number, number, number, number]  // west, south, east, north
  cells: string[]           // keys of the cell files that exist
  wikiLangs: string[]       // languages that have a wiki/<lang>.json
}

interface CellFile { places: Place[] }

interface Place {
  id: string                // n123, w123, r123, Q123, huwiki:123 or enwiki:123
  cat: CategoryId
  kind: string              // the matched tag value, or 'article'
  lat: number
  lon: number
  name: string
  names?: { hu?: string; en?: string }
  hours?: [number, number][]
  wiki?: { q?: string; hu?: string; en?: string }  // Wikidata id and article titles
}

type WikiLangFile = Record<string, string>  // Wikidata id to the title in this language

interface SearchFile { places: Pick<Place, 'id' | 'cat' | 'lat' | 'lon' | 'name' | 'names'>[] }
```

`LICENSE.txt` says that the data derived from OpenStreetMap is © OpenStreetMap contributors under the Open Database License, and the data derived from Wikipedia is under CC BY-SA 4.0.

### Checks before deploy

The build fails, and nothing deploys, when:

- fewer than 5,000 places come from OpenStreetMap;
- fewer than 1,500 articles come from Wikipedia;
- any Wikipedia call still fails after its retries.

The live site then keeps the last good data, and its age shows on the page.

## The page

### Layout

The page is designed for phones first. From top to bottom:

1. A header with the name Kilátó, the search box and the HU | EN switch.
2. The map, 45% of the viewport height.
3. The controls: the sort toggle and the category chips.
4. The list.
5. A footer with the data age and links to "What is sent where" and "About".

On screens 900 px wide or more, the map fills the left 60%, and everything else sits in a column on the right.

### Location and the point

The list is built around one point, in one of two modes.

- **Following.** The point is the phone's location, from `watchPosition` with high accuracy, and the map follows it. When the location moves 15 m or more from the last point, the point moves and the list updates.
- **Exploring.** The point stays where it is, drawn as a pin. The user moves it by dragging the map (the point becomes the map centre when the drag ends), by tapping the map (the point goes to the tap) or by picking a search result. Nothing else moves it, including the map panning to show a selected place.

On load:

1. If the location permission is already granted, the page starts following.
2. Otherwise it shows a short intro with two buttons, Use my location and Explore the map, and a link to "What is sent where".
3. Explore the map, a refused permission or a location error starts exploring at Deák Ferenc tér (47.4975, 19.0545). A one-line note says the user can tap or drag the map, or search.

**Start zoom.** The map goes to zoom 14 on screens narrower than 900 px, and zoom 15 on wider ones, whenever following starts, including with My location, and whenever exploring starts at Deák Ferenc tér. In Budapest the 1 km circle has a radius of 310 px at zoom 15, which doesn't fit on a phone, and 155 px at zoom 14. Otherwise the map keeps the user's zoom, including when a walk moves the point.

Intro text: "Kilátó shows what's interesting within 1 km of you. Your location stays on your phone." / "A Kilátó megmutatja, mi érdekes 1 km-en belül körülötted. A helyzeted a telefonodon marad."

Dragging the map while following switches to exploring. A My location button switches back to following, and asks for the permission if needed. The map shows the point (the pin, or the location dot with its accuracy circle) and a 1 km circle around it.

### Loading places

1. On load, the page fetches `manifest.json`.
2. When the point moves, the page works out the cells within 1 km of it and fetches the ones the manifest lists and the page hasn't loaded yet. Loaded cells stay in memory.
3. The list holds the places within 1,000 m of the point, by haversine distance.

A failed fetch shows "Couldn't load places" / "Nem sikerült betölteni a helyeket" with a Retry button.

### List and map

Each row shows:

- the name;
- under it, in smaller type, the name in the UI language, when the place has one;
- the kind label and the distance, rounded to 10 m, such as "Café · 120 m";
- Open now or Closed now, when the hours are known;
- the Wikipedia link, when there is one.

The list shows the first 100 rows and a Show more button that adds 100 more. Every listed place is also a marker on the map: a circle in its category's colour, drawn on a canvas so that 2,000 markers stay usable. Tapping a row highlights its marker and opens a popup with the name, and pans the map if the marker is off screen. Tapping a marker highlights its row and scrolls it into view.

### Order

A toggle switches between Nearest, the default on every visit, and Most relevant. The category filter works with both.

- **Nearest** sorts by distance, nearest first.
- **Most relevant** sorts by a score in metres, lowest first. The score is the distance plus the adjustments below. Ties go to the nearer place, then by name.

| Signal | Adjustment |
|---|---|
| Has a Wikipedia article | −300 m |
| Sights | −200 m |
| Notable places, Culture & leisure | −100 m |
| Food & drink | −50 m |
| Services, Shops | 0 |
| Open now | −100 m |
| Closed now | +300 m |
| Hours unknown | 0 |

The weights sit in one table in `src/core/rank.ts`. Tests check outcomes, not the numbers, so the weights can be tuned later:

- A sight with a Wikipedia article 400 m away comes before a closed bakery 60 m away.
- An open café 300 m away comes before a closed café 50 m away.
- A shop with a Wikipedia article 250 m away comes before a shop without one 50 m away.
- Of two places with the same category, open status and article status, the nearer comes first.
- Nearest ignores everything but distance.

Labels: Nearest / Legközelebbi, Most relevant / Legérdekesebb.

### Category filter

A row of chips, one per category, in the category's colour. They are all on at the start of every visit. Tapping a chip turns it off or on, and the list and the map show only places whose category is on. When every chip is off, the list says so and offers to turn them all back on.

| Id | English | Hungarian |
|---|---|---|
| `sights` | Sights | Látnivalók |
| `notable` | Notable places | Nevezetes helyek |
| `food` | Food & drink | Étel és ital |
| `leisure` | Culture & leisure | Kultúra és szabadidő |
| `services` | Services | Szolgáltatások |
| `shops` | Shops | Üzletek |

### Open now

`src/core/hours.ts` works out the status from `hours`, `hoursWindowStart` and the clock:

- **open** when now falls inside one of the pairs;
- **closed** when it doesn't;
- **unknown** when the place has no `hours`, or now is outside the window.

The status is worked out whenever the list is built, and again every minute. Labels: Open now / Most nyitva, Closed now / Most zárva.

### Wikipedia links

The phone language is the primary subtag of `navigator.languages[0]`, such as `de` for `de-AT`. Switching the UI language doesn't change it, because the intent says the phone's language decides.

A place has one link, to the first of these that exists:

1. the article in the phone language;
2. the Hungarian article;
3. the English article.

The Hungarian and English titles are in the place itself. For any other phone language, the page fetches `wiki/<lang>.json` once, if the manifest lists it, and looks up the place's Wikidata id there. The link reads "Wikipedia · DE", with the language code in capitals, and opens `https://<lang>.wikipedia.org/wiki/<title>` in a new tab.

### Language and names

- The UI is in Hungarian when the phone language is `hu`, and in English otherwise. The HU | EN switch overrides that, and the choice is kept in `localStorage`. `<html lang>` follows the UI language.
- `src/i18n/hu.ts` and `src/i18n/en.ts` have the same keys, which a test checks. Dates and numbers are formatted with `Intl` in the UI language.
- A place's name shows as `name`. When the place has a name in the UI language (`names.hu` or `names.en`), it shows under that.

### Search

The search box finds places by name anywhere in the box. It loads `search.json` the first time it gets focus.

- Search starts at 2 characters.
- Matching ignores case and accents, so "kave" finds "Kávé". It looks in `name`, `names.hu` and `names.en`.
- Names that begin with the query come first, then the rest. Within each group, the place nearest the point comes first. At most 20 results show.
- Picking a result starts exploring with the point at that place, loads its cell and highlights its row.

`search.json` is the same for everyone, so loading it says nothing about where the user is.

### Outside Budapest

When the point is outside the coverage box, the list is replaced by "Kilátó covers Budapest only for now." / "A Kilátó egyelőre csak Budapestet ismeri." and a Go to Budapest / Irány Budapest button, which starts exploring at Deák Ferenc tér. The map still works.

### Data age

The footer shows the date of the data and its age: "Data from 2 Nov 2026 · 3 days old" / "Adatok: 2026. nov. 2. · 3 napos". The date is the older of `osmDataAt` and `wikipediaAt`. When the data is more than 10 days old, the line turns into a warning and adds "may be out of date" / "lehet, hogy elavult".

### What is sent where

A panel opened from the footer and from the intro. Its text:

**What is sent where**

- **Your location** stays on your phone. Kilátó uses it only to find and sort the places near you.
- **OpenStreetMap** sends the map images. It sees which part of the map is on screen and, as with any website, your IP address and browser.
- **GitHub Pages** hosts Kilátó. It sends the page and the places for the area you look at, in squares about 1 km wide, so it sees roughly which area that is.
- **Wikipedia** gets a request only when you open an article.
- No account, no cookies, no analytics. This browser remembers your language choice.

**Mi hová kerül**

- **A helyzeted** a telefonodon marad. A Kilátó csak arra használja, hogy megkeresse és sorba rendezze a közeli helyeket.
- **Az OpenStreetMap** küldi a térkép képeit. Látja, hogy a térkép melyik része van a képernyőn, és mint minden weboldal, az IP-címedet és a böngésződet.
- **A GitHub Pages** szolgálja ki a Kilátót. Tőle jön az oldal és a nézett környék helyei, nagyjából 1 km-es négyzetekben, így körülbelül látja, melyik környéket nézed.
- **A Wikipédia** csak akkor kap kérést, ha megnyitsz egy szócikket.
- Nincs fiók, süti és analitika. A választott nyelvet ez a böngésző jegyzi meg.

### About

A panel opened from the footer. It says, in both languages, that Kilátó is open source under the MIT licence, with a link to the repository. Map and place data are © OpenStreetMap contributors under the Open Database License. Article titles and positions come from Wikipedia under CC BY-SA 4.0, and the map is drawn with Leaflet.

### Map tiles

- Tiles come from `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, up to zoom 19.
- Leaflet's attribution control shows "© OpenStreetMap contributors", linked to `https://www.openstreetmap.org/copyright`.
- The page sets no Referrer-Policy, so tile requests carry the browser's default Referer, as the tile policy asks.
- Nothing loads tiles except Leaflet showing the current view. There is no prefetching and no service worker.

## Hosting and the weekly rebuild

### `ci.yml`

It runs on every pull request and every push to main: `npm ci`, install Playwright's Chromium, then `npm run verify`.

### `deploy.yml`

Triggers:

- a push to main;
- the schedule `17 3 * * 1`, Mondays at 03:17 UTC. The minute is odd because runs at the top of the hour can be late or dropped;
- `workflow_dispatch`, with a boolean input `rebuild_data`.

Steps:

1. Check out, set up Node 24 and run `npm ci`.
2. Restore the data cache with the key `data-<ISO week>`, from `date -u +%G-W%V`.
3. If the cache missed, or `rebuild_data` is true:
   - a. install `osmium-tool` with apt;
   - b. download `https://download.geofabrik.de/europe/hungary-latest.osm.pbf` and check it against its `.md5`;
   - c. run `npm run data:build`;
   - d. save the cache.
4. Run `npm run build` and copy the data into `dist/data/`.
5. Upload with `actions/upload-pages-artifact` and deploy with `actions/deploy-pages`.
6. Keep the schedule alive with `PUT /repos/{owner}/{repo}/actions/workflows/deploy.yml/enable`, using the workflow's token.

So the data is rebuilt once a week, by the first run of each ISO week, and code pushes in the same week reuse it. Permissions: `contents: read`, `pages: write`, `id-token: write` and `actions: write`. The concurrency group is `pages`, and a new run doesn't cancel one in progress.

GitHub disables scheduled workflows in public repos after 60 days without activity, and its docs don't define activity. Step 6 re-enables the workflow on every run, the same method keepalive tools use. We will only see it work after 60 quiet days. If it fails, the schedule stops, the data age warning appears after 10 days, and a manual run turns the workflow back on. GitHub also emails the repository owner when a scheduled run fails.

## Testing

Tests never call OpenStreetMap, Wikipedia or Geofabrik, and never read the real location.

- **Unit tests** (Vitest) cover `src/core/` and `scripts/data/`.
- **Fixtures** in `test/fixtures/`:
  - `osm/sample.geojsonseq`: osmium export lines covering every category rule, a polygon, a multipolygon, an unnamed place, a plaque, `name:en`, and the `wikidata` and `wikipedia` tags;
  - `wikipedia/`: API responses for a small box around Deák Ferenc tér, recorded once with `npm run record:wikipedia` and trimmed;
  - `site-data/`: a full data tree for the area around Deák Ferenc tér. `npm run data:fixture` makes it from the two fixtures above, with the clock fixed at 2026-11-02T03:17:00Z. A test fails when the committed copy is out of date;
  - `tile.png`: a blank 256 px tile.
- **Page tests** (Playwright with Chromium) run against `vite preview`. A shared fixture routes every request:
  - the page's own files pass through;
  - requests to `tile.openstreetmap.org` get `tile.png`;
  - requests under `/kilato/data/` get files from `site-data/`;
  - any other request fails the test.
- The location is faked with the browser context's `geolocation`, a refusal by not granting the permission, and walking with `setGeolocation`. Time is faked with `page.clock`.
- One page test checks the privacy promise. With the location at 47.49791, 19.05439, no request URL or body contains `47.497` or `19.054`.
- `npm run verify` runs the type check, the unit tests, the production build and the page tests. super-board's merge gate runs it.
- On the Pi, Playwright uses its own Chromium. If that doesn't run there, setting `CHROMIUM_PATH=/usr/bin/chromium` makes it use the system Chromium.

## Setup before the build starts

These steps are for the product owner, not for issues.

- [ ] Install Node 24 on the Pi. Debian 13's package is Node 20.
- [ ] Install `jq`, which super-board needs.
- [ ] Onboard super-board, with `verify_commands` set to `npm ci` and `npm run verify`.
- [ ] Set GitHub Pages to deploy from GitHub Actions before the deploy issue merges.
- [ ] After a reboot, unlock the keyring before starting a run.

## Build order

The issues are cut from this list once this spec is accepted. Each one is one PR, and each one cites the sections it builds.

| # | Issue | Builds | Blocked by |
|---|---|---|---|
| 1 | 🔧 [chore] setup: Vite, Preact, TypeScript, tests and CI | [Stack](#stack), [Testing](#testing) harness, `ci.yml`, the commands in AGENTS.md, an empty page titled Kilátó | none |
| 2 | ✨ [feat] i18n: pick HU or EN and switch it in the page | [Language and names](#language-and-names) | 1 |
| 3 | ✨ [feat] data: turn OpenStreetMap features into places | [Coverage box](#coverage-box), [Places from OpenStreetMap](#places-from-openstreetmap), [Categories](#categories), `types.ts`, `cells.ts` | 1 |
| 4 | ✨ [feat] i18n: labels for place kinds | Kind labels in [Categories](#categories) | 2, 3 |
| 5 | ✨ [feat] data: open times from opening hours | [Opening hours](#opening-hours) | 3 |
| 6 | ✨ [feat] data: fetch geotagged Wikipedia articles | [Articles from Wikipedia](#articles-from-wikipedia) | 3 |
| 7 | ✨ [feat] data: merge articles and write the data files | [Merge](#merge), [Data files](#data-files), [Checks before deploy](#checks-before-deploy), the site fixture | 5, 6 |
| 8 | 🔧 [chore] deploy: weekly data build and GitHub Pages | [`deploy.yml`](#deployyml) | 7 |
| 9 | ✨ [feat] map: OpenStreetMap map with location and exploring | [Map tiles](#map-tiles), [Location and the point](#location-and-the-point) | 2 |
| 10 | ✨ [feat] list: places within 1 km, nearest first | [Loading places](#loading-places), [List and map](#list-and-map), the privacy test | 4, 7, 9 |
| 11 | ✨ [feat] list: show whether a place is open now | [Open now](#open-now) | 10 |
| 12 | ✨ [feat] list: Wikipedia links in the phone's language | [Wikipedia links](#wikipedia-links) | 10 |
| 13 | ✨ [feat] list: filter by category | [Category filter](#category-filter) | 10 |
| 14 | ✨ [feat] list: most relevant order | [Order](#order) | 11 |
| 15 | ✨ [feat] search: find Kilátó's places by name | [Search](#search) | 10 |
| 16 | ✨ [feat] map: say Budapest only outside the box | [Outside Budapest](#outside-budapest) | 10 |
| 17 | ✨ [feat] footer: data age, what is sent where, about | [Data age](#data-age), [What is sent where](#what-is-sent-where), [About](#about) | 10 |
