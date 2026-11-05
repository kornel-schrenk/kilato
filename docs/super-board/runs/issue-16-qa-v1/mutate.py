#!/usr/bin/env python3
"""QA's mutants on the #16 PR. Each one must land (the file changes), runs, and is restored. None reaches a commit."""
import os, pathlib, re, subprocess, sys
root = pathlib.Path(sys.argv[1]); out = pathlib.Path(sys.argv[2]); which = sys.argv[3] if len(sys.argv) > 3 else ''
U = 'unit'; P = 'page'
W = 'src/core/wiki.ts'; L = 'src/data/places.ts'; A = 'src/ui/App.tsx'; H = 'src/ui/usePlaces.ts'; R = 'src/ui/PlaceList.tsx'; G = 'src/core/lang.ts'
M = [
 (U,'AC1 phoneLanguage takes the last language',G,'languages[0]','languages[languages.length - 1]'),
 (U,'AC1 phoneLanguage keeps the region',G,".split('-')[0]",''),
 (P,'AC1 the page passes the whole tag',A,'phoneLanguage(navigator.languages))','navigator.languages[0])'),
 (P,'AC1 the link follows the UI language',H,'wikiLink(place.wiki, phone, loader.wikiTitles)','wikiLink(place.wiki, document.documentElement.lang, loader.wikiTitles)'),
 (P,'AC1 the loader gets the UI language',A,'usePlaces(point.point, phone)','usePlaces(point.point, lang)'),
 (P,'AC1 a saved UI language replaces the phone language',A,'useState(() => phoneLanguage(navigator.languages))','useState(() => savedLang() ?? phoneLanguage(navigator.languages))'),
 (U,'AC2 the phone language article skipped',W,'if (inPhoneLanguage) return linkTo(phone, inPhoneLanguage)',''),
 (U,'AC2 English before Hungarian',W,"(['hu', 'en'] as const)","(['en', 'hu'] as const)"),
 (U,'AC2 Hungarian before English on an English phone',W,"(['en', 'hu'] as const)","(['hu', 'en'] as const)"),
 (U,'AC2 no English fallback',W,"(['hu', 'en'] as const)","(['hu'] as const)"),
 (U,'AC2 looks up by Hungarian title, not Wikidata id',W,'wiki.q && phoneTitles?.[wiki.q]','wiki.hu && phoneTitles?.[wiki.hu]'),
 (U,'AC2 the phone title under the Hungarian host',W,'linkTo(phone, inPhoneLanguage)',"linkTo('hu', inPhoneLanguage)"),
 (U,'AC2 the phone article only when there is a Hungarian or English one',W,'const inPhoneLanguage = wiki.q && phoneTitles?.[wiki.q]','const inPhoneLanguage = (wiki.hu || wiki.en) && wiki.q && phoneTitles?.[wiki.q]'),
 (U,'AC2 titles asked for on every move',L,'!wikiTitles && manifest.wikiLangs','manifest.wikiLangs'),
 (U,'AC2 titles asked for when the manifest does not list them',L,'!wikiTitles && manifest.wikiLangs.includes(phone)','!wikiTitles && phone'),
 (U,'AC2 a request on its way asked for again',L,'if (onItsWay.has(path)) return',''),
 (U,'AC2 the title file dropped',L,'wikiTitles = file','void file'),
 (U,'AC2 always de.json',L,'`wiki/${phone}.json`','`wiki/de.json`'),
 (U,'AC2 titles asked for before there is a point',L,"manifest = file\n        load()","manifest = file\n        if (manifest.wikiLangs.includes(phone)) request<WikiLangFile>(`wiki/${phone}.json`, (f) => { wikiTitles = f })\n        load()"),
 (P,'AC2 the phone language never reaches the loader',H,"      phone,\n",''),
 (P,'AC2 the titles never reach the row',H,'loader.wikiTitles)','null)'),
 (U,'AC3 the code in lower case',W,'lang.toUpperCase()','lang'),
 (U,'AC3 another separator',W,'Wikipedia · ','Wikipedia - '),
 (U,'AC3 http',W,'https://${lang}','http://${lang}'),
 (U,'AC3 spaces kept',W,"title.replaceAll(' ', '_')",'title'),
 (U,'AC3 ? left in',W,".replaceAll('?', '%3F')",''),
 (U,'AC3 encodeURIComponent',W,'encodeURI(','encodeURIComponent('),
 (P,'AC3 same tab',R,' target="_blank"',''),
 (P,'AC3 rel dropped',R,' rel="noreferrer"',''),
 (P,'AC3 the row shows the place name as the link',R,'{article.text}','{place.name}'),
 (P,'AC3 a tap on the link also taps the row',R,'<a class="place-wiki"','<a onClick={() => onSelect(place, "row")} class="place-wiki"'),
 (P,'AC3 a link on the first row only',R,'{article && (','{article && place === rows[0].place && ('),
 (P,'row the marker scroll stops at the button',R,"?.closest('li')",''),
 (P,'AC4 fr-FR asks for fr.json',L,'!wikiTitles && manifest.wikiLangs.includes(phone)','!wikiTitles && phone'),
 (P,'AC4 English before Hungarian on a French phone',W,"phone === 'en' ?","phone !== 'hu' ?"),
]
env = {**os.environ, 'CHROMIUM_PATH': '/usr/bin/chromium'}
def sh(cmd, timeout=500):
    return subprocess.run(cmd, cwd=root, shell=True, capture_output=True, text=True, timeout=timeout, env=env)
for kind, name, file, old, new in M:
    if which and not re.search(which, name): continue
    path = root / file
    src = path.read_text()
    if old not in src:
        line = f'{name}: DID NOT LAND, text not found in {file}'
    else:
        path.write_text(src.replace(old, new, 1))
        assert path.read_text() != src
        try:
            if kind == U:
                r = sh('npx vitest run src/core src/data --reporter=dot')
                failed = sorted(set(re.findall(r'FAIL\s+\S*\s*(src/\S+ > .+)', re.sub(r'\x1b\[[0-9;]*m', '', r.stdout + r.stderr))))
                line = f'{name}: unit killed by {len(failed)}: ' + ' · '.join(failed[:2]) if r.returncode else f'{name}: SURVIVED unit tests'
            else:
                b = sh('npm run build')
                assert b.returncode == 0, b.stdout + b.stderr
                r = sh('npx playwright test e2e/list.spec.ts --max-failures=1 --reporter=line -g "the Wikipedia link"')
                text = re.sub(r'\x1b\[[0-9;]*m', '', r.stdout)
                failed = re.findall(r'^\s*\d+\) (e2e/\S+ .+?)\s*─*$', text, re.M)
                pm = re.search(r'(\d+) passed', text)
                line = f'{name}: page killed by {failed[0] if failed else "?"}' if r.returncode else f'{name}: SURVIVED page tests -g "the Wikipedia link": {pm.group(1) if pm else "?"} passed'
        finally:
            path.write_text(src)
    print(line, flush=True)
    with open(out, 'a') as f: f.write(line + '\n')
