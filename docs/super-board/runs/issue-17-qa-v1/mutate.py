#!/usr/bin/env python3
"""QA's mutants on the #17 PR. Each one must land (the file changes), runs, and is restored. None reaches a commit."""
import pathlib, re, subprocess, sys
root = pathlib.Path(sys.argv[1]); out = pathlib.Path(sys.argv[2]); output = sys.argv[3]
U = 'unit'; P = 'page'
hook = 'src/ui/usePlaces.ts'; app = 'src/ui/App.tsx'; chips = 'src/ui/CategoryChips.tsx'; css = 'index.html'
start = 'useState<ReadonlySet<CategoryId>>(new Set())'
unfiltered = (hook, '  return {\n    rows,', '  return {\n    rows,\n    unfiltered: (point ? nearby(loader.places, point, listRadius) : []) as Row[],')
M = [
 (P,'AC1 two chips swapped',[(chips,"'sights', 'notable'","'notable', 'sights'")]),
 (P,'AC1 an English name differs',[('src/i18n/en.ts',"leisure: 'Culture & leisure'","leisure: 'Culture and leisure'")]),
 (P,'AC1 a Hungarian name differs',[('src/i18n/hu.ts',"services: 'Szolgáltatások'","services: 'Szolgáltatás'")]),
 (P,'AC1 the chips stay in English',[(app,'onToggle={places.toggleCategory} t={t}','onToggle={places.toggleCategory} t={en}')]),
 (P,'AC1 every chip in one colour',[(chips,"'--chip-color': categoryColors[id]","'--chip-color': categoryColors.food")]),
 (P,'AC1 an on chip is not filled',[(css,"background: var(--chip-color);\n","\n")]),
 (P,'AC1 an off chip loses its colour',[(css,"border: 2px solid var(--chip-color);","border: 2px solid #000;")]),
 (P,'AC1 a chip off at the start',[(hook,start,"useState<ReadonlySet<CategoryId>>(new Set(['shops']))")]),
 (P,'AC1 the filter saved in sessionStorage',[(hook,start,"useState<ReadonlySet<CategoryId>>(new Set(JSON.parse(sessionStorage.getItem('f') ?? '[]')))"),(hook,'      return next\n',"      sessionStorage.setItem('f', JSON.stringify([...next]))\n      return next\n")]),
 (P,'AC1 the filter saved in localStorage',[(hook,start,"useState<ReadonlySet<CategoryId>>(new Set(JSON.parse(localStorage.getItem('f') ?? '[]')))"),(hook,'      return next\n',"      localStorage.setItem('f', JSON.stringify([...next]))\n      return next\n")]),
 (U,'AC1 black name on the grey Shops chip',[('src/ui/categoryColors.ts',"shops: '#ffffff'","shops: '#000000'")]),
 (P,'AC2 a chip never comes back on',[(hook,'if (!next.delete(id)) next.add(id)','next.add(id)')]),
 (P,'AC2 off shows only what it should hide',[(hook,'!categoriesOff.has(place.cat)','categoriesOff.size === 0 || categoriesOff.has(place.cat)')]),
 (P,'AC2 the list ignores the filter',[unfiltered,(app,'rows={places.rows}\n          shown','rows={places.unfiltered}\n          shown')]),
 (P,'AC2 the map ignores the filter',[unfiltered,(app,'rows={places.rows}\n        selection','rows={places.unfiltered}\n        selection')]),
 (P,'AC2 the filter waits for the next move of the point',[(hook,'[point, loader.places, categoriesOff]','[point, loader.places]')]),
 (P,'AC2 the selection stays when its category goes off',[(hook,'if (selection && !rows.some(({ place }) => place.id === selection.place.id)) setSelection(null)','')]),
 (P,'AC2 any chip clears the selection',[(hook,'const toggleCategory = (id: CategoryId) =>\n    setCategoriesOff(','const toggleCategory = (id: CategoryId) =>\n    (setSelection(null) as any) ?? setCategoriesOff(')]),
 (P,'AC2 the filter resets when the point moves',[(hook,'useEffect(() => loader.moveTo(point), [loader, point])\n','useEffect(() => loader.moveTo(point), [loader, point])\n  useEffect(() => { setCategoriesOff(new Set()) }, [point])\n')]),
 (P,'AC3 the message shows with five off',[(app,'places.categoriesOff.size === categories.length','places.categoriesOff.size >= categories.length - 1')]),
 (P,'AC3 no message',[(app,'places.categoriesOff.size === categories.length','places.categoriesOff.size === 99')]),
 (P,'AC3 the button does nothing',[(hook,'allCategoriesOn: () => setCategoriesOff(new Set())','allCategoriesOn: () => {}')]),
 (P,'AC3 the button turns on only one',[(hook,'allCategoriesOn: () => setCategoriesOff(new Set())',"allCategoriesOn: () => setCategoriesOff(new Set(['sights', 'notable', 'food', 'leisure', 'services']))")]),
 (P,'AC3 the Hungarian message in English',[('src/i18n/hu.ts',"allCategoriesOff: 'Minden kategória ki van kapcsolva.'","allCategoriesOff: 'All categories are off.'")]),
 (P,'AC3 the Hungarian button in English',[('src/i18n/hu.ts',"turnAllOn: 'Mind visszakapcsolása'","turnAllOn: 'Turn them all back on'")]),
 (P,'layout: the chips do not wrap on a phone',[(css,'.chips {\n        display: flex;\n        flex-wrap: wrap;','.chips {\n        display: flex;\n        flex-wrap: nowrap;')]),
 (P,'layout: a chip under 44 px',[(css,'.chip {\n        min-height: 44px;','.chip {\n        min-height: 20px;')]),
 (P,'layout: the turn-all-on button under 44 px',[(css,'      .all-off button,\n','')]),
]
def sh(cmd, timeout=900):
    return subprocess.run(cmd, cwd=root, shell=True, capture_output=True, text=True, timeout=timeout)
