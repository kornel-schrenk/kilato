import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'

const workflow = readFileSync(join(import.meta.dirname, '../.github/workflows/deploy.yml'), 'utf8')

/** A top-level key and everything indented under it. */
function topLevel(key: string) {
  return workflow.match(new RegExp(`^${key}:\\n(?: .*\\n)*`, 'm'))?.[0]
}

/** The job's steps in order, each as its own lines of YAML. */
const steps = workflow.split(/^ {6}- /m).slice(1)

/** The one step that has this text in it. */
function stepWith(text: string) {
  const found = steps.filter((step) => step.includes(text))
  expect(found, text).toHaveLength(1)
  return found[0]!
}

/** The shell script of a step, on one line or in a block. */
function script(step: string) {
  const block = step.match(/^ {8}run: \|\n((?: {10}.*\n)+)/m)
  return block ? block[1]!.replace(/^ {10}/gm, '') : step.match(/^ {8}run: (.*)$/m)![1]!
}

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kilato-deploy-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

/** Runs a step's script in the temp dir the way GitHub runs it, with `bash -e`. */
function run(step: string, env: Record<string, string>) {
  return spawnSync('bash', ['-e', '-c', script(step)], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } })
}

it('runs on a push to main, on Mondays at 03:17 UTC and by hand with rebuild_data', () => {
  expect(topLevel('on')).toBe(`on:
  push:
    branches: [main]
  schedule:
    - cron: '17 3 * * 1'
  workflow_dispatch:
    inputs:
      rebuild_data:
        description: Rebuild the data even if this week's is in the cache
        type: boolean
`)
})

it('asks for the four permissions, and no job changes them', () => {
  expect(topLevel('permissions')).toBe(`permissions:
  contents: read
  pages: write
  id-token: write
  actions: write
`)
  expect(workflow.match(/permissions:/g)).toHaveLength(1)
})

it('shares the group pages, and a new run waits for one in progress', () => {
  expect(topLevel('concurrency')).toBe(`concurrency:
  group: pages
  cancel-in-progress: false
`)
})

it('restores the data cache under data-<ISO week>', () => {
  const week = stepWith('GITHUB_OUTPUT')
  expect(script(week)).toContain('date -u +%G-W%V')

  const output = join(dir, 'output')
  expect(run(week, { GITHUB_OUTPUT: output }).status).toBe(0)
  expect(readFileSync(output, 'utf8')).toMatch(/^key=data-\d{4}-W\d{2}\n$/)

  const restore = stepWith('actions/cache/restore@')
  expect(restore).toContain('path: data\n')
  expect(restore).toContain('key: ${{ steps.week.outputs.key }}\n')
})

const REBUILD = "if: steps.cache.outputs.cache-hit != 'true' || inputs.rebuild_data\n"

it('installs osmium-tool with apt on a cache miss or with rebuild_data', () => {
  const install = stepWith('osmium-tool')
  expect(install).toContain(REBUILD)
  expect(script(install)).toBe('sudo apt-get update\nsudo apt-get install -y osmium-tool\n')
})

/**
 * Downloads the extract with a stand-in for curl, which saves `extract` and, in Geofabrik's format,
 * the md5 of the real thing. Like the real site it redirects, so it refuses a call with no --location.
 */
function download(extract: string) {
  const md5 = createHash('md5').update('the extract').digest('hex')
  mkdirSync(join(dir, 'bin'))
  writeFileSync(
    join(dir, 'bin/curl'),
    `#!/bin/bash
[[ " $* " == *" --location "* && " $* " == *" --remote-name "* ]] || exit 1
url=\${@: -1}
echo "$url" >> urls.txt
case "$url" in
  *.md5) echo "${md5}  hungary-latest.osm.pbf" > "\${url##*/}" ;;
  *) printf '${extract}' > "\${url##*/}" ;;
esac
`,
  )
  chmodSync(join(dir, 'bin/curl'), 0o755)
  return run(stepWith('md5sum'), { PATH: `${join(dir, 'bin')}:${process.env.PATH}` })
}

