import { spawnSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const root = join(import.meta.dirname, '..')

it('fails the type check on an implicit any in the data build', { timeout: 60_000 }, () => {
  const name = `implicit-any-${process.pid}.ts`
  const file = join(root, 'scripts/data', name)
  writeFileSync(file, 'export const echo = (value) => value\n')
  try {
    const { stdout } = spawnSync('npx', ['tsc'], { cwd: root, encoding: 'utf8' })
    expect(stdout).toMatch(new RegExp(`scripts/data/${name}.*TS7006`))
  } finally {
    rmSync(file)
  }
})
