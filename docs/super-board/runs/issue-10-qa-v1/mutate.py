#!/usr/bin/env python3
"""QA mutation check for #10. Breaks one line at a time, runs the card's tests, restores the file.
Usage: mutate.py <worktree> [--only <text in a break's name>]. Nothing here is ever committed; the script checks the tree is clean at the end.

No break here may reach the network. An earlier version of this list swapped in the global fetch, and that made the
tests call the live Wikipedia API before QA stopped it (see ci-and-security.txt). The two breaks of that kind now stand
in an offline function, which proves the same thing. Each run has a capped heap and a timeout that kills the whole
process group, because one break makes a test's recursion grow without limit."""
import os
import signal
import subprocess
import sys
from pathlib import Path

root = Path(sys.argv[1])
W = 'scripts/data/wikipedia.ts'
F = 'scripts/data/wikipedia-fixture.ts'

MUTANTS = [
    ('AC1', W, 'const TILE_HEIGHT = 0.05', 'const TILE_HEIGHT = 0.06', 'tile height'),
    ('AC1', W, 'const TILE_WIDTH = 0.075', 'const TILE_WIDTH = 0.05', 'tile width'),
    ('AC1', W, 'gsbbox: `${north}|${west}|${south}|${east}`', 'gsbbox: `${south}|${west}|${north}|${east}`', 'bbox corners swapped'),
    ('AC1', W, "gslimit: String(GEOSEARCH_LIMIT)", "gslimit: '50'", 'gslimit value'),
    ('AC1', W, "gsprimary: 'primary'", "gsprimary: 'all'", 'gsprimary value'),
    ('AC1', W, "gsnamespace: '0'", "gsnamespace: '1'", 'gsnamespace value'),
    ('AC1', W, 'found.length < GEOSEARCH_LIMIT', 'found.length <= GEOSEARCH_LIMIT', 'split at 501, not 500'),
    ('AC1', W, 'found.length < GEOSEARCH_LIMIT', 'found.length < GEOSEARCH_LIMIT - 1', 'split at 499'),
    ('AC1', W, 'Math.min(east, round(west + (column + 1) * TILE_WIDTH))', 'round(west + (column + 1) * TILE_WIDTH)', 'tile runs past the east edge'),
    ('AC1', W, 'const SMALLEST_SPLIT_WIDTH = 0.0001', 'const SMALLEST_SPLIT_WIDTH = 0.01', 'split floor raised to about 750 m'),
    ('AC1', W, 'const middleLon = round((west + east) / 2)', 'const middleLon = (west + east) / 2', 'split edge not rounded'),
    ('AC2', W, 'const PAGES_PER_CALL = 50', 'const PAGES_PER_CALL = 49', 'page ids per call'),
    ('AC2', W, 'i < ids.length; i += PAGES_PER_CALL', 'i <= ids.length; i += PAGES_PER_CALL', 'empty details call at a multiple of 50'),
    ('AC2', W, "prop: 'pageprops|langlinks'", "prop: 'pageprops'", 'prop value'),
    ('AC2', W, "ppprop: 'wikibase_item'", "ppprop: 'displaytitle'", 'ppprop value'),
    ('AC2', W, "lllimit: 'max'", "lllimit: '50'", 'lllimit value'),
    ('AC2', W, 'next = reply.continue', 'next = undefined', 'continue not followed'),
    ('AC2', W, 'page.q ??= pageprops?.wikibase_item', 'page.q = pageprops?.wikibase_item', 'a later reply wipes the Wikidata id'),
    ('AC3', W, "const USER_AGENT = 'Kilato/1.0 (https://github.com/kornel-schrenk/kilato)'", "const USER_AGENT = 'Kilato/1.0'", 'User-Agent text'),
    ('AC3', W, "maxlag: '5'", "maxlag: '50'", 'maxlag value'),
    ('AC3', W, "formatversion: '2'", "formatversion: '1'", 'formatversion value'),
    ('AC3', W, 'const MAX_RETRIES = 3', 'const MAX_RETRIES = 2', 'retries, fewer'),
    ('AC3', W, 'const MAX_RETRIES = 3', 'const MAX_RETRIES = 4', 'retries, more'),
    ('AC3', W, 'const FIRST_BACKOFF_MS = 5_000', 'const FIRST_BACKOFF_MS = 1_000', 'first wait'),
    ('AC3', W, 'FIRST_BACKOFF_MS * 2 ** retry', 'FIRST_BACKOFF_MS', 'backoff does not grow'),
    ('AC3', W, 'Math.max(FIRST_BACKOFF_MS * 2 ** retry, retryAfterSeconds * 1_000)', 'FIRST_BACKOFF_MS * 2 ** retry', 'Retry-After ignored'),
    ('AC3', W, 'if (!reply.error) return reply', 'return reply', 'a maxlag reply counts as success'),
    ('AC3', W, 'if (response.ok) {', 'if (true) {', 'HTTP status ignored'),
    ('AC3', W, "    let retryAfterSeconds = 0\n    try {", "    try {", 'SCOPE'),
    ('AC3', W,
     'for (const quarter of quarters(tile)) pages.push(...(await geosearch(quarter, api)))',
     'pages.push(...(await Promise.all(quarters(tile).map((quarter) => geosearch(quarter, api)))).flat())',
     'the four quarters run at once'),
    ('AC3', W,
     'for (const tile of tiles(box)) {\n    for (const page of await geosearch(tile, api)) pages.set(page.pageid, { ...page, langlinks: {} })\n  }',
     'for (const found of await Promise.all(tiles(box).map((tile) => geosearch(tile, api)))) {\n    for (const page of found) pages.set(page.pageid, { ...page, langlinks: {} })\n  }',
     'the tiles run at once'),
    ('AC3', W,
     'await addDetails(ids.slice(i, i + PAGES_PER_CALL), pages, api)\n  }',
     'void addDetails(ids.slice(i, i + PAGES_PER_CALL), pages, api)\n  }',
     'details calls run at once'),
    ('AC4', W, "['hu', 'en'] as const", "['en', 'hu'] as const", 'English position wins'),
    ('AC4', W, 'const key = q ?? `${edition}:${pageid}`', 'const key = `${edition}:${pageid}`', 'no merge by Wikidata id'),
    ('AC4', W, 'const key = q ?? `${edition}:${pageid}`', 'const key = q ?? title', 'pages with no id merge by title'),
    ('AC4', W, 'known.pageids[edition] = pageid', 'void pageid', 'second page id dropped'),
    ('AC4', W, '{ ...langlinks, ...known.titles, [edition]: title }', '{ ...known.titles, ...langlinks, [edition]: title }', 'a language link beats a page title'),
    ('AC4', W, 'known.pageids[edition] = pageid', 'known.pageids[edition] = pageid; known.lat = lat; known.lon = lon', 'merge moves the position'),
    ('AC5', F, 'if (!reply.error) responses[String(input)] = trimmed(reply)', 'responses[String(input)] = trimmed(reply)', 'records a failed reply'),
    ('AC5', F, "const KEPT_LANGUAGES = ['hu', 'en', 'de']", "const KEPT_LANGUAGES = ['hu', 'en']", 'language trim'),
    ('AC5', F, '...(next && { continue: next }),', '', 'recording drops continue'),
    ('AC5', F, "new Response(`Not recorded: ${input}`, { status: 404 })", "Response.json({ query: { geosearch: [] } })", 'replay answers a URL it never recorded'),
    ('AC5', W, 'const response = await fetch(url,', 'const response = await (async (_url: string, _init: RequestInit) => Response.json({ query: { geosearch: [], pages: [] } }))(url,', 'ignores the fetch parameter'),
]


