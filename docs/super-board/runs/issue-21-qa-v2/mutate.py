#!/usr/bin/env python3
"""QA's mutants for #21, v1's list plus R2, R3 and the merge. Each breaks one line, runs the tests that should catch it, and restores
the file byte for byte. Nothing here reaches a commit.

Run from the worktree root: CHROMIUM_PATH=/usr/bin/chromium python3 mutate.py <results file>
"""
import os
import re
import subprocess
import sys
from pathlib import Path

UNIT = ["npx", "vitest", "run", "src/core/dataAge.test.ts"]
PAGE = ["npx", "playwright", "test", "e2e/footer.spec.ts", "--max-failures=1", "--reporter=line"]

# name, file, old, new, kind
MUTANTS = [
    ("older date becomes the newer", "src/core/dataAge.ts", "Math.min(", "Math.max(", "unit"),
    ("warning at exactly 10 days", "src/core/dataAge.ts", "elapsed > warnAfterDays", "elapsed >= warnAfterDays", "unit"),
    ("whole days round up", "src/core/dataAge.ts", "Math.floor(", "Math.round(", "unit"),
    ("a clock behind the data goes negative", "src/core/dataAge.ts", "Math.max(0, Math.floor(elapsed / dayMs))", "Math.floor(elapsed / dayMs)", "unit"),
    ("no warning look", "src/ui/Footer.tsx", "age.stale ? 'data-age data-age-warning' : 'data-age'", "'data-age'", "page"),
    ("no warning words", "src/ui/Footer.tsx", "{age.stale && ` · ${t.mayBeOutOfDate}`}", "", "page"),
    ("the line ignores the language", "src/ui/Footer.tsx", "formatDate(age.date, lang)", "formatDate(age.date, 'en')", "page"),
    ("the footer's About opens the other panel", "src/ui/Footer.tsx", "onOpen('about')", "onOpen('sentWhere')", "page"),
    ("the footer's sent-where link does nothing", "src/ui/Footer.tsx", "onClick={() => onOpen('sentWhere')}", "", "page"),
    ("no intro link", "src/ui/App.tsx", "<button type=\"button\" class=\"link\" onClick={() => setPanel('sentWhere')}>\n              {t.sentWhereTitle}\n            </button>", "", "page"),
    ("the intro link opens About", "src/ui/App.tsx", "class=\"link\" onClick={() => setPanel('sentWhere')}", "class=\"link\" onClick={() => setPanel('about')}", "page"),
    ("a word changes, English", "src/i18n/en.ts", "only to find and sort", "only to find and order", "page"),
    ("a word changes, Hungarian", "src/i18n/hu.ts", "csak arra használja", "csak ahhoz használja", "page"),
    ("a line loses its bold, English", "src/i18n/en.ts", "'**Wikipedia** gets", "'Wikipedia gets", "page"),
    ("a line loses its bold, Hungarian", "src/i18n/hu.ts", "'**A Wikipédia** csak", "'A Wikipédia csak", "page"),
    ("the bold takes a word more, English", "src/i18n/en.ts", "'**Your location** stays", "'**Your location stays** ", "page"),
    ("the last line goes, English", "src/i18n/en.ts", "    'No account, no cookies, no analytics. This browser remembers your language choice.',\n", "", "page"),
    ("the Hungarian title changes", "src/i18n/hu.ts", "sentWhereTitle: 'Mi hová kerül'", "sentWhereTitle: 'Mi hova kerül'", "page"),
    ("no modal: Esc and the focus go", "src/ui/Panel.tsx", "showModal()", "show()", "page"),
    ("the repository link goes elsewhere", "src/ui/Panel.tsx", "https://github.com/kornel-schrenk/kilato", "https://github.com/kornel-schrenk/kilato-old", "page"),
    ("About loses the MIT words, English", "src/i18n/en.ts", "under the MIT licence.", "under a licence.", "page"),
    ("About: map and place data becomes map data, English", "src/i18n/en.ts", "Map and place data are", "Map data are", "page"),
    ("About: place data goes, Hungarian", "src/i18n/hu.ts", "A térkép és a helyek adatai:", "A térkép adatai:", "page"),
    ("About: positions go, English", "src/i18n/en.ts", "Article titles and positions come", "Article titles come", "page"),
    ("About: positions go, Hungarian", "src/i18n/hu.ts", "címei és helyzete", "címei", "page"),
    ("About: CC BY-SA loses its version, English", "src/i18n/en.ts", "CC BY-SA 4.0", "CC BY-SA", "page"),
    ("About: Open Database License goes, Hungarian", "src/i18n/hu.ts", "Open Database License alatt", "nyílt licenc alatt", "page"),
    ("About: Leaflet goes, Hungarian", "src/i18n/hu.ts", "A térképet a Leaflet rajzolja.", "A térképet rajzoljuk.", "page"),
    ("About: drawn with goes, English", "src/i18n/en.ts", "The map is drawn with Leaflet.", "Thanks to Leaflet.", "page"),
    ("the footer stays in the left column on wide screens", "index.html", "main,\n        footer {\n          grid-column: 2;", "main {\n          grid-column: 2;", "page"),
    ("the map spans two rows, so the footer drops under it", "index.html", "grid-row: 1 / span 3;", "grid-row: 1 / span 2;", "page"),
    ("the Hungarian line changes", "src/i18n/hu.ts", "${days} napos", "${days} nap", "page"),
    ("the English singular goes", "src/i18n/en.ts", "${days === 1 ? 'day' : 'days'}", "days", "page"),
    # Added in v2: the Reviewer's R2 and R3, and the lines the merge of develop touched.
    ("R2: the warning look reads whole days", "src/ui/Footer.tsx", "age.stale ? 'data-age data-age-warning'", "age.days > 10 ? 'data-age data-age-warning'", "page"),
    ("R2: the warning words read whole days", "src/ui/Footer.tsx", "{age.stale && ", "{age.days > 10 && ", "page"),
    ("R3: the list's row doesn't take the spare height", "index.html", "grid-template: auto 1fr auto / 60% 40%;", "grid-template: auto auto auto / 60% 40%;", "page"),
    ("merge: usePlaces hands out no manifest", "src/ui/usePlaces.ts", "manifest: loader.manifest,", "manifest: null,", "page"),
    ("merge: the panel isn't rendered", "src/ui/App.tsx", "{panel && <Panel name={panel} onClose={() => setPanel(null)} t={t} />}", "", "page"),
    ("merge: closing leaves the panel state set", "src/ui/App.tsx", "onClose={() => setPanel(null)}", "onClose={() => {}}", "page"),
    ("merge: the footer's left out", "src/ui/App.tsx", "<Footer manifest={places.manifest} onOpen={setPanel} lang={lang} t={t} />", "", "page"),
]


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, env=os.environ)


