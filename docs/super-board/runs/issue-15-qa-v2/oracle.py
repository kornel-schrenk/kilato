#!/usr/bin/env python3
"""QA's oracle for #15. It works out each row's status from the fixture and the spec on its own, and compares the page's dump."""
import glob, json, os, re, sys
from datetime import datetime, timezone
root, probe = sys.argv[1], sys.argv[2]
data = os.path.join(root, 'test/fixtures/site-data')
manifest = json.load(open(os.path.join(data, 'manifest.json')))
start = datetime.fromisoformat(manifest['hoursWindowStart'].replace('Z', '+00:00'))
places = [p for f in glob.glob(os.path.join(data, 'cells/*.json')) for p in json.load(open(f))['places']]
by_name = {}
for p in places: by_name.setdefault(p['name'], []).append(p)
labels = {'en-GB': ('Open now', 'Closed now'), 'de-AT': ('Open now', 'Closed now'), 'hu-HU': ('Most nyitva', 'Most zárva')}

def expected(place, minutes, words):
    if 'hours' not in place: return None
    if minutes < 0 or minutes >= 14 * 24 * 60: return None
    return words[0] if any(a <= minutes < b for a, b in place['hours']) else words[1]

status = 0
files = sorted(glob.glob(os.path.join(probe, 'rows-*.json')))
print(f'window start {manifest["hoursWindowStart"]} · {len(places)} places in the fixture, {sum("hours" in p for p in places)} with hours')
print(f'{len(files)} dumps, 308 rows each')
for path in files:
    locale, stamp = re.match(r'rows-([a-zA-Z-]+?)-(\d{4}-\d\d-\d\dT.+)\.json', os.path.basename(path)).groups()
    m = re.match(r'(\d{4}-\d\d-\d\dT)(\d\d)(\d\d)(\d\d)(\d{3})Z', stamp)
    when = datetime.fromisoformat(f'{m[1]}{m[2]}:{m[3]}:{m[4]}.{m[5]}+00:00')
    minutes = (when - start).total_seconds() / 60
    rows = json.load(open(path))
    bad, counts = [], {'open': 0, 'closed': 0, 'none': 0}
    for row in rows:
        wants = {expected(p, minutes, labels[locale]) for p in by_name[row['name']]}
        got = row['status']
        if row['statusCount'] > 1 or got not in wants: bad.append((row['name'], got, sorted(map(str, wants))))
        counts['none' if got is None else 'open' if got == labels[locale][0] else 'closed'] += 1
    print(f'{locale} {when.isoformat(timespec="milliseconds")[:23]}Z minute {minutes:.5f}: {len(rows)} rows, open {counts["open"]}, closed {counts["closed"]}, none {counts["none"]}, wrong {len(bad)}')
    for b in bad[:10]: print('   WRONG', b)
    if bad: status = 1
sys.exit(status)
