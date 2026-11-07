# Runs the real `run:` scripts of deploy.yml on this machine, for what can run off GitHub:
# - the cache key step, around the new year;
# - the page build and the copy, with test/fixtures/site-data standing in for a restored cache;
# - the exact tar command of actions/upload-pages-artifact@v5, to see what would go live;
# - `vite preview` on that build, to see the data at its live address;
# - the copy with no data, which has to stop the run.
#   python3 -I run-steps.py <project root> <work folder>
# It makes no calls outside this machine.
import json, os, re, shutil, signal, subprocess, sys, tarfile, time, urllib.request
import yaml

root, work = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
os.makedirs(work, exist_ok=True)
steps = {s['name']: s for s in yaml.safe_load(open(f'{root}/.github/workflows/deploy.yml', encoding='utf8'))['jobs']['deploy']['steps']}
wrong = 0


def check(label, ok, detail=''):
    global wrong
    wrong += not ok
    print(f"{'ok   ' if ok else 'WRONG'} {label}{' · ' + detail if detail else ''}")


def bash(script, cwd=root, **env):
    return subprocess.run(['bash', '-e', '-c', script], cwd=cwd, env={**os.environ, **env}, capture_output=True, text=True)


print('===== the cache key')
output = f'{work}/github-output'
key_script = steps["Work out this week's cache key"]['run']
open(output, 'w').close()
r = bash(key_script, GITHUB_OUTPUT=output)
now = open(output).read().strip()
check('the real step writes the key', r.returncode == 0 and re.fullmatch(r'key=data-\d{4}-W\d{2}', now) is not None, now)
# ISO weeks worked out by hand from the calendar. 2027-01-01 is a Friday, so it is still week 53 of 2026.
for day, want in [('2026-11-02', 'data-2026-W45'), ('2026-11-08', 'data-2026-W45'), ('2026-11-09', 'data-2026-W46'),
                  ('2026-12-31', 'data-2026-W53'), ('2027-01-01', 'data-2026-W53'), ('2027-01-03', 'data-2026-W53'), ('2027-01-04', 'data-2027-W01')]:
    # The step's own format string, with the day fixed.
    fmt = re.search(r'date -u (\+\S+?)\)', key_script).group(1)
    got = 'data-' + subprocess.check_output(['date', '-u', '-d', day, fmt], text=True).strip()
    check(f'{day} gives {want}', got == want, got)

print()
print('===== the page build and the copy, with the fixture as the restored cache')
shutil.rmtree(f'{root}/dist', ignore_errors=True)
shutil.rmtree(f'{root}/data', ignore_errors=True)
shutil.copytree(f'{root}/test/fixtures/site-data', f'{root}/data')
r = bash(steps['Build the page']['run'])
check('npm run build exits 0', r.returncode == 0)
r = bash(steps['Copy the data into the page']['run'])
check('the copy exits 0', r.returncode == 0, r.stderr.strip())
check('dist/data/manifest.json exists', os.path.isfile(f'{root}/dist/data/manifest.json'))
check('no nested dist/data/data', not os.path.exists(f'{root}/dist/data/data'))

print()
print('===== what actions/upload-pages-artifact@v5 would pack')
tar = f'{work}/artifact.tar'
# The action's command on Linux, from its action.yml at tag v5, with its default include-hidden-files false.
subprocess.check_call(['tar', '--dereference', '--hard-dereference', '--directory', f'{root}/dist', '-cf', tar,
                       '--exclude=.git', '--exclude=.github', '--exclude=.[^/]*', '.'])
with tarfile.open(tar) as t:
    names = sorted(m.name.removeprefix('./') for m in t.getmembers() if m.isfile())
    modes = {m.name: oct(m.mode) for m in t.getmembers() if m.isfile()}
    packed_manifest = t.extractfile('./data/manifest.json').read()
fixture = sorted(os.path.relpath(os.path.join(d, f), f'{root}/test/fixtures/site-data')
                 for d, _, fs in os.walk(f'{root}/test/fixtures/site-data') for f in fs)
check('the page is in it', 'index.html' in names)
check('the page is at the root, not under dist/', not any(n.startswith('dist/') for n in names))
check(f'all {len(fixture)} data files are under data/', all(f'data/{f}' in names for f in fixture))
check('no extract, cache or repo files are in it', not any(n.endswith('.pbf') or n.endswith('.md5') or n.startswith(('node_modules', 'src/', '.github')) for n in names))
check('the manifest is the same bytes as the data', packed_manifest == open(f'{root}/test/fixtures/site-data/manifest.json', 'rb').read())
print(f'      {len(names)} files, modes {sorted(set(modes.values()))}')

print()
print('===== the data at its live address, under vite preview')
port = str(4173 + os.getpid() % 800)
server = subprocess.Popen(['npx', 'vite', 'preview', '--host', '127.0.0.1', '--port', port, '--strictPort'], cwd=root,
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
try:
    base = f'http://127.0.0.1:{port}/kilato/'
    for _ in range(60):
        try:
            urllib.request.urlopen(base, timeout=2)
            break
        except OSError:
            time.sleep(0.5)

    def get(path):
        with urllib.request.urlopen(base + path, timeout=5) as res:
            return res.status, res.read()

    status, body = get('data/manifest.json')
    manifest = json.loads(body)
    check('/kilato/data/manifest.json answers 200 with the manifest', status == 200 and manifest['version'] == 1)
    for cell in manifest['cells'][:2]:
        status, body = get(f'data/cells/{cell}.json')
        check(f'/kilato/data/cells/{cell}.json answers 200 with places', status == 200 and len(json.loads(body)['places']) > 0)
    status, body = get('data/search.json')
    check('/kilato/data/search.json answers 200', status == 200 and 'places' in json.loads(body))
    status, body = get('data/LICENSE.txt')
    check('/kilato/data/LICENSE.txt answers 200 with both notices', status == 200 and b'OpenStreetMap' in body and b'Wikipedia' in body)
    status, body = get('')
    check('/kilato/ still answers with the page', status == 200 and b'<title>' in body)
finally:
    os.killpg(server.pid, signal.SIGTERM)
    server.wait(timeout=10)

print()
print('===== no data: the copy has to stop the run')
shutil.rmtree(f'{root}/data')
shutil.rmtree(f'{root}/dist/data')
r = bash(steps['Copy the data into the page']['run'])
check('the copy exits non-zero', r.returncode != 0, r.stderr.strip())
check('nothing was published to dist/data', not os.path.exists(f'{root}/dist/data'))

print()
print('all as expected' if not wrong else f'{wrong} WRONG')
sys.exit(1 if wrong else 0)