it('downloads the Hungary extract and its .md5 on a cache miss or with rebuild_data', () => {
  expect(stepWith('md5sum')).toContain(REBUILD)
  expect(download('the extract').status).toBe(0)
  expect(readFileSync(join(dir, 'urls.txt'), 'utf8')).toBe(
    'https://download.geofabrik.de/europe/hungary-latest.osm.pbf\n' +
      'https://download.geofabrik.de/europe/hungary-latest.osm.pbf.md5\n',
  )
})

it('fails the step when the extract does not match its .md5', () => {
  const { status, stdout } = download('a broken download')
  expect(status).not.toBe(0)
  expect(stdout).toContain('hungary-latest.osm.pbf: FAILED')
})

it('builds the data from the extract on a cache miss or with rebuild_data', () => {
  const build = stepWith('data:build')
  expect(build).toContain(REBUILD)
  expect(script(build)).toBe('npm run data:build -- --pbf hungary-latest.osm.pbf --out data')
})

it('saves the rebuilt data under the same key on a cache miss or with rebuild_data', () => {
  const save = stepWith('actions/cache/save@')
  expect(save).toContain(REBUILD)
  expect(save).toContain('path: data\n')
  expect(save).toContain('key: ${{ steps.week.outputs.key }}\n')
})

it("replaces this week's cache when rebuild_data finds one, because a cache can't be changed", () => {
  const drop = stepWith('actions/caches')
  expect(drop).toContain("if: steps.cache.outputs.cache-hit == 'true' && inputs.rebuild_data\n")
  expect(drop).toContain('GH_TOKEN: ${{ github.token }}\n')
  expect(drop).toContain('KEY: ${{ steps.week.outputs.key }}\n')
  expect(script(drop)).toBe('gh api --method DELETE "repos/$GITHUB_REPOSITORY/actions/caches?key=$KEY&ref=$GITHUB_REF"')
})

it('builds the page and copies the data into it on every run', () => {
  const build = stepWith('npm run build')
  const copy = stepWith('cp -r')
  expect(script(build)).toBe('npm run build')
  expect(script(copy)).toBe('cp -r data dist/data')
  expect(build).not.toContain('if:')
  expect(copy).not.toContain('if:')
})

it('uploads dist and deploys it to the github-pages environment', () => {
  expect(stepWith('actions/upload-pages-artifact@')).toContain('path: dist\n')
  expect(stepWith('actions/deploy-pages@')).toContain('id: deployment\n')
  expect(workflow).toContain(`    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
`)
})

it('ends by enabling the workflow with its own token on every run, to keep the schedule alive', () => {
  const last = steps.at(-1)!
  expect(script(last)).toBe('gh api --method PUT "repos/$GITHUB_REPOSITORY/actions/workflows/deploy.yml/enable"')
  expect(last).toContain('GH_TOKEN: ${{ github.token }}\n')
  expect(last).toContain('if: ${{ !cancelled() }}\n')
})

it('sets up Node 24 with the locked dependencies, then takes the steps in the order of the spec', () => {
  expect(stepWith('actions/setup-node@')).toContain('node-version: 24\n')
  const order = [
    'actions/checkout@',
    'actions/setup-node@',
    'run: npm ci\n',
    'date -u',
    'actions/cache/restore@',
    'osmium-tool',
    'md5sum',
    'data:build',
    'actions/caches',
    'actions/cache/save@',
    'npm run build',
    'cp -r',
    'actions/upload-pages-artifact@',
    'actions/deploy-pages@',
    'actions/workflows/deploy.yml/enable',
  ]
  expect(steps).toHaveLength(order.length)
  order.forEach((text, index) => expect(steps[index]).toContain(text))
})

it('refers only to steps that have that id', () => {
  const ids = [...workflow.matchAll(/^ +id: (\S+)$/gm)].map((match) => match[1])
  const used = [...workflow.matchAll(/steps\.([\w-]+)\./g)].map((match) => match[1])
  expect(new Set(used)).toEqual(new Set(ids))
})
