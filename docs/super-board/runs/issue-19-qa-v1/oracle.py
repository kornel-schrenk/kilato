# Independent check of the search order and of search.json against the cells, from the committed fixture.
import json, math, glob, unicodedata, os, sys
root = sys.argv[1]
search = json.load(open(os.path.join(root, 'search.json')))['places']
cells = {}
for f in glob.glob(os.path.join(root, 'cells', '*.json')):
    for p in json.load(open(f))['places']:
        cells[p['id']] = (os.path.basename(f)[:-5], p)
manifest = json.load(open(os.path.join(root, 'manifest.json')))
print('search places', len(search), 'cell places', len(cells), 'manifest cells', len(manifest['cells']))
missing = [p['id'] for p in search if p['id'] not in cells]
print('in search but in no cell:', missing)
print('in a cell but not in search:', [i for i in cells if i not in {p['id'] for p in search}])
bad = []
for p in search:
    if p['id'] in cells:
        c = cells[p['id']][1]
        for k in ('lat', 'lon', 'name', 'cat'):
            if c[k] != p[k]: bad.append((p['id'], k, c[k], p[k]))
        if c.get('names') != p.get('names'): bad.append((p['id'], 'names'))
        key = f"{math.floor(p['lat']*100)}_{math.floor(p['lon']*200/3)}"
        if key != cells[p['id']][0]: bad.append((p['id'], 'cell', key, cells[p['id']][0]))
print('field or cell mismatches:', bad)
def fold(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s) if not unicodedata.category(c).startswith('M')).lower()
def dist(a, b):
    R = 6371000
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2-la1)/2)**2 + math.cos(la1)*math.cos(la2)*math.sin((lo2-lo1)/2)**2
    return 2*R*math.asin(math.sqrt(h))
deak = (47.4975, 19.0545)
for q in ('kave', 'KÁVÉ', 'muz', 'Lanc', 'ka'):
    w = fold(q.strip())
    res = []
    for p in search:
        names = [p['name']] + [v for v in (p.get('names') or {}).values()]
        folded = [fold(n) for n in names]
        if any(w in n for n in folded):
            res.append((not any(n.startswith(w) for n in folded), dist(deak, (p['lat'], p['lon'])), p['name']))
    res.sort(key=lambda r: (r[0], r[1]))
    print(q, '->', len(res), [r[2] for r in res][:20])
