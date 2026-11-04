# Works out the merge from the two source fixtures by the spec's words, without the project's code,
# and compares it with the committed site-data.
import json, re, sys, glob, os, collections
root = sys.argv[1]
fx = os.path.join(root, 'test/fixtures')
resp = json.load(open(fx + '/wikipedia/responses.json'))
geo, det = {'hu': {}, 'en': {}}, {'hu': {}, 'en': {}}
for url, reply in resp.items():
    ed = re.match(r'https://(hu|en)\.', url).group(1)
    q = reply['query']
    for p in q.get('geosearch', []): geo[ed][p['pageid']] = p
    for p in q.get('pages', []):
        d = det[ed].setdefault(p['pageid'], {'q': None, 'll': {}})
        d['q'] = d['q'] or (p.get('pageprops') or {}).get('wikibase_item')
        for l in p.get('langlinks') or []: d['ll'][l['lang']] = l['title']
arts = {}
for ed in ('hu', 'en'):
    for pid, p in geo[ed].items():
        d = det[ed].get(pid, {'q': None, 'll': {}})
        key = d['q'] or f'{ed}:{pid}'
        a = arts.get(key)
        if a:
            a['pageids'][ed] = pid
            a['titles'] = {**d['ll'], **a['titles'], ed: p['title']}
        else:
            arts[key] = {'q': d['q'], 'lat': p['lat'], 'lon': p['lon'], 'pageids': {ed: pid}, 'titles': {**d['ll'], ed: p['title']}}
print('articles', len(arts), 'without q', sum(1 for a in arts.values() if not a['q']))
tree = {}
for f in glob.glob(fx + '/site-data/cells/*.json'):
    for p in json.load(open(f))['places']: tree[p['id']] = p
print('places in tree', len(tree))
osm = [json.loads(l) for l in open(fx + '/osm/sample.geojsonseq') if l.strip()]
def pid(fid):
    if fid[0] != 'a': return fid
    n = int(fid[1:]); return f'w{n//2}' if n % 2 == 0 else f'r{(n-1)//2}'
tagged = {pid(f['id']): f['properties'] for f in osm if pid(f['id']) in tree}
print('osm places kept', len(tagged), ' with wikidata', sum('wikidata' in t for t in tagged.values()), ' with wikipedia', sum('wikipedia' in t for t in tagged.values()))
bad = []
by_q = collections.defaultdict(list); by_tag = collections.defaultdict(list)
for i, t in tagged.items():
    if 'wikidata' in t: by_q[t['wikidata']].append(i)
    if 'wikipedia' in t: by_tag[t['wikipedia'].replace('_', ' ')].append(i)
expected = {}; notable = []
for a in arts.values():
    hit = by_q.get(a['q']) if a['q'] else None
    if hit:
        for i in hit: expected[i] = a
for a in arts.values():
    if a['q'] and by_q.get(a['q']): continue
    hit = by_tag.get('hu:' + a['titles'].get('hu', '\0'), []) + by_tag.get('en:' + a['titles'].get('en', '\0'), [])
    if not hit: notable.append(a); continue
    for i in hit: expected.setdefault(i, a)
cut = lambda s: re.sub(r' \([^()]*\)$', '', s)
import math
r5 = lambda v: math.floor(v * 1e5 + 0.5) / 1e5  # half up, the same rounding as Math.round
for i, t in tagged.items():
    want = None
    if i in expected:
        a = expected[i]; want = {k: v for k, v in (('q', a['q']), ('hu', a['titles'].get('hu')), ('en', a['titles'].get('en'))) if v}
    elif re.match(r'(hu|en):.+', t.get('wikipedia', '')):
        lang, title = t['wikipedia'].split(':', 1); want = {lang: title.replace('_', ' ')}
    if tree[i].get('wiki') != want: bad.append((i, tree[i].get('wiki'), want))
    for k in ('wikidata', 'wikipedia', 'opening_hours'):
        if k in tree[i]: bad.append((i, 'tag leaked', k))
for a in notable:
    i = a['q'] or (f"huwiki:{a['pageids']['hu']}" if 'hu' in a['pageids'] else f"enwiki:{a['pageids']['en']}")
    p = tree.get(i)
    name = cut(a['titles'].get('hu') or a['titles']['en'])
    en = cut(a['titles']['en']) if 'en' in a['titles'] else None
    want = {'id': i, 'cat': 'notable', 'kind': 'article', 'lat': r5(a['lat']), 'lon': r5(a['lon']), 'name': name}
    if en and en != name: want['names'] = {'en': en}
    want['wiki'] = {k: v for k, v in (('q', a['q']), ('hu', a['titles'].get('hu')), ('en', a['titles'].get('en'))) if v}
    if p != want: bad.append((i, p, want))
extra = set(tree) - set(tagged) - {(a['q'] or (f"huwiki:{a['pageids']['hu']}" if 'hu' in a['pageids'] else f"enwiki:{a['pageids']['en']}")) for a in notable}
print('notable by oracle', len(notable), ' notable in tree', sum(p['cat'] == 'notable' for p in tree.values()), ' attached by oracle', len(expected))
print('places neither from OSM nor notable:', sorted(extra)[:5])
print('differences:', len(bad)); [print(' ', b) for b in bad[:10]]
# wiki files and search
de = json.load(open(fx + '/site-data/wiki/de.json'))
want_de = {a['q']: a['titles']['de'] for a in arts.values() if a['q'] and 'de' in a['titles']}
print('de.json matches', de == want_de, len(de))
ss = json.load(open(fx + '/site-data/search.json'))['places']
print('search ids unique', len({p['id'] for p in ss}) == len(ss), ' fields ok', all(set(p) <= {'id','cat','lat','lon','name','names'} for p in ss))
# cell keys, by the spec's formula
import math
wrong = [(p['id'], f) for f in glob.glob(fx + '/site-data/cells/*.json') for p in json.load(open(f))['places'] if f"{math.floor(p['lat']*100)}_{math.floor(p['lon']*200/3)}" != os.path.basename(f)[:-5]]
print('cell key errors', len(wrong))
