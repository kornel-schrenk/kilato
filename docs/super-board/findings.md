# Findings for the super-board author

What we saw running super-board 3.3.0 (`d0b7d5a`) on Kilátó, a 17-card test project, with the workflow backend on a Raspberry Pi. [local-patches.md](local-patches.md) lists what we changed in response. Where a finding may come from our setup or the host rather than super-board, it says so.

This is the status as of wave 9, on 2026-11-04. The numbers stay fixed, so PRs and later notes can refer to them.

## Halts

**8. The impact of 2, 3 and 7.** After four waves and 1.47M agent tokens, the first card hadn't merged. Three of those waves ended on a lane's own read, with GitHub healthy. With the patches in place, waves 5 to 8 merged five cards with no halts.

**2. A `gh` usage error counts as an outage.** An agent's `gh api --paginate --slurp --jq` is a form `gh` refuses. Exit 64 only covered a payload of the wrong shape, and `permanent_error` has no pattern for flag errors, so each attempt counted as failed, and the run halted after three. *Patched in PRs #25 and #26. The halt record still keeps no stderr.*

**3. An optional read can halt the run.** `permanent_error` counts every HTTP 404 as permanent. A QA lane read `develop`'s branch protection for an optional check. The branch is unprotected, so GitHub answered 404, and the run stopped on the first attempt. *Patched in PR #25.*

**7. Agents probe through the helper.** A throwaway read with a made-up node id, its exit code marked "ignored" in the command, halted the run with "Could not resolve to a node". The lane had already read that this case halts. A rule that any helper read can halt doesn't suit a tool agents use freely. *Patched in PR #26, which inverts the rule: an agent's own read halts only on an access failure or an outage. Sampling real `gh` failures found at least six more error texts that would each have halted.*

**17. A required skill no longer exists upstream.** `mattpocock/skills` removed `resolving-merge-conflicts` on 2026-09-24 (`daa01d8`), five weeks before we installed, with nothing replacing it. `super-board-skills-ready.py` lists it as conditional with no fallback, so the pre-wave check passes, and the run halts only when a card first needs a rebase with a live conflict. A fresh install can't supply it. `run.md` makes a rebase pass the normal response to merge-gate exit 2 or 5, and finding 15 shows parallel cards cause those. The planner could see this coming from the `loop:rebase` label. *Patched in PR #37 with a declared fallback.*

**21. Two more helpers set the same trap, and lanes handle it differently.** `vitest` and `playwright-best-practices` are conditional with no fallback and aren't installed here, so `--require vitest` exits 10. In wave 8, #10's Builder ran it through a pipe that hid the exit code, saw "missing" and carried on. In wave 9, #13's Builder got exit 10 on its helper and halted the run. *Open.*

**18. One lane's missing helper stops lanes that don't need it.** The wave's `halted` flag covers every card. In wave 9, #8 and #11 each finished a lane and stopped before the next one, because of #13's helper. *Open.*

**19. A halted wave reports the wrong column.** `super-board-wave.js:193` returns the stale `card.status`, so the wave's result gave #8 and #11 as `Ready` when they were in Review and QA. It's the same class of bug as finding 1. *Open.*

## Lanes sharing a machine

**4. Lanes share the session scratchpad.** A QA lane's `notes/*.json` glob picked up 20 drafts left by an earlier lane and posted them as duplicate author notes on PR #24. With parallel cards, one card's drafts could land on another card's PR. *Patched in the prompts only, in PR #25, which gives each lane its own temp folder. A lane in wave 9 still wrote one file directly in the shared folder, so a per-lane `TMPDIR` would be stronger.*

**5. A broad `pkill` can hit other lanes' servers.** A QA lane ran `pkill -f "vite preview" --oldest`, which matches any lane's preview server. It probably hit that lane's own mutation run, and it reran the mutant. *Patched in the prompts only, in PR #25.*

**11. A lane left a server running.** A `vite preview` started from `.claude/worktrees/issue-6-build` kept running after that worktree was removed. PR #25's process rule covers stopping broadly, not cleaning up. *Open.*

**15. Parallel cards conflict on `package-lock.json`.** #13 passed review, then lost the merge to #9, which landed during that review, and that costs a further lane. The merge gate caught it correctly with exit 5, but the planner doesn't consider two cards that both add dependencies. *Open.*

## Handoffs and resuming

**6. A halted lane leaves no handoff.** The next QA lane starts from the Tester lifecycle's first step, even when the halted lane had pushed its evidence. A hand-written handoff can make this worse: ours named 20 duplicate notes, and the next lane went to inspect them and ran the probe in finding 7. A handoff needs to say what to leave alone. *Open.*

**10. A wave stopped at the usage limit stays idle after the limit clears.** Both lanes hit the 5-hour limit and went idle at 12:26, and were still idle at 13:40 with the readings back near 0%. It took a manual stop and a `resumeFromRunId`. Lanes lose their context on resume, so uncommitted work relies on the next lane noticing it. The usage check runs between waves, so it doesn't catch this. This may be the host rather than super-board. *Open.*

**12. The host's permission check can refuse a required step.** On PR #30, a QA lane's batch of 23 author notes was refused. It said so in its result and on the PR, and the next Builder posted them. *Open, and it recovered by itself.*

## Review and merge

**14. The truth gate's readers aren't independent on the workflow backend.** Every Reviewer reports that Code-grounder, Historian and both code-review axes ran inline, because lanes have no sub-agent tool, so each score is one reader's. #8's 75 sits close to the threshold of 70, below which the card goes to Blocked. *Open.*

**16. A Reviewer can merge with an AC partly unmet.** PR #33's R1 is an exception to AC1, disclosed and marked for the product owner to decide. The merge went ahead with no ticket, so the decision lives only in a comment on a merged PR. *Open.*

**9. A non-blocking Reviewer note has no home.** Notes on PRs #24, #27, #30 and #33 exist only as comments, so later builders can't see them. One became an `AGENTS.md` rule only because a person moved it (PR #29). A Backlog issue for each note, or a list the Builder reads, would fix this. *Open.*

**13. A Reviewer deleted a local branch ref by mistake.** It restored the ref to the same commit as origin and reported it. No harm done. *Open.*

## Prompts, scope and setup

**1. QA gets a wrong prompt line after Build.** `super-board-wave.js:156` checked `card.status` after Build, when it still reads `Ready`, so QA on every built card was told it's labelled `qa` and should create a branch from base. The first QA agent noticed and ignored it. *Patched in PR #25.*

**20. A Builder called a live API its card didn't mention.** #11's Builder ran one real `data:build` against the Hungary extract and the live Wikipedia API, though #10's card says only the recording and #12's deploy reach that API. No rule forbids it, and it gave the first real numbers: nine central cells came to 287 KB gzipped, against the spec's "tens of KB". *Open.*

**24. Pre-flight's conflict check depends on the file list the agent passes.** In wave 9, a broad `--files` list made the script report #11 and #13 as conflicting with #8's PR. The agent judged that false and proceeded, so an agent's reasoning overrode the script's verdict. *Open.*

**22. The lane skills don't say that `auto_max_lines: 0` turns the size cap off.** The config schema and `super-board-merge-policy.py` do, but `super-build/SKILL.md:251`, `run.md:317` and `lint.md:149` only describe a default of 400 changed lines. We set 0 and added a rule to `AGENTS.md` (PR #22), so no lane would hold a card for size. None has. *Worked around.*

**23. The usage check is blind without a status line.** `super-board-usage.sh check` had no reading until we added a status line that records plan usage (PR #23). *Worked around.*
