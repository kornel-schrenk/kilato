#!/usr/bin/env python3
"""QA's mutants on the #14 PR. Each one must land (the file changes), runs, and is restored. None reaches a commit."""
import pathlib, re, subprocess, sys, os
root = pathlib.Path(sys.argv[1]); out = pathlib.Path(sys.argv[2]); which = sys.argv[3] if len(sys.argv) > 3 else 'all'
U = 'unit'; P = 'page'
M = [
 (U,'AC1 a loaded cell asked for again','src/data/places.ts','if (loaded.has(key)) continue','',''),
 (U,'AC1 a cell on its way asked for again','src/data/places.ts','if (onItsWay.has(path)) return','',''),
 (U,'AC1 a failed fetch not reported','src/data/places.ts','failed = true','failed = false',''),
 (U,'AC1 reach of 1,500 m in cellsWithin','src/core/cells.ts','<= metres','<= metres * 1.5',''),
 (U,'AC1 a cell has no north half','src/core/cells.ts','(row + 1) / 100','row / 100',''),
 (U,'AC1 a cell ends 75 m short in the east, so a point east of it can lose places','src/core/cells.ts','((col + 1) * 3) / 200','((col + 1) * 3) / 200 - 0.001',''),
 (U,'AC1 a cell ends 110 m short in the north, so a point north of it can lose places','src/core/cells.ts','(row + 1) / 100','(row + 1) / 100 - 0.001',''),
 (U,'AC1 a cell starts 75 m late in the west, so a point west of it can lose places','src/core/cells.ts','(col * 3) / 200','(col * 3) / 200 + 0.001',''),
 (U,'AC1 a cell starts 110 m late in the south, so a point south of it can lose places','src/core/cells.ts','row / 100,','row / 100 + 0.001,',''),
 (U,'AC2 a place at exactly the distance dropped','src/core/geo.ts','row.metres <= metres','row.metres < metres',''),
 (U,'AC2 no sort','src/core/geo.ts','.sort((a, b) => a.metres - b.metres)','',''),
 (U,'AC2 distances floored, not rounded','src/core/lang.ts','Math.round(metres / 10) * 10','Math.floor(metres / 10) * 10',''),
 (P,'AC2 distance not rounded on the row','src/ui/PlaceList.tsx','formatDistance(metres, lang)','`${Math.round(metres)} m`','a row|the list'),
 (P,'AC2 second name always English','src/ui/PlaceList.tsx','secondName(place, lang)',"secondName(place, 'en')",'a row'),
 (P,'AC3 Show more stays at exactly the end','src/ui/PlaceList.tsx','shown < rows.length','shown <= rows.length','the list'),
 (P,'AC3 Show more adds 50','src/ui/usePlaces.ts','current + pageSize','current + 50','the list'),
 (P,'AC4 one colour for every marker','src/ui/MapView.tsx','categoryColors[place.cat]','categoryColors.food','the markers'),
 (P,'AC4 markers only for the rows showing','src/ui/MapView.tsx','rows.map(({ place }) => [','rows.slice(0, 100).map(({ place }) => [','the markers|tapping a marker'),
 (P,'AC4 markers on SVG, not canvas','src/ui/MapView.tsx','renderer: canvas.current!,','','the markers'),
 (P,'AC4 the highlighted marker stays under its neighbours','src/ui/MapView.tsx','.setStyle(highlightStyle).bringToFront()','.setStyle(highlightStyle)','tapping|on a walk'),
 (P,'AC4 the highlighted row looks like any other','index.html',"background: #ffe9a8;","",'tapping|on a walk'),
 (P,'AC4 row tap always pans','src/ui/MapView.tsx','if (!map.getBounds().contains(at)) map.panTo(at)','map.panTo(at)','tapping a row'),
 (P,'AC4 row tap never pans','src/ui/MapView.tsx','if (!map.getBounds().contains(at)) map.panTo(at)','','tapping a row'),
 (P,"AC4 Leaflet's own popup pan back on",'src/ui/MapView.tsx','autoPan: false','autoPan: true','tapping a row'),
 (P,'AC4 the popup outlives its selection','src/ui/MapView.tsx','popup.remove()','void popup','tapping|on a walk'),
 (P,'AC4 a marker tap reaches the map and moves the point','src/ui/MapView.tsx','bubblingMouseEvents: false','bubblingMouseEvents: true','tapping a marker'),
 (P,'AC4 a marker tap does not scroll','src/ui/PlaceList.tsx',"?.scrollIntoView({ block: 'nearest' })",'','tapping a marker'),
 (P,'AC4 a marker past the rows showing does not grow the list','src/ui/usePlaces.ts','setShown((current) => Math.max(current, (Math.floor(rank / pageSize) + 1) * pageSize))','','tapping a marker'),
 (P,'AC5 the location in a data URL','src/data/places.ts','fetchData(dataFolder + path)','fetchData(dataFolder + path + (point ? `?at=${point.lat},${point.lon}` : ""))','with the location at'),
 (P,'AC5 the location in a POST body on a data file','src/data/places.ts','fetchData(dataFolder + path)','fetch(dataFolder + path, { method: "POST", body: JSON.stringify(point) })','with the location at'),
 (P,'AC5 the location in a tile URL','src/ui/MapView.tsx','const at = toLeaflet(point)\n','const at = toLeaflet(point); void fetch(`https://tile.openstreetmap.org/1/1/1.png?at=${point.lat}`).catch(() => {})\n','with the location at'),
 (P,'AC5 the location in a POST body to the tile server','src/ui/MapView.tsx','const at = toLeaflet(point)\n','const at = toLeaflet(point); void fetch("https://tile.openstreetmap.org/1/1/1.png", { method: "POST", mode: "no-cors", body: JSON.stringify(point) }).catch(() => {})\n','with the location at'),
]
def sh(cmd, timeout=900):
    return subprocess.run(cmd, cwd=root, shell=True, capture_output=True, text=True, timeout=timeout)
lines = []
for kind, name, file, old, new, grep in M:
    if which != 'all' and not re.search(which, name): continue
    path = root / file
    src = path.read_text()
    if old not in src:
        lines.append(f'{name}: DID NOT LAND, text not found in {file}'); print(lines[-1], flush=True); continue
    path.write_text(src.replace(old, new, 1))
    assert path.read_text() != src
    try:
        if kind == U:
            r = sh('npx vitest run src/core src/data src/ui 2>&1')
            fails = re.findall(r'FAIL\s+(.*)', r.stdout)
            verdict = f'unit killed by {len(fails)}: ' + ' · '.join(dict.fromkeys(x.strip() for x in fails[:2])) if r.returncode else 'SURVIVED unit tests'
        else:
            b = sh('npx vite build 2>&1')
            if b.returncode:
                verdict = 'build failed: ' + b.stdout[-200:]
            else:
                r = sh(f"npx playwright test e2e/list.spec.ts --max-failures=1 --workers=2 --reporter=list -g '{grep}' 2>&1")
                first = re.search(r'^\s+\d+\) (e2e/\S+.*)$', r.stdout, re.M)
                count = re.search(r'(\d+) passed', r.stdout)
                verdict = f'page killed by {first.group(1).strip()}' if r.returncode and first else ('SURVIVED page tests -g "%s": %s passed' % (grep, count.group(1) if count else '?') if not r.returncode else 'run failed: ' + r.stdout[-300:])
    finally:
        path.write_text(src)
    lines.append(f'{name}: {verdict}'[:300]); print(lines[-1], flush=True)
print('restored; git status:', sh('git status --short -- src index.html').stdout.strip() or 'src clean', flush=True)
