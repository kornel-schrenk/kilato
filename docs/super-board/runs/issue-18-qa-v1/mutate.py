#!/usr/bin/env python3
"""QA's mutants on the #18 PR, in a throwaway copy of the worktree. Each one must land, runs, and is restored. None reaches a commit."""
import pathlib, re, subprocess, sys
root = pathlib.Path(sys.argv[1]); out = pathlib.Path(sys.argv[2]); output = sys.argv[3]
U = 'unit'; P = 'page'; T = 'tune'
rank = 'src/core/rank.ts'; hook = 'src/ui/usePlaces.ts'; app = 'src/ui/App.tsx'; css = 'index.html'; mapview = 'src/ui/MapView.tsx'
start = "useState<Order>('nearest')"
chipsLine = '        <CategoryChips off={places.categoriesOff} onToggle={places.toggleCategory} t={t} />\n'
orderOpen = '        <div class="order" role="group" aria-label={t.order}>\n'
M = [
 # AC2: the score
 (U,'AC2 the article counts for nothing',[(rank,'const article = place.wiki ? adjustments.article : 0','const article = 0')]),
 (U,'AC2 every place counts as having an article',[(rank,'const article = place.wiki ? adjustments.article : 0','const article = adjustments.article')]),
 (U,'AC2 the category is left out',[(rank,' + adjustments.category[place.cat]','')]),
 (U,'AC2 the open status is left out',[(rank,' + adjustments.status[statusOf(place)]','')]),
 (U,'AC2 the distance is left out of the score',[(rank,'return metres + article','return article')]),
 (U,'AC2 highest score first',[(rank,'a.score - b.score ||','b.score - a.score ||')]),
 (U,'AC2 a tie skips the nearer place',[(rank,'        a.row.metres - b.row.metres ||\n','')]),
 (U,'AC2 a tie goes to the further place',[(rank,'a.row.metres - b.row.metres ||','b.row.metres - a.row.metres ||')]),
 (U,'AC2 no tie by name',[(rank,"a.row.place.name.localeCompare(b.row.place.name, 'hu')",'0')]),
 (U,'AC2 ties by code unit',[(rank,"a.row.place.name.localeCompare(b.row.place.name, 'hu')",'(a.row.place.name < b.row.place.name ? -1 : 1)')]),
 (U,'AC2 ties in the English alphabet',[(rank,"localeCompare(b.row.place.name, 'hu')","localeCompare(b.row.place.name, 'en')")]),
 # AC3: the outcomes
 (U,'AC3 Nearest goes by score',[(rank,"  if (order === 'nearest') return [...rows].sort((a, b) => a.metres - b.metres)\n",'')]),
 (U,'AC3 Nearest farthest first',[(rank,'[...rows].sort((a, b) => a.metres - b.metres)','[...rows].sort((a, b) => b.metres - a.metres)')]),
 (U,'AC3 Nearest sorts the rows it was given',[(rank,'[...rows].sort((a, b) => a.metres - b.metres)','rows.sort((a, b) => a.metres - b.metres)')]),
 (U,'AC3 closed counts as nearer',[(rank,'closed: 300','closed: -300')]),
 (U,'AC3 open counts as further',[(rank,'open: -100','open: 400')]),
 (U,'AC3 an article pushes a place away',[(rank,'article: -300','article: 300')]),
 (U,'table typo: a sight counts as +200',[(rank,'sights: -200','sights: 200')]),
 (U,'table typo: closed counts as +200',[(rank,'closed: 300','closed: 200')]),
 (U,'table typo: food counts as 0',[(rank,'food: -50','food: 0')]),
 # AC1: the page
 (P,'AC1 Most relevant at the start',[(hook,start,"useState<Order>('relevant')")]),
 (P,'AC1 the order saved in localStorage',[(hook,start,"useState<Order>((localStorage.getItem('o') as Order) ?? 'nearest')"),(hook,'    setOrder,\n',"    setOrder: (o: Order) => { localStorage.setItem('o', o); setOrder(o) },\n")]),
 (P,'AC1 the order saved in sessionStorage',[(hook,start,"useState<Order>((sessionStorage.getItem('o') as Order) ?? 'nearest')"),(hook,'    setOrder,\n',"    setOrder: (o: Order) => { sessionStorage.setItem('o', o); setOrder(o) },\n")]),
 (P,'AC1 an English label differs',[('src/i18n/en.ts',"mostRelevant: 'Most relevant'","mostRelevant: 'Relevant'")]),
 (P,'AC1 a Hungarian label differs',[('src/i18n/hu.ts',"nearest: 'Legközelebbi'","nearest: 'Közeli'")]),
 (P,'AC1 the toggle stays in English',[(app,'{t.mostRelevant}','{en.mostRelevant}')]),
 (P,'AC1 the two buttons do each other\'s job',[(app,"places.setOrder('nearest')","places.setOrder('X' as never)"),(app,"places.setOrder('relevant')","places.setOrder('nearest')"),(app,"places.setOrder('X' as never)","places.setOrder('relevant')")]),
 (P,'AC1 the chosen button is not marked',[(app,"aria-pressed={places.order === 'relevant'}","aria-pressed={places.order === 'nearest'}")]),
 (P,'AC1 the list ignores the order',[(app,'rows={places.listRows}','rows={places.rows}')]),
 (P,'AC1 Most relevant ignores the filter',[(hook,'const listRows = sortRows(rows, order, statusOf)',"const listRows = sortRows(order === 'relevant' && point ? nearby(loader.places, point, listRadius) : rows, order, statusOf)")]),
 (P,'AC1 a chip resets the order',[(hook,'const toggleCategory = (id: CategoryId) =>\n    setCategoriesOff(',"const toggleCategory = (id: CategoryId) =>\n    (setOrder('nearest') as any) ?? setCategoriesOff(")]),
 (P,'AC1 the order resets when the point moves',[(hook,'useEffect(() => loader.moveTo(point), [loader, point])\n',"useEffect(() => loader.moveTo(point), [loader, point])\n  useEffect(() => { setOrder('nearest') }, [point])\n")]),
 (P,'AC1 the order resets when the language switches',[(hook,'useEffect(() => loader.moveTo(point), [loader, point])\n',"useEffect(() => loader.moveTo(point), [loader, point])\n  useEffect(() => { const reset = () => setOrder('nearest'); const seen = document.documentElement.lang; const observer = new MutationObserver(() => { if (document.documentElement.lang !== seen) reset() }); observer.observe(document.documentElement, { attributes: true }); return () => observer.disconnect() }, [])\n")]),
 (P,'AC1 the toggle under the chips',[(app,chipsLine,''),(app,orderOpen,chipsLine+orderOpen)]),
 (P,'AC1 a toggle button under 44 px',[(css,'.order button,\n      .chip {\n        min-height: 44px;','.order button {\n        min-height: 20px;\n        padding: 0 0.75rem;\n      }\n      .chip {\n        min-height: 44px;')]),
 # the Builder's other claims
 (P,'the map gets the sorted rows',[(app,'rows={places.rows}\n        selection','rows={places.listRows}\n        selection')]),
 (P,'the order only sorts again when the rows or the order change',[(hook,'const listRows = sortRows(rows, order, statusOf)','const listRows = useMemo(() => sortRows(rows, order, statusOf), [rows, order])')]),
 (P,'a marker counts rows in the order it was drawn in',[(mapview,"select.current(place, 'marker')","onSelect(place, 'marker')")]),
 (P,'a marker counts rows nearest first',[(hook,'const rank = listRows.findIndex','const rank = rows.findIndex')]),
 (P,'the chosen button is not filled',[(css,"      .order button[aria-pressed='true'] {\n        background: #555;\n        color: #fff;\n      }\n",'')]),
 # tuning must break nothing: the spec says tests check outcomes, so the weights can be tuned
 (T,'tuned: an article is worth 350 m',[(rank,'article: -300','article: -350')]),
 (T,'tuned: closed counts as +400 m',[(rank,'closed: 300','closed: 400')]),
 (T,'tuned: open is worth 150 m',[(rank,'open: -100','open: -150')]),
 (T,'tuned: sights -250, notable -120, leisure -80, food -30',[(rank,'sights: -200, notable: -100, leisure: -100, food: -50','sights: -250, notable: -120, leisure: -80, food: -30')]),
]
only = sys.argv[4] if len(sys.argv) > 4 else None
def sh(cmd, timeout=900):
    return subprocess.run(cmd, cwd=root, shell=True, capture_output=True, text=True, timeout=timeout)
