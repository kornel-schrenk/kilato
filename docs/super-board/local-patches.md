# Local patches to super-board

super-board is installed at commit `d0b7d5a` (3.3.0). These changes are ours, and an upgrade overwrites them. After an upgrade, check each one and reapply it if the problem is still there.

| File | Change | Problem it fixes |
|---|---|---|
| `.agents/bin/super-board-github-read.py` | A `gh` flag error or an HTTP 404 on a command-line read of an agent-facing kind exits 64, and only that call fails | One agent's stray read halted the whole run, twice in the first three waves, with GitHub healthy |
| `.agents/workflows/super-board-wave.js` | Lane prompts say a flag error or 404 fails only that call | Agents need to know the read failed and the run didn't |
| `.agents/workflows/super-board-wave.js` | The "labelled qa" prompt line also checks the card's label | `card.status` stays `Ready` after Build, so QA on every built card got that line |
| `.agents/workflows/super-board-wave.js` | Each lane makes its own temp folder and stops only its own processes | Lanes share a scratchpad, and one posted another lane's drafts as 20 duplicate PR comments. A broad `pkill` can hit another card's server |
| `.agents/skills/super-board/references/run-workflow.md` | Describes the new exit 64 case | The doc would otherwise contradict the helper |

## What still halts

- Reads from `super-board-merge-gate.sh`, `super-board-preflight.sh` and `super-board-card.sh`, which set `SB_GITHUB_READ_STRICT=1`.
- Reads by code that imports the helper, such as `super-board-approval.py`, and the `--resume` recovery read.
- Kinds outside `FORMS`, such as `approval` and `permission`.
- Authentication and permission errors (HTTP 401 and 403), and outages that last all three attempts.
- Invalid GraphQL queries, and "Could not resolve to" errors, on any read.