strip = lambda text: re.sub(r'\x1b\[[0-9;]*[A-Za-z]', '', text)
lines = []
for kind, name, edits in M:
    saved = {}
    landed = True
    for file, old, new in edits:
        path = root / file
        saved.setdefault(file, path.read_text())
        src = path.read_text()
        if old not in src:
            landed = False
            lines.append(f'{name}: DID NOT LAND, text not found in {file}')
            print(lines[-1], flush=True)
            break
        path.write_text(src.replace(old, new, 1))
        assert path.read_text() != src
    try:
        if not landed:
            continue
        if kind == U:
            r = sh('npx vitest run src/ui 2>&1')
            text = strip(r.stdout)
            fails = re.findall(r'FAIL\s+(.*)', text)
            verdict = 'unit killed by ' + ' · '.join(dict.fromkeys(x.strip() for x in fails[:2])) if r.returncode else 'SURVIVED unit tests'
        else:
            b = sh('npx vite build 2>&1')
            if b.returncode:
                verdict = 'build failed: ' + strip(b.stdout)[-200:]
            else:
                r = sh(f'npx playwright test e2e/list.spec.ts --max-failures=1 -g "the category chips" --reporter=line --output={output} 2>&1')
                text = strip(r.stdout)
                first = re.search(r'^\s+1\) (e2e/\S+ › .*)$', text, re.M)
                passed = re.search(r'(\d+) passed', text)
                if r.returncode:
                    verdict = 'page killed by ' + (first.group(1).strip() if first else 'no test named: ' + text[-200:])
                else:
                    verdict = f'SURVIVED page tests -g "the category chips": {passed.group(1) if passed else "?"} passed'
        lines.append(f'{name}: {verdict}')
        print(lines[-1], flush=True)
    finally:
        for file, src in saved.items():
            (root / file).write_text(src)
    out.write_text('\n'.join(lines) + '\n')
out.write_text('\n'.join(lines) + '\n')
