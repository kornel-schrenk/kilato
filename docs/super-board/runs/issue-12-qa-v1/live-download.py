# The real download step of deploy.yml with the real curl, against Geofabrik. It fetches Hungary's .md5 and only the
# headers of Hungary's extract, which is 328 MB. The whole step then runs with Monaco's small extract in its place.
#   python3 -I live-download.py <deploy.yml> <empty work folder>
# A hand check, not a test: the spec's "tests never call Geofabrik" is about the test suite.
import os, re, subprocess, sys
import yaml

workflow, work = sys.argv[1], os.path.abspath(sys.argv[2])
steps = yaml.safe_load(open(workflow, encoding='utf8'))['jobs']['deploy']['steps']
script = next(s['run'] for s in steps if s['name'] == 'Download the Hungary extract')
print('The step as written:')
print(script)

BASE = 'https://download.geofabrik.de/europe/hungary-latest.osm.pbf'
print('===== Hungary, the .md5 and the headers only')
md5 = subprocess.check_output(['curl', '--fail', '--silent', '--show-error', '--location', BASE + '.md5'], text=True)
print('.md5 says:', md5.strip())
assert re.fullmatch(r'[0-9a-f]{32}  hungary-latest\.osm\.pbf\n', md5), 'an unexpected .md5 format'
head = subprocess.check_output(['curl', '--fail', '--silent', '--show-error', '--head', BASE], text=True)
print('first answer:', head.splitlines()[0].strip())
location = next((l for l in head.splitlines() if l.lower().startswith('location:')), '')
print('redirects to:', location.split(':', 1)[1].strip() if location else 'no redirect')

print()
print('===== the same step, with Monaco in place of Hungary')
small = script.replace('hungary-latest', 'monaco-latest')
assert small != script
run = subprocess.run(['bash', '-e', '-c', small], cwd=work, capture_output=True, text=True)
print('exit', run.returncode)
print('stdout:', run.stdout.strip())
print('saved:', sorted(os.listdir(work)))

print()
print('===== the same check, on a corrupted file')
with open(os.path.join(work, 'monaco-latest.osm.pbf'), 'ab') as f:
    f.write(b'x')
check = script.splitlines()[-1].replace('hungary-latest', 'monaco-latest')
print('$', check)
bad = subprocess.run(['bash', '-e', '-c', check], cwd=work, capture_output=True, text=True)
print('exit', bad.returncode)
print('stdout:', bad.stdout.strip())
print('stderr:', bad.stderr.strip())

sys.exit(0 if run.returncode == 0 and bad.returncode != 0 else 1)
