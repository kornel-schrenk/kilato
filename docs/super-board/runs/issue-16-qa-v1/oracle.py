#!/usr/bin/env python3
"""QA's oracle for #16. It works out each row's link from the fixture and the spec on its own, and compares the page's dump."""
import glob, json, math, os, sys
from urllib.parse import urlparse, unquote
root, probe = sys.argv[1], sys.argv[2]
data = os.path.join(root, 'test/fixtures/site-data')
manifest = json.load(open(os.path.join(data, 'manifest.json')))
langs = set(manifest['wikiLangs'])
titles = {l: json.load(open(os.path.join(data, f'wiki/{l}.json'))) for l in langs}
places = [p for f in glob.glob(os.path.join(data, 'cells/*.json')) for p in json.load(open(f))['places']]
by_name = {}
for p in places: by_name.setdefault(p['name'], []).append(p)

def expected(place, phone):
    wiki = place.get('wiki')
    if not wiki: return None
    if phone == 'hu': order = [('hu', wiki.get('hu')), ('en', wiki.get('en'))]
    elif phone == 'en': order = [('en', wiki.get('en')), ('hu', wiki.get('hu'))]
    else:
        inphone = titles[phone].get(wiki.get('q')) if phone in langs else None
        order = [(phone, inphone), ('hu', wiki.get('hu')), ('en', wiki.get('en'))]
    for lang, title in order:
        if title: return lang, title

def ok(row, want):
    if want is None: return row['href'] is None and row['text'] is None
    lang, title = want
    u = urlparse(row['href'])
    return (u.scheme == 'https' and u.netloc == f'{lang}.wikipedia.org' and u.path.startswith('/wiki/')
        and not u.query and not u.fragment
        and unquote(u.path[6:]).replace('_', ' ') == title.replace('_', ' ')
        and row['text'] == f'Wikipedia · {lang.upper()}' and row['target'] == '_blank')

status = 0
for locale, phone in [('de-AT','de'),('fr-FR','fr'),('es-ES','es'),('zh-Hant-TW','zh'),('hu-HU','hu'),('en-GB','en')]:
    rows = json.load(open(os.path.join(probe, f'rows-{locale}.json')))
    bad, kinds, ambiguous = [], {}, 0
    for row in rows:
        candidates = by_name[row['name']]
        wants = [expected(p, phone) for p in candidates]
        if not any(ok(row, w) for w in wants): bad.append((row, wants))
        if len(candidates) > 1: ambiguous += 1
        if row['text']: kinds[row['text']] = kinds.get(row['text'], 0) + 1
    print(f"{locale}: {len(rows)} rows, {len(bad)} wrong, {ambiguous} rows share a name with another place, links {dict(sorted(kinds.items()))}")
    for b in bad[:5]: print('  WRONG', b)
    if bad: status = 1
sys.exit(status)
