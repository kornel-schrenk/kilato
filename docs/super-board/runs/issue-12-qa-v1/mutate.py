# The mutation pass behind mutants.txt: changes deploy.yml one way at a time in a copy of the tree, and runs its test.
#   unshare -rn python3 -I mutate.py <copy of the tree, with node_modules linked> <report file>
# It runs with no network. The test's download step uses a stand-in curl, so a live call would be a bug.
import json, os, subprocess, sys

root, report = sys.argv[1], sys.argv[2]
FILE = '.github/workflows/deploy.yml'
original = open(os.path.join(root, FILE), encoding='utf8').read()

REBUILD = "if: steps.cache.outputs.cache-hit != 'true' || inputs.rebuild_data"
M = [
    # triggers
    ('on: no push trigger', "  push:\n    branches: [main]\n", ''),
    ('on: push from develop', 'branches: [main]', 'branches: [develop]'),
    ('on: push from every branch', '  push:\n    branches: [main]\n', '  push:\n'),
    ('on: pull_request added', '  schedule:\n', '  pull_request:\n  schedule:\n'),
    ('on: top of the hour', "'17 3 * * 1'", "'0 3 * * 1'"),
    ('on: Sundays', "'17 3 * * 1'", "'17 3 * * 0'"),
    ('on: no schedule', "  schedule:\n    - cron: '17 3 * * 1'\n", ''),
    ('on: no workflow_dispatch', "  workflow_dispatch:\n    inputs:\n      rebuild_data:\n        description: Rebuild the data even if this week's is in the cache\n        type: boolean\n", ''),
    ('on: input is a string', 'type: boolean', 'type: string'),
    ('on: input renamed', '      rebuild_data:\n', '      rebuild:\n'),
    ('on: ticked by default', '        type: boolean\n', '        type: boolean\n        default: true\n'),
    # permissions
    ('perm: contents write', 'contents: read', 'contents: write'),
    ('perm: no pages', '  pages: write\n', ''),
    ('perm: no id-token', '  id-token: write\n', ''),
    ('perm: no actions', '  actions: write\n', ''),
    ('perm: actions read', 'actions: write', 'actions: read'),
    ('perm: job narrows them', '    runs-on: ubuntu-latest\n', '    runs-on: ubuntu-latest\n    permissions:\n      contents: read\n'),
    # concurrency
    ('conc: other group', 'group: pages', 'group: deploy'),
    ('conc: cancels', 'cancel-in-progress: false', 'cancel-in-progress: true'),
    ('conc: gone', 'concurrency:\n  group: pages\n  cancel-in-progress: false\n\n', ''),
    # cache key
    ('key: calendar year', '+%G-W%V', '+%Y-W%V'),
    ('key: US week', '+%G-W%V', '+%G-W%U'),
    ('key: local time', 'date -u +', 'date +'),
    ('key: other prefix', 'key=data-', 'key=site-'),
    ('key: fixed', 'key=data-$(date -u +%G-W%V)', 'key=data'),
    ('key: written to stdout', '>> "$GITHUB_OUTPUT"', ''),
    # restore
    ('restore: other path', "uses: actions/cache/restore@v6\n        with:\n          path: data", "uses: actions/cache/restore@v6\n        with:\n          path: dist"),
    ('restore: other key', "uses: actions/cache/restore@v6\n        with:\n          path: data\n          key: ${{ steps.week.outputs.key }}", "uses: actions/cache/restore@v6\n        with:\n          path: data\n          key: data"),
    ('restore: combined action', 'actions/cache/restore@v6', 'actions/cache@v6'),
    ('restore: a miss fails the run', "uses: actions/cache/restore@v6\n        with:\n          path: data\n", "uses: actions/cache/restore@v6\n        with:\n          fail-on-cache-miss: true\n          path: data\n"),
    ('restore: last week counts', "uses: actions/cache/restore@v6\n        with:\n          path: data\n", "uses: actions/cache/restore@v6\n        with:\n          restore-keys: data-\n          path: data\n"),
    # rebuild
    ('osmium: always', f"        {REBUILD}\n        run: |\n          sudo apt-get update", "        run: |\n          sudo apt-get update"),
    ('osmium: ignores rebuild_data', f"        {REBUILD}\n        run: |\n          sudo apt-get update", "        if: steps.cache.outputs.cache-hit != 'true'\n        run: |\n          sudo apt-get update"),
    ('osmium: other package', 'apt-get install -y osmium-tool', 'apt-get install -y osmium'),
    ('osmium: no update', '          sudo apt-get update\n', ''),
    ('dl: other extract', 'europe/hungary-latest.osm.pbf\n', 'europe/austria-latest.osm.pbf\n'),
    ('dl: http', 'curl --fail --location --remote-name https://download.geofabrik.de/europe/hungary-latest.osm.pbf\n', 'curl --fail --location --remote-name http://download.geofabrik.de/europe/hungary-latest.osm.pbf\n'),
    ('dl: no md5 file', '          curl --fail --location --remote-name https://download.geofabrik.de/europe/hungary-latest.osm.pbf.md5\n', ''),
    ('dl: no check', '          md5sum --check hungary-latest.osm.pbf.md5\n', ''),
    ('dl: a failed check passes', 'md5sum --check hungary-latest.osm.pbf.md5', 'md5sum --check hungary-latest.osm.pbf.md5 || true'),
    ('dl: no redirect', 'curl --fail --location --remote-name https://download.geofabrik.de/europe/hungary-latest.osm.pbf\n', 'curl --fail --remote-name https://download.geofabrik.de/europe/hungary-latest.osm.pbf\n'),
    ('dl: no --fail', 'curl --fail --location --remote-name https://download.geofabrik.de/europe/hungary-latest.osm.pbf\n', 'curl --location --remote-name https://download.geofabrik.de/europe/hungary-latest.osm.pbf\n'),
    ('build: always', f"        {REBUILD}\n        run: npm run data:build", "        run: npm run data:build"),
    ('build: other folder', '--out data', '--out dist/data'),
    ('build: no extract', ' -- --pbf hungary-latest.osm.pbf --out data', ''),
    ('build: failure ignored', f"        {REBUILD}\n        run: npm run data:build", f"        {REBUILD}\n        continue-on-error: true\n        run: npm run data:build"),
    # drop and save
    ('drop: on every hit', "if: steps.cache.outputs.cache-hit == 'true' && inputs.rebuild_data", "if: steps.cache.outputs.cache-hit == 'true'"),
    ('drop: or, not and', "if: steps.cache.outputs.cache-hit == 'true' && inputs.rebuild_data", "if: steps.cache.outputs.cache-hit == 'true' || inputs.rebuild_data"),
    ('drop: every ref', '&ref=$GITHUB_REF', ''),
    ('drop: gone, so a rebuild never replaces the cache', "      - name: Drop the cached data this rebuild replaces\n        # A cache can't be changed, and the key stays the same all week, so the save would otherwise do nothing.\n        if: steps.cache.outputs.cache-hit == 'true' && inputs.rebuild_data\n        env:\n          GH_TOKEN: ${{ github.token }}\n          KEY: ${{ steps.week.outputs.key }}\n        run: gh api --method DELETE \"repos/$GITHUB_REPOSITORY/actions/caches?key=$KEY&ref=$GITHUB_REF\"\n", ''),
    ('save: always', f"        {REBUILD}\n        uses: actions/cache/save@v6", "        uses: actions/cache/save@v6"),
    ('save: ignores rebuild_data', f"        {REBUILD}\n        uses: actions/cache/save@v6", "        if: steps.cache.outputs.cache-hit != 'true'\n        uses: actions/cache/save@v6"),
    ('save: even after a failure', f"        {REBUILD}\n        uses: actions/cache/save@v6", f"        if: ${{{{ !cancelled() && (steps.cache.outputs.cache-hit != 'true' || inputs.rebuild_data) }}}}\n        uses: actions/cache/save@v6"),
    ('save: other path', "uses: actions/cache/save@v6\n        with:\n          path: data", "uses: actions/cache/save@v6\n        with:\n          path: dist"),
    # page
    ('page: only on a rebuild', '      - name: Build the page\n', f'      - name: Build the page\n        {REBUILD}\n'),
    ('page: copy to the wrong place', 'cp -r data dist/data', 'cp -r data dist/'),
    ('page: copy to the root', 'cp -r data dist/data', 'cp -r data/. dist/'),
    ('page: copy tolerates no data', 'cp -r data dist/data', 'cp -r data dist/data || true'),
    ('page: copy only on a rebuild', '      - name: Copy the data into the page\n', f'      - name: Copy the data into the page\n        {REBUILD}\n'),
    ('upload: other folder', "uses: actions/upload-pages-artifact@v5\n        with:\n          path: dist", "uses: actions/upload-pages-artifact@v5\n        with:\n          path: ."),
    ('upload: plain artifact', 'actions/upload-pages-artifact@v5', 'actions/upload-artifact@v5'),
    ('upload: only on a rebuild', '      - name: Upload the site\n', f'      - name: Upload the site\n        {REBUILD}\n'),
    ('deploy: only on a rebuild', '      - name: Deploy the site\n', f'      - name: Deploy the site\n        {REBUILD}\n'),
    ('deploy: failure ignored', '      - name: Deploy the site\n', '      - name: Deploy the site\n        continue-on-error: true\n'),
    ('deploy: never on main', '    runs-on: ubuntu-latest\n', "    if: github.ref != 'refs/heads/main'\n    runs-on: ubuntu-latest\n"),
    ('deploy: no id', '        id: deployment\n', ''),
    ('env: other name', 'name: github-pages', 'name: pages'),
    ('env: no url', '      url: ${{ steps.deployment.outputs.page_url }}\n', ''),
    # keepalive
    ('keep: POST', '--method PUT', '--method POST'),
    ('keep: disables', 'deploy.yml/enable', 'deploy.yml/disable'),
    ('keep: other workflow', 'workflows/deploy.yml/enable', 'workflows/ci.yml/enable'),
    ('keep: only on success', '        if: ${{ !cancelled() }}\n', ''),
    ('keep: also when cancelled', '!cancelled()', 'always()'),
    ('keep: another token', 'GH_TOKEN: ${{ github.token }}\n        run: gh api --method PUT', 'GH_TOKEN: ${{ secrets.PAT }}\n        run: gh api --method PUT'),
    ('keep: not the last step', 'actions/workflows/deploy.yml/enable"\n', 'actions/workflows/deploy.yml/enable"\n      - name: One more\n        run: echo done\n'),
    # setup
    ('node: 22', 'node-version: 24', 'node-version: 22'),
    ('node: npm install', 'run: npm ci', 'run: npm install'),
    ('node: no npm cache', '          cache: npm\n', ''),
    ('setup: no checkout', '      - name: Check out\n        uses: actions/checkout@v7\n', ''),
    ('setup: other runner', 'runs-on: ubuntu-latest', 'runs-on: macos-latest'),
    # behaviour-preserving: these should stay green
    ('REFACTOR: a step renamed', '- name: Upload the site', '- name: Publish the artifact'),
    ('REFACTOR: comment changed', "# GitHub turns off the schedule", "# The schedule stops"),
]


