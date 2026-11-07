# Kilátó: project brief for super-board

Kilátó, a pocket lookout tower: a static web page that shows what is interesting within 1 km of you, on a map and in a list. It starts in Budapest.

## Where the truth lives

| What | Where |
|---|---|
| What and why, product constraints | [`intent/2026-10-25-kilato-mvp.md`](../../intent/2026-10-25-kilato-mvp.md) |
| How: stack, data files, rules, tests, build order | [`spec/2026-11-02-kilato-mvp.md`](../../spec/2026-11-02-kilato-mvp.md) |
| How work flows, conventions | [`AGENTS.md`](../../AGENTS.md) |
| Ticket format | [`docs/agents/issue-tracker.md`](../agents/issue-tracker.md) |

An issue that asks for more than the spec says is out of scope. When an issue and the spec disagree, the spec wins. Block the card with ❓ instead of guessing.

## Shape

- **Weekly data build** (GitHub Actions): it cuts Budapest's places from the OpenStreetMap Hungary extract with osmium, fetches geotagged Hungarian and English Wikipedia articles, merges them and writes static JSON files.
- **Page** (GitHub Pages): Preact with Vite, plus Leaflet with OpenStreetMap tiles. It loads the data files around the phone's location and does all its work on the phone.
- **Stack:** TypeScript (strict), Node 24 LTS with npm, Vitest, and Playwright with Chromium.
- **Checks:** `npm ci`, then `npm run verify`. The setup issue, first in the spec's build order, creates them.

## Branches

All work merges into `develop`. `main` is live, and the deploy workflow publishes it to GitHub Pages. Only a promotion PR, merged by the product owner, moves `develop` to `main`.

## Out of scope

- Jobs and events, firms and offices without a storefront, cities other than Budapest, accounts and saved places, and native apps (the intent's "Not now").
- Unnamed places, memorial plaques and stolpersteine (the spec's decision 4).
- Any request from the phone to OpenStreetMap or Wikipedia APIs, sending the location anywhere, API keys, and a server.
- Tests that reach live services. Tests use recorded fixtures and a faked location.
