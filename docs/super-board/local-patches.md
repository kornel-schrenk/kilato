# Local patches to super-board

super-board is installed at commit `d0b7d5a` (3.3.0). These changes are ours, and an upgrade overwrites them. After an upgrade, check each one and reapply it if the problem is still there.

The full diffs are on the PRs: [#25](https://github.com/kornel-schrenk/kilato/pull/25), [#26](https://github.com/kornel-schrenk/kilato/pull/26), [#37](https://github.com/kornel-schrenk/kilato/pull/37) and [#50](https://github.com/kornel-schrenk/kilato/pull/50). The last column refers to [findings.md](findings.md), the list to send the super-board author. The skills we added are in [helper-skills.md](helper-skills.md).

| File | Change | Problem it fixes | PR | Finding |
|---|---|---|---|---|
| `.agents/bin/super-board-github-read.py` | A failed command-line read of an agent-facing kind exits 64, and only that call fails, unless the error is an access failure or an outage (`ACCESS_OR_OUTAGE`) | One agent's stray read halted the whole run, three times in the first four waves, with GitHub healthy. Each halt came from a different error, so listing bad reads one by one wouldn't end it | #25, #26 | 2, 3, 7 |
| `.agents/bin/super-board-deps.sh` | Sets `SB_GITHUB_READ_STRICT=1` | The planner's dependency read has a fixed command, and it must stop the run when it fails | #26 | 7 |
| `.agents/workflows/super-board-wave.js` | Lane prompts say a rejected read fails only that call, and to use plain `gh` for anything optional, with no made-up ids | Agents need to know the read failed and the run didn't, and most stray reads don't need the helper | #25, #26 | 2, 7 |
| `.agents/workflows/super-board-wave.js` | The "labelled qa" prompt line also checks the card's label | `card.status` stays `Ready` after Build, so QA on every built card got that line | #25 | 1 |
| `.agents/workflows/super-board-wave.js` | Each lane makes its own temp folder and stops only its own processes | Lanes share a scratchpad, and one posted another lane's drafts as 20 duplicate PR comments. A broad `pkill` can hit another card's server | #25 | 4, 5 |
| `.agents/skills/super-board/references/run-workflow.md`, `run.md` | Describe the new exit 64 case | The docs would otherwise contradict the helper | #25, #26 | 2, 3, 7 |
| `.agents/bin/super-board-skills-ready.py` | Declares the fallback `resolve-and-verify` for `mattpocock-skills:resolving-merge-conflicts` | Its pack removed that skill on 2026-09-24, with nothing replacing it, so a fresh install can't supply it, and any rebase with a live conflict halted the run | #37 | 17 |
| `.agents/skills/super-build/references/decision-policy.md`, `worker-preamble.md`, `.agents/skills/super-board/references/run.md` | Add the fallback's steps under "Resolving a conflict", and point to them | A declared fallback needs instructions for the lane to follow | #37 | 17 |
| `.agents/bin/super-board-pr-body.sh`, `.agents/skills/super-board/references/run-workflow.md` | After a failed PATCH, waits 5 seconds and reads the body back. If the edit landed, it reports success. If the body is untouched, it retries once. Otherwise it halts, and the halt record now keeps `gh`'s error | One failed status-block update halted the whole run, with the error discarded, when the write had simply never reached GitHub | #50 | 32 |

## What still halts

- Reads from `super-board-merge-gate.sh`, `super-board-preflight.sh`, `super-board-card.sh` and `super-board-deps.sh`, which set `SB_GITHUB_READ_STRICT=1`.
- Reads by code that imports the helper, such as `super-board-approval.py`, and the `--resume` recovery read.
- Kinds outside `FORMS`, such as `approval` and `permission`.
- Authentication and permission errors (HTTP 401 and 403), on any read. An agent probing an endpoint it has no permission for still halts the run.
- Rate limits and outages that last all three attempts, on any read.
- A PR body update that fails twice with the body unchanged, whose read-back fails, or whose read-back shows a body changed by someone else.
- A lane running `--require` for a helper that is neither installed nor given a fallback. Every skill in the registry resolves on `develop` now, but a worktree on a branch cut earlier reads that branch's copy (finding 26).

An outage whose error text matches nothing in `ACCESS_OR_OUTAGE` fails only that call. The next strict script then halts the run.
