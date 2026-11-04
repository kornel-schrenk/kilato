# The mutation pass behind mutants.txt. Run it with no network, because one mutant drops the real build's
# minimums, and the old real-command test would then go on to the live Wikipedia API:
#   unshare -rn python3 -I mutate.py <copy of the tree, with node_modules linked> <report file>
import json, os, subprocess, sys, shutil
root, report = sys.argv[1], sys.argv[2]
NEW = ['exits non-zero with fewer than 1,500 articles', 'exits non-zero when a Wikipedia call still fails', 'exits 0 at the minimums']
M = [
 # merge
 ('merge: greedy parenthesis', 'scripts/data/merge.ts', r"/ \([^()]*\)$/", r"/ \(.*\)$/"),
 ('merge: tag link keeps underscores', 'scripts/data/merge.ts', "const match = tagTitle(tag)?.match(", "const match = tag?.match("),
 ('merge: tag match keeps underscores', 'scripts/data/merge.ts', "({ wikipedia }) => tagTitle(wikipedia))", "({ wikipedia }) => wikipedia)"),
 ('merge: any language in tag link', 'scripts/data/merge.ts', "/^(hu|en):(.+)$/", r"/^(\w+):(.+)$/"),
 ('merge: wikidata match still reaches the tag rule', 'scripts/data/merge.ts', "if (!places) withoutWikidataMatch.push(article)", "withoutWikidataMatch.push(article)"),
 ('merge: tag match overwrites wikidata match', 'scripts/data/merge.ts', "if (!attached.has(place)) attached.set(place, wikiOf(article))", "attached.set(place, wikiOf(article))"),
 ('merge: tag link beats attached article', 'scripts/data/merge.ts', "attached.get(osmPlace) ?? linkFromTag(wikipedia)", "linkFromTag(wikipedia) ?? attached.get(osmPlace)"),
 ('merge: English name first', 'scripts/data/merge.ts', "titles.hu ?? titles.en", "titles.en ?? titles.hu"),
 ('merge: edition ids swapped', 'scripts/data/merge.ts', "pageids.hu ? `huwiki:${pageids.hu}` : `enwiki:${pageids.en}`", "pageids.en ? `enwiki:${pageids.en}` : `huwiki:${pageids.hu}`"),
 ('merge: unrounded notable lat', 'scripts/data/merge.ts', "lat: round5(lat)", "lat"),
 ('merge: names.en kept when equal', 'scripts/data/merge.ts', "en && en !== name &&", "en &&"),
 ('merge: en tag rule dropped', 'scripts/data/merge.ts', "[`hu:${article.titles.hu}`, `en:${article.titles.en}`]", "[`hu:${article.titles.hu}`]"),
 ('merge: notable dropped', 'scripts/data/merge.ts', "return [...places, ...notable.map(notablePlace)]", "return places"),
 ('merge: opening_hours leaks', 'scripts/data/merge.ts', "const { wikidata, wikipedia, opening_hours, ...place } = osmPlace", "const { wikidata, wikipedia, ...place } = osmPlace"),
 # write
 ('write: en gets a wiki file', 'scripts/data/write.ts', "if (lang === 'hu' || lang === 'en') continue", "if (lang === 'hu') continue"),
 ('write: stale folders stay', 'scripts/data/write.ts', "rmSync(join(out, folder), { recursive: true, force: true })", ""),
 ('write: no-q article in wiki files', 'scripts/data/write.ts', "if (!q) continue", ""),
 ('write: search carries wiki', 'scripts/data/write.ts', "places.map(({ id, cat, lat, lon, name, names }) => ({ id, cat, lat, lon, name, names }))", "places"),
 ('write: no licence', 'scripts/data/write.ts', "writeFileSync(join(out, 'LICENSE.txt'), LICENSE)", ""),
 ('write: wikiLangs lists nothing', 'scripts/data/write.ts', "wikiLangs: [...wiki.keys()].sort()", "wikiLangs: []"),
 # build
 ('build: 5,000 boundary', 'scripts/data/build.ts', "osmPlaces.length < minimums.places", "osmPlaces.length <= minimums.places"),
 ('build: 1,500 boundary', 'scripts/data/build.ts', "articles.length < minimums.articles", "articles.length <= minimums.articles"),
 ('build: 1,500 check gone', 'scripts/data/build.ts', "if (minimums && articles.length < minimums.articles) {", "if (false) {"),
 ('build: window starts at now', 'scripts/data/build.ts', "const windowStart = windowStartOn(startedAt)", "const windowStart = startedAt"),
 ('build: wikipediaAt is the finish', 'scripts/data/build.ts', "wikipediaAt: startedAt.toISOString()", "wikipediaAt: now().toISOString()"),
 ('build: builtAt is the start', 'scripts/data/build.ts', "builtAt: now().toISOString()", "builtAt: startedAt.toISOString()"),
 ('build: empty timestamp allowed', 'scripts/data/build.ts', "if (!timestamp) throw new Error(`${pbf} has no replication timestamp`)", ""),
 ('build: real build skips minimums', 'scripts/data/build.ts', "minimums: MINIMUMS,", ""),
 ('build: working folder stays', 'scripts/data/build.ts', "rmSync(folder, { recursive: true, force: true })", ""),
 ('cli: real command has no Wikipedia', 'scripts/data/build.ts', "      fetch,\n      now: () => new Date(),", "      fetch: (async () => Response.json({ query: { geosearch: [] } })) as typeof fetch,\n      now: () => new Date(),"),
 ('cli: pbf and out swapped', 'scripts/data/build.ts', "    { pbf, out },\n", "    { pbf: out, out: pbf },\n"),
 ('cli: rejection swallowed', 'scripts/data/build.ts', "  const { places, articles } = await buildFromExtract(\n    { pbf, out },\n    {\n      osmium: (args) => execFileSync('osmium', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }),\n      fetch,\n      now: () => new Date(),\n    },\n  )", "  const { places, articles } = await buildFromExtract(\n    { pbf, out },\n    {\n      osmium: (args) => execFileSync('osmium', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }),\n      fetch,\n      now: () => new Date(),\n    },\n  ).catch((error) => { if (!String(error).includes('Wikipedia')) throw error; console.error(String(error)); process.exit(0) })"),
 ('cli: TZ gone from the npm script', 'package.json', '"data:build": "TZ=Europe/Budapest node', '"data:build": "node'),
 ('cli: real clock replaced', 'scripts/data/build.ts', "now: () => new Date(),", "now: () => new Date('2026-11-02T12:00:00Z'),"),
 # fixture
 ('fixture: another clock', 'scripts/data/build-fixture.ts', "2026-11-02T03:17:00Z", "2026-11-02T04:17:00Z"),
 ('fixture: minimums applied', 'scripts/data/build-fixture.ts', "now: () => NOW,", "now: () => NOW,\n    minimums: { places: 5_000, articles: 1_500 },"),
 ('fixture: TZ gone from the npm script', 'package.json', '"data:fixture": "TZ=Europe/Budapest node', '"data:fixture": "node'),
]
def run():
    out = os.path.join(root, 'result.json')
    if os.path.exists(out): os.remove(out)
    subprocess.run(['npx','vitest','run','scripts/data/merge','scripts/data/write','scripts/data/build','scripts/data/hours','--reporter=json','--outputFile='+out], cwd=root, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=400)
    data = json.load(open(out))
    failed = []
    for f in data['testResults']:
        failed += [a['fullName'] for a in f['assertionResults'] if a['status']=='failed']
        if f.get('status')=='failed' and not f['assertionResults']: failed.append('(suite error) '+os.path.basename(f['name']))
    return data['numTotalTests'], failed
total, failed = run()
lines = [f'baseline: {total} tests, {len(failed)} failed']
print(lines[-1], flush=True)
assert not failed, failed
for name, path, old, new in M:
    full = os.path.join(root, path)
    src = open(full, encoding='utf8').read()
    if src.count(old) != 1:
        lines.append(f'NOT APPLIED {name}: {src.count(old)} matches'); print(lines[-1], flush=True); continue
    open(full,'w',encoding='utf8').write(src.replace(old,new))
    try:
        _, failed = run()
    finally:
        open(full,'w',encoding='utf8').write(src)
    newonly = failed and all(any(n in t for n in NEW) for t in failed)
    verdict = 'SURVIVED' if not failed else ('killed only by the new tests' if newonly else 'killed')
    lines.append(f'{verdict:32} {name}  ({len(failed)} failing)')
    if newonly: lines += ['    ' + t for t in failed]
    print(lines[-1], flush=True)
    open(report,'w',encoding='utf8').write('\n'.join(lines)+'\n')
_, failed = run()
lines.append(f'restored: {len(failed)} failed')
open(report,'w',encoding='utf8').write('\n'.join(lines)+'\n')
print(lines[-1], flush=True)
