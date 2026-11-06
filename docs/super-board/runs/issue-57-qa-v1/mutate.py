#!/usr/bin/env python3
"""QA's mutants for #57. Each breaks one line, rebuilds, runs the tests that should catch it, and restores
the file byte for byte. Nothing here reaches a commit.

Run from the worktree root: CHROMIUM_PATH=/usr/bin/chromium python3 mutate.py <results file> [names...]
"""
import os
import re
import subprocess
import sys
from pathlib import Path

PANEL = "src/ui/Panel.tsx"
HTML = "index.html"
SUITE = "Software used|About on a phone"

# name, file, old, new, tests to run, the test that has to go red
MUTANTS = [
    ("AC1 the English heading changes", "src/i18n/en.ts", "softwareUsed: 'Software used'", "softwareUsed: 'Software'", SUITE, "has its heading"),
    ("AC1 the Hungarian heading changes", "src/i18n/hu.ts", "softwareUsed: 'Felhasznált szoftverek'", "softwareUsed: 'Felhasznált szoftver'", SUITE, "has its heading"),
    ("AC1 the heading is not a heading", PANEL, "<h3>{t.softwareUsed}</h3>", "<p>{t.softwareUsed}</p>", SUITE, "has its heading"),
    ("AC1 the entries start open", PANEL, "<details key={title}>", "<details key={title} open>", SUITE, "has its heading"),
    ("AC1 the entry names change", PANEL, "title: 'Leaflet'", "title: 'Leaflet.js'", SUITE, "has its heading"),
    ("AC1 Close is pushed out of view", HTML, ".panel h3 {\n        margin-bottom: 0;", ".panel h3 {\n        margin-bottom: 400px;", SUITE, "Close is in view"),
    ("AC2 the two licences swap", PANEL, "{ title: 'Leaflet', licence: leafletLicence }", "{ title: 'Leaflet', licence: preactLicence }", SUITE, "LICENSE file"),
    ("AC2 one word changes in Leaflet's", PANEL, "<pre lang=\"en\">{licence}</pre>", "<pre lang=\"en\">{licence.replace('Agafonkin', 'Agafonkyn')}</pre>", SUITE, "leaflet entry"),
    ("AC2 one word changes in Preact's", PANEL, "<pre lang=\"en\">{licence}</pre>", "<pre lang=\"en\">{licence.replace('Jason Miller', 'Jason Muller')}</pre>", SUITE, "preact entry"),
    ("AC2 the text stops early", PANEL, "<pre lang=\"en\">{licence}</pre>", "<pre lang=\"en\">{licence.slice(0, 400)}</pre>", SUITE, "LICENSE file"),
    ("AC2 words are added after the text", PANEL, "<pre lang=\"en\">{licence}</pre>", "<pre lang=\"en\">{licence} More</pre>", SUITE, "LICENSE file"),
    ("AC2 the text is not marked English", PANEL, "<pre lang=\"en\">{licence}</pre>", "<pre>{licence}</pre>", SUITE, "LICENSE file"),
    ("AC2 the text stays hidden when open", HTML, ".panel pre {\n        margin: 0 0 0.75rem;", ".panel pre {\n        display: none;\n        margin: 0 0 0.75rem;", SUITE, "LICENSE file"),
    ("AC3 Preact has no entry", PANEL, "  { title: 'Preact', licence: preactLicence },\n", "", SUITE, "every package in dependencies"),
    ("AC3 dependencies gains a package with no entry", "package.json", "\"leaflet\": \"^1.9.4\",", "\"leaflet\": \"^1.9.4\",\n    \"qa-fake-package\": \"^1.0.0\",", SUITE, "every package in dependencies"),
    ("risk: opening an entry sends a request", PANEL, "<details key={title}>", "<details key={title} onToggle={() => void fetch('https://example.com/qa')}>", SUITE, "asks for nothing"),
    ("polish: an entry is shorter than 44 px", HTML, ".panel summary {\n        line-height: 44px;", ".panel summary {\n        line-height: 20px;", SUITE, "44 px tall"),
    ("polish: the text no longer wraps", HTML, "white-space: pre-wrap;", "white-space: pre;", SUITE, "nothing scrolls sideways"),
    ("gap: the text loses its line breaks", HTML, "white-space: pre-wrap;", "white-space: normal;", SUITE, "LICENSE file"),
]


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, env=os.environ)


def build():
    return run(["npx", "vite", "build"])


def main():
    results = Path(sys.argv[1])
    only = sys.argv[2:]
    lines = []
    for name, file, old, new, grep, must_fail in MUTANTS:
        if only and name not in only:
            continue
        path = Path(file)
        pristine = path.read_bytes()
        text = pristine.decode()
        if text.count(old) != 1:
            lines.append(f"BAD MUTANT   {name}: the text is in {file} {text.count(old)} times")
            results.write_text("\n".join(lines) + "\n")
            continue
        try:
            path.write_text(text.replace(old, new))
            built = build()
            if built.returncode != 0:
                lines.append(f"BUILD FAILED {name}")
                continue
            page = run(["npx", "playwright", "test", "e2e/footer.spec.ts", "-g", grep, "--reporter=line"])
            output = page.stdout + page.stderr
            # Only the numbered failure lines: the reporter also prints every test's title as it starts.
            failed = sorted({line.strip() for line in output.splitlines() if re.match(r"\s+\d+\) e2e/footer\.spec\.ts", line)})
            names = [re.sub(r"\s*─+$", "", line.split("›", 1)[1]).strip() for line in failed]
            caught = any(must_fail in failed_name for failed_name in names)
            status = "RED" if caught else ("RED-OTHER" if page.returncode != 0 else "SURVIVED")
            hit = f"expected red: {must_fail}"
            lines.append(f"{status:9} {name} · {hit} · {len(names)} failing")
            for failed_name in names[:6]:
                lines.append(f"            {failed_name}")
        finally:
            path.write_bytes(pristine)
            results.write_text("\n".join(lines) + "\n")
    built = build()
    lines.append(f"restored and rebuilt, vite build exit={built.returncode}")
    results.write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