def run():
    out = os.path.join(root, 'result.json')
    if os.path.exists(out):
        os.remove(out)
    subprocess.run(['npx', 'vitest', 'run', 'test/deploy-workflow.test.ts', '--reporter=json', '--outputFile=' + out],
                   cwd=root, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
    data = json.load(open(out))
    failed = []
    for f in data['testResults']:
        failed += [a['title'] for a in f['assertionResults'] if a['status'] == 'failed']
        if f.get('status') == 'failed' and not f['assertionResults']:
            failed.append('(suite error)')
    return data['numTotalTests'], failed


lines = []
total, failed = run()
lines.append(f'Unchanged copy: {total} tests, {len(failed)} failed.')
assert not failed, failed

survived = []
for name, old, new in M:
    if old not in original:
        lines.append(f'NOT APPLIED  {name}')
        continue
    with open(os.path.join(root, FILE), 'w', encoding='utf8') as f:
        f.write(original.replace(old, new, 1))
    try:
        total, failed = run()
    finally:
        with open(os.path.join(root, FILE), 'w', encoding='utf8') as f:
            f.write(original)
    if failed:
        lines.append(f'killed    {name}  ({len(failed)} test{"s" if len(failed) != 1 else ""})')
    else:
        survived.append(name)
        lines.append(f'SURVIVED  {name}')

mutants = [m for m in lines if m.startswith(('killed', 'SURVIVED')) and 'REFACTOR' not in m]
killed = [m for m in mutants if m.startswith('killed')]
lines.append('')
lines.append(f'{len(killed)} of {len(mutants)} changes fail a test.')
open(report, 'w', encoding='utf8').write('\n'.join(lines) + '\n')
print('\n'.join(lines))
