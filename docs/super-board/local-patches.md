# Local patches to super-board

super-board is installed at commit `d0b7d5a` (3.3.0). These changes are ours, and an upgrade overwrites them. After an upgrade, check each one and reapply it if the problem is still there.

| File | Change | Problem it fixes |
|---|---|---|
| `.agents/bin/super-board-github-read.py` | A failed command-line read of an agent-facing kind exits 64, and only that call fails, unless the error is an access failure or an outage (`ACCESS_OR_OUTAGE`) | One agent's stray read halted the whole run, three times in the first four waves, with GitHub healthy. Each halt came from a different error, so listing bad reads one by one wouldn't end it |
| `.agents/bin/super-board-deps.sh` | Sets `SB_GITHUB_READ_STRICT=1` | The planner's dependency read has a fixed command, and it must stop the run when it fails |
| `.agents/workflows/super-board-wave.js` | Lane prompts say a rejected read fails only that call, and to use plain `gh` for anything optional, with no made-up ids | Agents need to know the read failed and the run didn't, and most stray reads don't need the helper |
| `.agents/workflows/super-board-wave.js` | The "labelled qa" prompt line also checks the card's label | `card.status` stays `Ready` after Build, so QA on every built card got that line |
| `.agents/workflows/super-board-wave.js` | Each lane makes its own temp folder and stops only its own processes | Lanes share a scratchpad, and one posted another lane's drafts as 20 duplicate PR comments. A broad `pkill` can hit another card's server |
| `.agents/skills/super-board/references/run-workflow.md`, `run.md` | Describe the new exit 64 case | The docs would otherwise contradict the helper |

## What still halts

- Reads from `super-board-merge-gate.sh`, `super-board-preflight.sh`, `super-board-card.sh` and `super-board-deps.sh`, which set `SB_GITHUB_READ_STRICT=1`.
- Reads by code that imports the helper, such as `super-board-approval.py`, and the `--resume` recovery read.
- Kinds outside `FORMS`, such as `approval` and `permission`.
- Authentication and permission errors (HTTP 401 and 403), on any read. An agent probing an endpoint it has no permission for still halts the run.
- Rate limits and outages that last all three attempts, on any read.

An outage whose error text matches nothing in `ACCESS_OR_OUTAGE` fails only that call. The next strict script then halts the run.
