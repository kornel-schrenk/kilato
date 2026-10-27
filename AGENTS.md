# AGENTS.md

Kilátó, a pocket lookout tower: a web page that shows what is interesting near you, starting in Budapest. It is also a test. We build it to evaluate the [super-board](https://github.com/EricTechPro/super-board) software factory along Anthropic's [AI-native SDLC playbook](https://claude.com/resources/articles/the-ai-native-sdlc-playbook).

## How work flows

| Stage | Artifact | Written by | Accepted when |
|---|---|---|---|
| 01 Plan | `intent/<date>-<slug>.md` | Claude, in the product owner's words | the product owner merges its PR |
| 02 Design | `spec/<date>-<slug>.md` | Claude, from the accepted intent | the product owner merges its PR |
| 02 Design | GitHub issues in Backlog | Claude, from the accepted spec | the product owner moves them to Ready |
| 03 Build, 04 Test | one PR per issue | super-board | super-board's merge gate passes |

- Intents and specs carry a `Status:` line: `draft` while the PR is open, `accepted` after the merge.
- super-board builds exactly what an issue says. Nothing is built without an issue, and no issue asks for more than the accepted spec says.
- Kornel Schrenk is the product owner and the only GitHub account, so PRs can't get a second approval. The merge is the acceptance record.

## Where we are

Read the stage from the artifacts. The newest accepted artifact in the table above marks the last finished stage. For example, an accepted intent with no spec means Design is next.

## Conventions

- Commit and PR titles: `<emoji> [type] scope: subject`. Types: 📝 docs, ✨ feat, 🐛 fix, 🔧 chore, ♻️ refactor, 🧪 test.
- Product constraints (data sources, privacy, languages, licences) live in the accepted intent and spec. Read them there, and don't restate them here.
- There is no stack, build command or test command yet. Add them here when the first build issue sets them up.
