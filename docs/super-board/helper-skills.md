# Helper skills installed by hand

super-board's Builder and QA lanes ask for these two skills when they write tests. Its setup doesn't install them, and asking for a missing one halts the run ([findings 21 and 25](findings.md)). Both are copied unchanged from the commits below.

| Skill | Source | Commit | Based on |
|---|---|---|---|
| `vitest` | [`antfu/skills`, `skills/vitest`](https://github.com/antfu/skills/tree/7de210b51c8d48cc405a4eac3e17cbb1396c653b/skills/vitest) | `7de210b` | Vitest 5.1.0-beta.1, generated on 2026-10-23 |
| `playwright-best-practices` | [`currents-dev/playwright-best-practices-skill`, `playwright-best-practices`](https://github.com/currents-dev/playwright-best-practices-skill/tree/283d5cbc5d11aac1abda058b16ad22c317d54dc0/playwright-best-practices) | `283d5cb` | its version 1.2 |

To update one, copy its folder from a newer commit into `.claude/skills/`, then update its row here and its `computedHash` in `skills-lock.json`. The hash is SHA-256 over each file's relative path and content, with files sorted by path, ignoring case. This reproduces all 43 entries in the lock.

## Licences

Both skills are under the MIT licence.

`vitest`:

> Copyright (c) 2025-PRESENT Anthony Fu <https://github.com/antfu>

`playwright-best-practices`:

> Copyright © 2026 Currents Software Inc.

Both notices carry the same terms:

> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