strip = lambda text: re.sub(r'\x1b\[[0-9;]*[A-Za-z]', '', text)
def page():
    b = sh('npx vite build 2>&1')
    if b.returncode:
        return 1, 'build failed: ' + strip(b.stdout)[-200:]
    r = sh(f'npx playwright test e2e/list.spec.ts --max-failures=1 -g "the order" --reporter=line --output={output} 2>&1')
    return r.returncode, strip(r.stdout)
lines = []
for kind, name, edits in M:
    if only and only not in name:
        continue
    saved = {}
    landed = True
    for file, old, new in edits:
        path = root / file
        saved.setdefault(file, path.read_text())
        src = path.read_text()
        if old not in src:
            landed = False
            lines.append(f'{name}: DID NOT LAND, text not found in {file}: {old[:50]!r}')
            print(lines[-1], flush=True)
            break
        path.write_text(src.replace(old, new, 1))
        assert path.read_text() != src
    try:
        if not landed:
            continue
        if kind == U:
            r = sh('npx vitest run src/core/rank.test.ts 2>&1')
            text = strip(r.stdout)
            fails = re.findall(r'FAIL\s+(.*)', text)
            verdict = 'unit red: ' + ' · '.join(dict.fromkeys(x.strip().replace('src/core/rank.test.ts > ', '') for x in fails[:2])) if r.returncode else 'PAST the unit tests'
            if not r.returncode:
                code, text = page()
                first = re.search(r'^\s+1\) (e2e/\S+ › .*)$', text, re.M)
                verdict += ' · ' + ('page red: ' + (first.group(1).strip() if first else text[-160:]) if code else 'PAST the page tests')
        elif kind == P:
            code, text = page()
            first = re.search(r'^\s+1\) (e2e/\S+ › .*)$', text, re.M)
            passed = re.search(r'(\d+) passed', text)
            if code:
                verdict = 'page red: ' + (first.group(1).strip() if first else 'no test named: ' + text[-200:])
            else:
                verdict = f'PAST the page tests -g "the order": {passed.group(1) if passed else "?"} passed'
        else:
            r = sh('npx vitest run src/core/rank.test.ts 2>&1')
            text = strip(r.stdout)
            code, ptext = page()
            first = re.search(r'^\s+1\) (e2e/\S+ › .*)$', ptext, re.M)
            verdict = ('unit green' if not r.returncode else 'UNIT RED: ' + ' · '.join(re.findall(r'FAIL\s+(.*)', text)[:2])) + ' · ' + ('page green' if not code else 'PAGE RED: ' + (first.group(1).strip() if first else ptext[-160:]))
        lines.append(f'{name}: {verdict}')
        print(lines[-1], flush=True)
    finally:
        for file, src in saved.items():
            (root / file).write_text(src)
    out.write_text('\n'.join(lines) + '\n')
out.write_text('\n'.join(lines) + '\n')
