#!/usr/bin/env python3
"""QA's mutants on the #15 PR. Each one must land (the file changes), runs, and is restored. None reaches a commit."""
import os, pathlib, re, subprocess, sys
root = pathlib.Path(sys.argv[1]); out = pathlib.Path(sys.argv[2]); which = sys.argv[3] if len(sys.argv) > 3 else ''
U = 'unit'; P = 'page'
C = 'src/core/hours.ts'; L = 'src/data/places.ts'; A = 'src/ui/App.tsx'; H = 'src/ui/usePlaces.ts'; R = 'src/ui/PlaceList.tsx'; EN = 'src/i18n/en.ts'; HU = 'src/i18n/hu.ts'; S = 'scripts/data/hours.ts'
M = [
 (U,'AC1 a pair opens a moment late',C,'start <= minutes','start < minutes'),
 (U,'AC1 a pair closes a moment late',C,'minutes < end','minutes <= end'),
 (U,'AC1 the first moment of the window is outside',C,'minutes >= 0','minutes > 0'),
 (U,'AC1 the end of the window is inside',C,'minutes < hoursWindowMinutes)','minutes <= hoursWindowMinutes)'),
 (U,'AC1 no check before the window',C,'!(minutes >= 0 && minutes < hoursWindowMinutes)','!(minutes < hoursWindowMinutes)'),
 (U,'AC1 no check past the window',C,'!(minutes >= 0 && minutes < hoursWindowMinutes)','!(minutes >= 0)'),
 (U,'AC1 a start that does not parse counts as inside',C,'!(minutes >= 0 && minutes < hoursWindowMinutes)','minutes < 0 || minutes >= hoursWindowMinutes'),
 (U,'AC1 only the first pair counts',C,'hours.some(([start, end]) =>','hours.slice(0, 1).some(([start, end]) =>'),
 (U,'AC1 open and closed swapped',C,"? 'open' : 'closed'","? 'closed' : 'open'"),
 (U,'AC1 an empty list counts as no hours',C,'if (!hours ||','if (!hours?.length ||'),
 (U,'AC1 no hours counts as closed',C,"if (!hours || !hoursWindowStart) return 'unknown'","if (!hours) return 'closed'\n  if (!hoursWindowStart) return 'unknown'"),
 (U,'AC1 a 7-day window',C,'14 * 24 * 60','7 * 24 * 60'),
 (U,'AC1 a 15-day window',C,'14 * 24 * 60','15 * 24 * 60'),
 (U,'AC1 minutes rounded up',C,'(now - Date.parse(hoursWindowStart)) / minute','Math.ceil((now - Date.parse(hoursWindowStart)) / minute)'),
 (U,'AC1 minutes rounded to nearest',C,'(now - Date.parse(hoursWindowStart)) / minute','Math.round((now - Date.parse(hoursWindowStart)) / minute)'),
 (U,'AC1 the loader never gives the window start',L,'return manifest?.hoursWindowStart','return undefined'),
 (U,'AC1 the build gets a shorter window',S,'hoursWindowMinutes * MINUTE','7 * 24 * 60 * MINUTE'),
 (P,'AC1 the page reads the wrong manifest time',L,'return manifest?.hoursWindowStart','return manifest?.builtAt'),
 (P,'AC1 the page reads local time as UTC',H,'const now = Date.now()','const now = Date.now() - new Date().getTimezoneOffset() * 60_000'),
 (P,'AC2 unknown reads Closed now',R,'unknown: null','unknown: t.closedNow'),
 (P,'AC2 an empty status line for unknown',R,'{status && <span class="place-status">{status}</span>}','<span class="place-status">{status}</span>'),
 (P,'AC2 labels swapped',R,'{ open: t.openNow, closed: t.closedNow,','{ open: t.closedNow, closed: t.openNow,'),
 (P,'AC2 the English open label',EN,"openNow: 'Open now'","openNow: 'Open'"),
 (P,'AC2 the English closed label',EN,"closedNow: 'Closed now'","closedNow: 'Closed'"),
 (P,'AC2 the Hungarian open label',HU,"openNow: 'Most nyitva'","openNow: 'Nyitva'"),
 (P,'AC2 the Hungarian closed label',HU,"closedNow: 'Most zárva'","closedNow: 'Zárva'"),
 (P,'AC2 Hungarian labels on every phone',R,'{ open: t.openNow, closed: t.closedNow,',"{ open: 'Most nyitva', closed: 'Most zárva',"),
 (P,'AC2 the page never asks for a status',A,'statusOf={places.statusOf}',"statusOf={() => 'unknown'}"),
 (P,'AC2 the status only on the first row',R,'{status && <span','{status && rows[0].place === place && <span'),
 (P,'AC2 the status after the link, outside the button',R,'''                {status && <span class="place-status">{status}</span>}
              </button>''','''              </button>
              {status && <span class="place-status">{status}</span>}'''),
 (P,'AC2 the status not on its own line',R,'class="place-status"','class="place-status-x"'),
 (P,'AC3 no timer',H,'setInterval(() => setVersion((version) => version + 1), statusInterval)','setTimeout(() => {}, statusInterval)'),
 (P,'AC3 a five-minute timer',H,'statusInterval = 60_000','statusInterval = 300_000'),
 (P,'AC3 a two-minute timer',H,'statusInterval = 60_000','statusInterval = 120_000'),
 (P,'AC3 a 65-second timer',H,'statusInterval = 60_000','statusInterval = 65_000'),
 (P,'AC3 a 61-second timer',H,'statusInterval = 60_000','statusInterval = 61_000'),
 (P,'AC3 the clock read once, at load',H,'  const now = Date.now()\n','  const [now] = useState(() => Date.now())\n'),
 (P,'AC3 the clock read only when the list is built',H,'  const now = Date.now()\n','  const now = useMemo(() => Date.now(), [point, loader.places])\n'),
 (P,'AC3 the clock read only by the timer',H,"  const now = Date.now()\n","  const [now, setNow] = useState(() => Date.now())\n  useEffect(() => {\n    const timer = setInterval(() => setNow(Date.now()), statusInterval)\n    return () => clearInterval(timer)\n  }, [])\n"),
 (P,'AC3 the timer rebuilds the rows, which redraws every marker',H,'''    () => (point ? nearby(loader.places, point, listRadius) : []),
    [point, loader.places],''','''    () => (point ? nearby(loader.places, point, listRadius) : []),
    [point, loader.places, now],'''),
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
                r = sh('npx vitest run src/core src/data scripts/data/hours --reporter=dot')
                failed = sorted(set(re.findall(r'FAIL\s+\S*\s*((?:src|scripts)/\S+ > .+)', re.sub(r'\x1b\[[0-9;]*m', '', r.stdout + r.stderr))))
                line = f'{name}: unit killed by {len(failed)}: ' + ' · '.join(failed[:2]) if r.returncode else f'{name}: SURVIVED unit tests'
            else:
                b = sh('npm run build')
                assert b.returncode == 0, b.stdout + b.stderr
                r = sh('npx playwright test e2e/list.spec.ts --max-failures=1 --reporter=line -g "the open status"')
                text = re.sub(r'\x1b\[[0-9;]*m', '', r.stdout)
                failed = re.findall(r'^\s*\d+\) (e2e/\S+ .+?)\s*─*$', text, re.M)
                pm = re.search(r'(\d+) passed', text)
                line = f'{name}: page killed by {failed[0] if failed else "?"}' if r.returncode else f'{name}: SURVIVED page tests -g "the open status": {pm.group(1) if pm else "?"} passed'
        finally:
            path.write_text(src)
    print(line, flush=True)
    with open(out, 'a') as f: f.write(line + '\n')
