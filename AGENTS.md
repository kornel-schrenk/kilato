# AGENTS.md

Kilátó, a pocket lookout tower: a web page that shows what is interesting near you, starting in Budapest. It is also a test. We build it to evaluate the [super-board](https://github.com/EricTechPro/super-board) software factory along Anthropic's [AI-native SDLC playbook](https://claude.com/resources/articles/the-ai-native-sdlc-playbook).

## How work flows

| Stage | Artifact | Written by | Accepted when |
|---|---|---|---|
| 01 Plan | `intent/<date>-<slug>.md` | Claude, in the product owner's words | the product owner merges its PR |
| 02 Design | `spec/<date>-<slug>.md` | Claude, from the accepted intent | the product owner merges its PR |
| 02 Design | GitHub issues in Backlog | Claude, from the accepted spec | the product owner moves them to Ready |
| 03 Build, 04 Test | one PR per issue | super-board | super-board's merge gate passes |
| Deploy | a promotion PR from `develop` to `main` | Claude, when the product owner asks | the product owner merges its PR |

- Intents and specs carry a `Status:` line: `draft` while the PR is open, `accepted` after the merge.
- super-board builds exactly what an issue says. Nothing is built without an issue, and no issue asks for more than the accepted spec says.
- Every PR targets `develop`. `main` is what goes live: the spec's deploy workflow publishes it to GitHub Pages. Only a promotion PR from `develop` changes `main`.
- Kornel Schrenk is the product owner. super-board works as the machine account `kornel-schrenk-bot`, so its card claims, comments and PRs show that name. The merge is the acceptance record.

## Where we are

Read the stage from the artifacts. The newest accepted artifact in the table above marks the last finished stage. For example, an accepted intent with no spec means Design is next.

## Conventions

- Commit and PR titles: `<emoji> [type] scope: subject`. Types: 📝 docs, ✨ feat, 🐛 fix, 🔧 chore, ♻️ refactor, 🧪 test.
- Product constraints (data sources, privacy, languages, licences) live in the accepted intent and spec. Read them there, and don't restate them here.
- There is no limit on a PR's size. `merge_policy.auto_max_lines` is 0, and that overrides the 400-line default in the super-board skills. Don't hold, stop or split a card because of its line count.

## Commands

| Command | Does |
|---|---|
| `npm ci` | installs the locked dependencies |
| `npx playwright install chromium` | installs Playwright's Chromium, once per Playwright version |
| `npm run verify` | runs `typecheck`, `test`, `build` and `test:e2e`, in that order. super-board's merge gate runs it |
| `npm run typecheck` | checks types with `tsc`, in strict mode |
| `npm test` | runs the Vitest unit tests |
| `npm run build` | builds the page into `dist/`, with the base `/kilato/` |
| `npm run preview` | serves that build at `http://localhost:4173/kilato/` |
| `npm run test:e2e` | runs the Playwright page tests against `vite preview`, on the last build |
| `npm run dev` | starts the Vite dev server |

- Page tests import `test` from `e2e/fixtures.ts`. Its fixture passes files in `dist/`, stubs tile and data requests, and fails the test on any other request.
- End every page test with an assertion that follows its last action. The fixture checks for unknown requests the moment the test ends, so a request that action starts can arrive too late, and the test still passes. With `goto` as a test's last line, a stray request at page load went unnoticed in 18 of 30 runs.
- With `CHROMIUM_PATH=/usr/bin/chromium` set, page tests launch that browser instead of Playwright's own Chromium.

<!-- super-board:begin v3.3.0 (managed; edits inside are overwritten on upgrade) -->
## Super Board

Board: Backlog · Ready · Building · QA · Review · Blocked · Done. Labels route: `qa` skips Building · `bug`, `feature`, none → built first.

| When | Use | NEVER |
|---|---|---|
| Set up / repair the board | `/super-board onboard` | DON'T hand-edit config mid-run |
| Check tickets before a run | `/super-board lint` | NEVER run with AC-less tickets |
| Drain the board | `/super-board run` | NEVER build, test or merge from the orchestrator |
| Board state / halt | `/super-board status` · `/super-board stop` | |
| Build one ticket | `/super-build` | NEVER build outside the card's worktree |
| QA a branch, or a live URL alone | `/super-qa` · `/super-qa <url>` | NEVER mark QA pass without evidence |
| Review a PR, merge | `/super-review` | NEVER `gh pr merge` direct — merge gate only |
| Turn Sentry, PostHog, PR problems into tickets | `/super-collect` | DON'T skip the verifier; it hands off to `/to-spec` |
| UI polish | `/ui-refine-loop` (human runs it) | board NEVER runs it |
| Diagram / explainer page | `/visual` | |
| Commit, pull, push this branch | `/git-sync` | NEVER force push or rebase shared history |

| Rule | Value |
|---|---|
| Config | `.claude/super-board/configs/<slug>.json` |
| Isolation | 1 card · 1 worktree · 1 branch |
| Merge | auto for normal changes · money, auth, destructive schema (DROP/TRUNCATE/RENAME) → human |
| Migrations | additive → robot migrates allowed DBs only · live DB ALWAYS → 🙋 needs you |
| Blocked card | block-template comment · last line `blocked-by:` · 🙋 = needs you |
| Secrets | NEVER read `.env`; key names via `.claude/bin/super-board-env-check.sh` |

## Writing (super-board)

| Thing | Format → `.claude/skills/super-board/references/writing-standard.md` |
|---|---|
| Commit, PR title | `<emoji> [type] scope: subject` + short bullets · ✨ feat 🐛 fix 🔧 chore ♻️ refactor 🧪 test 📝 docs |
| PR body | blocks: status · Problem · Solution · AC + proof · history · Before\|After · Risk — `super-board-pr-body.sh` |
| Ticket | Problem · Context · Fix · AC · Risk · Blocked by → `docs/agents/issue-tracker.md` |
| Comment | `[role] [label] status` · Did · ✅ Done · ❌ Not done · Next · ≤ 8 lines |
| PR author notes | file + critical inline review comments: Purpose · What changed · Why it matters → `pr-author-notes.md` |

- NEVER chain steps with arrows. One step per line, lettered under Where.
- NEVER link screenshots. Embed a raw URL pinned to a sha.
- DON'T repeat file lists in status comments. DON'T write "Not verified" or "Next" in a PR body.
<!-- super-board:end -->
