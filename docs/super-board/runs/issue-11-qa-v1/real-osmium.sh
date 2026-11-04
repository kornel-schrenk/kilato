#!/usr/bin/env bash
# The real `npm run data:build`, with the real osmium-tool on a small hand-made extract and a stand-in
# for the Wikipedia API. It is no part of the test suite, and it runs with no network at all.
#   unshare -rn bash real-osmium.sh <project root> <folder with the osmium binary> <work folder>
set -u
root=$1; osmium_dir=$2; work=$3
mkdir -p "$work"; cd "$work"

cat > gen.py <<'EOF'
# 5,000 named cafes inside the box, and one of each case the spec names.
from xml.sax.saxutils import quoteattr as q
import sys
skip = int(sys.argv[1])
out = []
def node(i, lat, lon, tags=None):
    t = ''.join(f'<tag k={q(k)} v={q(v)}/>' for k, v in (tags or {}).items())
    out.append(f'<node id="{i}" version="1" timestamp="2026-11-01T00:00:00Z" lat="{lat}" lon="{lon}">{t}</node>')
for i in range(1 + skip, 5001):
    node(i, 47.40 + i * 0.00004, 19.00 + i * 0.00004, {'name': f'Kávézó {i}', 'amenity': 'cafe'})
node(6001, 47.4975, 19.0545, {'name': 'Wikidata hely', 'amenity': 'cafe', 'wikidata': 'Q1', 'opening_hours': '24/7'})
node(6002, 47.4976, 19.0546, {'name': 'Tag hely', 'amenity': 'cafe', 'wikipedia': 'hu:Cikk_2'})
node(6003, 47.4977, 19.0547, {'name': 'Nem letöltött', 'amenity': 'cafe', 'wikipedia': 'en:Not_Fetched_Title'})
node(6004, 47.4978, 19.0548, {'amenity': 'cafe'})  # no name: left out
node(6005, 47.4979, 19.0549, {'name': 'Emléktábla', 'historic': 'memorial', 'memorial': 'plaque'})  # plaque: left out
node(6006, 48.0, 19.0, {'name': 'Kívül', 'amenity': 'cafe'})  # outside the box: left out
node(6007, 47.4980, 19.0550, {'name': 'Iroda', 'office': 'company'})  # office: not in the table
for i, (la, lo) in enumerate([(47.50, 19.05), (47.50, 19.051), (47.501, 19.051), (47.501, 19.05)]): node(7001 + i, la, lo)
for i, (la, lo) in enumerate([(47.51, 19.06), (47.511, 19.061)]): node(7101 + i, la, lo)
out.append('<way id="8001" version="1" timestamp="2026-11-01T00:00:00Z"><nd ref="7001"/><nd ref="7002"/><nd ref="7003"/><nd ref="7004"/><nd ref="7001"/><tag k="name" v="Múzeum"/><tag k="tourism" v="museum"/></way>')
out.append('<way id="8002" version="1" timestamp="2026-11-01T00:00:00Z"><nd ref="7101"/><nd ref="7102"/><tag k="name" v="Nyitott"/><tag k="amenity" v="cafe"/></way>')
print('<?xml version="1.0" encoding="UTF-8"?><osm version="0.6">' + ''.join(out) + '</osm>')
EOF

