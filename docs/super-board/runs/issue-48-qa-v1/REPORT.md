# Issue 48 QA v1

- AC1: grep for COVERAGE_BOX and coverageBox in non-test files shows the numbers only at src/core/coverage.ts:5. scripts/data/osm.ts:1 and build.ts:10 import it.
- AC2: scripts/data/build.test.ts pins extractArgs and manifest box; passes.
- AC3: npm run data:fixture leaves test/fixtures/site-data/ unchanged (git status clean). npm run verify: typecheck, test, build pass; e2e 266 pass, 2 list.spec.ts loading tests timed out under load on this Pi (13 min map.spec.ts); both pass on rerun in isolation (8/8).
- pr-security-review: 0 findings (constant moved between modules; no input, auth, network or data surface).
- Non-visual change: no screenshots.
- Note: scripts/data/osm.ts has a stray double blank line after the imports (cosmetic).
