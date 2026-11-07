# Pre-flight: Kilátó MVP

`/super-board lint` checked these on 2026-11-03, for the Ready cards #5–#21 and `PROJECT.md`. Each `[ ]` stops `/super-board run` until it's done.

## 🔑 Credentials

- [✓] None needed. Kilátó has no API keys, and `deploy.yml` uses the workflow's own token (#12).

## 🛠 Tools

- [✓] gh is signed in as `kornel-schrenk-bot`, with the `repo`, `project` and `workflow` scopes. The `workflow` scope lets it push `ci.yml` (#5) and `deploy.yml` (#12).
- [✓] Node 24.22.2 and npm 11.19.1.
- [✓] jq.
- [✓] Playwright's own Chromium starts on the Pi (Playwright 1.64.1, Chromium 156.0.8078.4), so `CHROMIUM_PATH` isn't needed. If #5 pins another Playwright version, run `npx playwright install chromium` for it.

## 🌐 Environment

- [✓] `develop` exists, and the board has all seven columns.
- [✓] The Wikipedia API answers (HTTP 200). Only `npm run record:wikipedia` (#10) calls it from here.

## Not gates

- `osmium-tool` runs only on GitHub Actions (#12), so the Pi doesn't need it.
- GitHub Pages isn't set up yet. The product owner sets it to deploy from GitHub Actions before the first promotion to `main`.
- After a reboot, unlock the keyring before starting a run.
- The robot's token expires around 2026-12-03.