cat > stub.mjs <<'EOF'
// Stands in for the Wikipedia API and its backoff in the real command, and only there.
if (process.argv[1]?.endsWith('build.ts')) {
  const realSetTimeout = globalThis.setTimeout
  globalThis.setTimeout = (callback) => realSetTimeout(callback, 0)
  const wanted = process.env.FAKE_ARTICLES
  let next = 1
  let calls = 0
  process.on('exit', () => console.error(`[stand-in] Wikipedia calls: ${calls}`))
  globalThis.fetch = async (input) => {
    calls++
    if (wanted === 'down') return new Response('down', { status: 503 })
    const url = new URL(String(input))
    if (url.searchParams.get('list') === 'geosearch') {
      const count = url.hostname.startsWith('hu.') ? Math.min(100, Number(wanted) - next + 1) : 0
      const geosearch = Array.from({ length: count }, () => {
        const pageid = next++
        return { pageid, title: `Cikk ${pageid}`, lat: 47.5, lon: 19.05 }
      })
      return Response.json({ query: { geosearch } })
    }
    const pages = url.searchParams.get('pageids').split('|').map((id) => ({ pageid: Number(id), pageprops: { wikibase_item: `Q${id}` }, langlinks: [{ lang: 'de', title: `Artikel ${id}` }] }))
    return Response.json({ query: { pages } })
  }
}
EOF

OSM=$osmium_dir/osmium
$OSM --version | head -1
python3 gen.py 0 > full.osm
python3 gen.py 5 > few.osm
STAMP=--output-header=osmosis_replication_timestamp=2026-11-01T21:21:02Z
$OSM cat full.osm "$STAMP" -O -o full.osm.pbf
$OSM cat few.osm "$STAMP" -O -o few.osm.pbf
$OSM cat full.osm -O -o nostamp.osm.pbf

cd "$root"
run() {
  label=$1; articles=$2; pbf=$3
  rm -rf "$work/out"
  echo; echo "===== $label"
  FAKE_ARTICLES=$articles NODE_OPTIONS="--import=$work/stub.mjs" TZ=UTC PATH="$osmium_dir:$PATH" \
    npm run --silent data:build -- --pbf "$work/$pbf" --out "$work/out" > "$work/stdout" 2> "$work/stderr"
  code=$?
  sed "s#$work/##g" "$work/stdout"
  grep -E '^(Error|RangeError)|Open failed|\[stand-in\]' "$work/stderr" | sed "s#$work/##g" | cut -c1-120
  echo "exit=$code  out folder: $([ -e "$work/out" ] && echo written || echo 'not written')"
}
run 'at the minimums: 5,004 places, 1,500 articles' 1500 full.osm.pbf
python3 - "$work/out" <<'EOF'
import glob, json, os, sys
o = sys.argv[1]
m = json.load(open(o + '/manifest.json'))
print('manifest:', {k: m[k] for k in m if k != 'cells'}, '· cells:', len(m['cells']))
places = [p for f in glob.glob(o + '/cells/*.json') for p in json.load(open(f))['places']]
names = {p['name']: p for p in places}
print('in cells:', len(places), '· in search.json:', len(json.load(open(o + '/search.json'))['places']), '· notable:', sum(p['cat'] == 'notable' for p in places))
print('cell files equal manifest.cells:', sorted(os.path.basename(f)[:-5] for f in glob.glob(o + '/cells/*.json')) == m['cells'])
print('files:', sorted(os.listdir(o)), os.listdir(o + '/wiki'))
for n in ['Wikidata hely', 'Tag hely', 'Nem letöltött', 'Múzeum']:
    print(' ', n, names[n])
print('  left out:', {n: names.get(n) for n in ['Nyitott', 'Emléktábla', 'Kívül', 'Iroda']})
EOF
run '1,499 articles' 1499 full.osm.pbf
run 'Wikipedia answers 503 to every call' down full.osm.pbf
run '4,999 places' 1500 few.osm.pbf
run 'an extract with no replication timestamp' 1500 nostamp.osm.pbf
run 'a missing extract' 1500 none.osm.pbf

echo; echo '===== a failed build keeps the last good data'
mkdir -p "$work/keep/cells"; echo keep > "$work/keep/cells/1_1.json"
FAKE_ARTICLES=down NODE_OPTIONS="--import=$work/stub.mjs" PATH="$osmium_dir:$PATH" npm run --silent data:build -- --pbf "$work/full.osm.pbf" --out "$work/keep" > /dev/null 2>&1
echo "exit=$?  cells/1_1.json still says: $(cat "$work/keep/cells/1_1.json")"