def run_tests():
    env = {**os.environ, 'NODE_OPTIONS': '--max-old-space-size=512'}
    process = subprocess.Popen(
        ['npx', 'vitest', 'run', 'scripts/data/wikipedia', '--reporter=dot'],
        cwd=root, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True,
    )
    try:
        return 'pass' if process.wait(timeout=150) == 0 else 'fail'
    except subprocess.TimeoutExpired:
        return 'hang'
    finally:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass


def main():
    survived = 0
    print('| AC | Break | Result |')
    print('|---|---|---|')
    only = sys.argv[sys.argv.index('--only') + 1] if '--only' in sys.argv else None
    for ac, rel, old, new, name in MUTANTS:
        if only and only not in name and not (name == 'SCOPE' and only in 'Retry-After'):
            continue
        path = root / rel
        source = path.read_text()
        if name == 'SCOPE':
            name = 'Retry-After from an earlier attempt carries over'
            mutated = source.replace(old, new).replace(
                '  for (let retry = 0; ; retry++) {', '  let retryAfterSeconds = 0\n  for (let retry = 0; ; retry++) {'
            )
            count = source.count(old)
        else:
            count = source.count(old)
            mutated = source.replace(old, new, 1)
        if count != 1:
            print(f'| {ac} | {name} | NOT APPLIED ({count} matches) |', flush=True)
            continue
        path.write_text(mutated)
        try:
            outcome = run_tests()
        finally:
            path.write_text(source)
        word = {'fail': 'caught', 'hang': 'caught (hang)', 'pass': 'SURVIVED'}[outcome]
        survived += outcome == 'pass'
        print(f'| {ac} | {name} | {word} |', flush=True)
    print(f'\nsurvived: {survived}')
    clean = subprocess.run(['git', 'diff', '--exit-code', '--stat', '--', 'scripts'], cwd=root, capture_output=True, text=True)
    print('tree clean after run:', clean.returncode == 0)


main()