def main():
    results = Path(sys.argv[1])
    only = sys.argv[2:]  # names of mutants to rerun
    lines = []
    for name, file, old, new, kind in MUTANTS:
        if only and name not in only:
            continue
        path = Path(file)
        pristine = path.read_bytes()
        text = pristine.decode()
        if text.count(old) < 1:
            lines.append(f"BAD MUTANT   {name}: the text isn't in {file}")
            results.write_text("\n".join(lines) + "\n")
            continue
        try:
            path.write_text(text.replace(old, new, 1))
            if kind == "page":
                build = run(["npm", "run", "build"])
                if build.returncode != 0:
                    lines.append(f"BUILD BROKE  {name} ({file}): {build.stdout[-200:]}")
                    continue
                outcome = run(PAGE)
            else:
                outcome = run(UNIT)
            verdict = "red" if outcome.returncode != 0 else "SURVIVED"
            plain = re.sub(r"\x1b\[[0-9;]*[A-Za-z]", "", outcome.stdout)
            killers = re.findall(r"^\s+\d+\) (e2e/.*)$", plain, re.M) or re.findall(r"^\s*FAIL\s+(.*)$", plain, re.M)
            lines.append(f"{verdict:12} {name} ({file}) :: {killers[0][:170] if killers else ''}")
        finally:
            path.write_bytes(pristine)
            results.write_text("\n".join(lines) + "\n")
    # Back to a build of the real code.
    run(["npm", "run", "build"])
    lines.append("restored; " + subprocess.run(["git", "status", "--short", "src", "index.html"], capture_output=True, text=True).stdout.strip())
    results.write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
