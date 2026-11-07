#!/usr/bin/env bash
# super-board-pr-body.sh — rewrite ONE marker block of a PR body, idempotently.
#
# The PR body is a set of marker blocks (writing-standard.md § 2). Each lane owns
# some of them. Rewriting the whole body from memory clobbers the blocks another
# lane wrote since you read it; this script touches only the block you name.
#
#   super-board-pr-body.sh --pr <N> --block <name> --expect-head <sha> \
#                          (--body-file <md> | --append-file <md>) [--repo o/r] [--dry-run]
#   super-board-pr-body.sh --skeleton          # empty body with every marker, in order (history folded)
#   super-board-pr-body.sh --time [--config <cfg.json>]   # "Oct 2, 10:02 EDT" in config timezone
#
# Blocks, in body order: redcheck status problem solution ac history visual risk.
# A block that is missing is inserted at its place in that order.
#
# --body-file    replaces the block's content.
# --append-file  appends lines inside the block (history rows), above a closing </details>.
# --expect-head  the PR head you based this edit on. The script refuses (exit 6) when
#                the PR head is no longer that commit: the block would describe code
#                that is not the code on the PR. Required unless --dry-run.
# --dry-run      prints the new body on stdout, edits nothing.
#
# Same content twice is a no-op ("unchanged"), so a retried lane exit is safe.
#
# A failed PATCH often never reached GitHub, so the script waits, reads the body back
# and, if it is untouched, tries once more (local patch: docs/super-board/local-patches.md).
#
# Exits: 0 ok (stdout: updated | unchanged | the body on --dry-run)
#        6 PR head moved · 64 usage · 66 unreadable file · 70 gh failure
#        79 halted: the edit failed twice, or the read-back can't account for it
set -uo pipefail

BLOCKS="redcheck status problem solution ac history visual risk"
die() { echo "pr-body: $1" >&2; exit "$2"; }

PR=""; BLOCK=""; HEAD=""; BODY_FILE=""; APPEND_FILE=""; REPO=""; DRY=0; MODE="edit"; CONFIG=""
while [ $# -gt 0 ]; do
  case "$1" in
    --pr)          PR="$2"; shift 2 ;;
    --block)       BLOCK="$2"; shift 2 ;;
    --expect-head) HEAD="$2"; shift 2 ;;
    --body-file)   BODY_FILE="$2"; shift 2 ;;
    --append-file) APPEND_FILE="$2"; shift 2 ;;
    --repo)        REPO="$2"; shift 2 ;;
    --config)      CONFIG="$2"; shift 2 ;;
    --dry-run)     DRY=1; shift ;;
    --skeleton)    MODE="skeleton"; shift ;;
    --time)        MODE="time"; shift ;;
    *) die "unknown arg: $1" 64 ;;
  esac
done

if [ "$MODE" = "skeleton" ]; then
  for b in $BLOCKS; do
    [ "$b" = redcheck ] && continue   # only when a check was red
    if [ "$b" = history ]; then       # folded; --append-file keeps rows inside
      printf '<!-- sb:history -->\n<details><summary>Iteration history</summary>\n\n| Lane | Done | Time | Details |\n|---|---|---|---|\n\n</details>\n<!-- /sb:history -->\n\n'
      continue
    fi
    printf '<!-- sb:%s -->\n<!-- /sb:%s -->\n\n' "$b" "$b"
  done
  exit 0
fi

if [ "$MODE" = "time" ]; then
  TZV=""
  [ -n "$CONFIG" ] && [ -r "$CONFIG" ] && TZV=$(jq -r '.timezone // empty' "$CONFIG" 2>/dev/null)
  if [ -n "$TZV" ]; then TZ="$TZV" date '+%b %e, %H:%M %Z' | sed 's/  */ /g'
  else date '+%b %e, %H:%M %Z' | sed 's/  */ /g'; fi
  exit 0
fi

[ -n "$PR" ] || die "--pr is required" 64
case " $BLOCKS " in *" $BLOCK "*) ;; *) die "--block must be one of: $BLOCKS (got: ${BLOCK:-<unset>})" 64 ;; esac
if [ -n "$BODY_FILE" ] && [ -n "$APPEND_FILE" ]; then die "use --body-file or --append-file, not both" 64; fi
SRC="${BODY_FILE:-$APPEND_FILE}"
[ -n "$SRC" ] || die "--body-file or --append-file is required" 64
[ -r "$SRC" ] || die "cannot read $SRC" 66
[ "$DRY" -eq 1 ] || [ -n "$HEAD" ] || die "--expect-head <sha> is required (the PR head your edit is based on)" 64

GITHUB_READ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/super-board-github-read.py"
# REST, not `gh pr view`/`gh pr edit`: this script runs ~3 times per lane per
# card, and the REST core bucket is separate from the GraphQL one the board
# lives on. GH_REPO fills {owner}/{repo}; unset, gh uses the current checkout.
export GH_REPO="${REPO:-${GH_REPO:-}}"; [ -n "$GH_REPO" ] || unset GH_REPO
read_meta() { python3 "$GITHUB_READ" --kind body -- api "repos/{owner}/{repo}/pulls/$PR" --jq '{headRefOid: .head.sha, body: (.body // "")}'; }
check_head() {
  [ -n "$HEAD" ] || return 0
  # Short or full sha both work: the PR head must start with what you passed.
  local now
  now=$(printf '%s' "$META" | jq -r '.headRefOid // empty')
  case "$now" in
    "") die "cannot read the head of PR #$PR" 70 ;;
    "$HEAD"*) ;;
    *) echo "pr-body: PR #$PR head is $now, not $HEAD — re-read the PR and redo the edit" >&2
       exit 6 ;;
  esac
}
META=$(read_meta) || exit $?
check_head

OLD_TMP=$(mktemp); NEW_TMP=$(mktemp); BACK_TMP=$(mktemp); ERR_TMP=$(mktemp)
trap 'rm -f "$OLD_TMP" "$NEW_TMP" "$BACK_TMP" "$ERR_TMP"' EXIT
printf '%s' "$META" | jq -r '.body // ""' > "$OLD_TMP"

MODE_FLAG=replace; [ -n "$APPEND_FILE" ] && MODE_FLAG=append
python3 - "$OLD_TMP" "$SRC" "$BLOCK" "$MODE_FLAG" "$BLOCKS" > "$NEW_TMP" <<'PY' || die "could not splice the block" 70
import sys
old_path, src_path, block, mode, order = sys.argv[1:6]
order = order.split()
body = open(old_path, encoding="utf-8").read()
content = open(src_path, encoding="utf-8").read().strip("\n")
open_m, close_m = f"<!-- sb:{block} -->", f"<!-- /sb:{block} -->"

def find(name, text):
    o, c = f"<!-- sb:{name} -->", f"<!-- /sb:{name} -->"
    i = text.find(o)
    if i < 0:
        return None
    j = text.find(c, i)
    return None if j < 0 else (i, j + len(c))

span = find(block, body)
if span:
    inner = body[span[0] + len(open_m):span[1] - len(close_m)].strip("\n")
    if mode == "append":
        lines = inner.split("\n") if inner else []
        # A folded block keeps its rows inside the fold, above </details>
        # (and above the blank line GitHub needs before it).
        tail = []
        if lines and lines[-1].strip() == "</details>":
            tail = [lines.pop()]
            while lines and not lines[-1].strip():
                tail.insert(0, lines.pop())
        # Idempotent append: a row already present is not added twice.
        for l in content.split("\n"):
            if l.strip() and l in lines:
                continue
            lines.append(l)
        inner = "\n".join(lines + tail).strip("\n")
    else:
        inner = content
    out = body[:span[0]] + f"{open_m}\n{inner}\n{close_m}" + body[span[1]:]
else:
    new_block = f"{open_m}\n{content}\n{close_m}"
    idx = order.index(block)
    # Insert before the first later block that exists; else after the last earlier one; else at the end.
    pos = None
    for later in order[idx + 1:]:
        s = find(later, body)
        if s:
            pos = s[0]
            out = body[:pos] + new_block + "\n\n" + body[pos:]
            break
    if pos is None:
        for earlier in reversed(order[:idx]):
            s = find(earlier, body)
            if s:
                pos = s[1]
                out = body[:pos] + "\n\n" + new_block + body[pos:]
                break
    if pos is None:
        out = (body.rstrip("\n") + "\n\n" if body.strip() else "") + new_block + "\n"
sys.stdout.write(out)
PY

if [ "$DRY" -eq 1 ]; then cat "$NEW_TMP"; exit 0; fi
# $(…) drops trailing newlines, which GitHub does not keep either.
if [ "$(cat "$OLD_TMP")" = "$(cat "$NEW_TMP")" ]; then echo unchanged; exit 0; fi
python3 "$GITHUB_READ" --check || exit $?

patch_body() {
  jq -n --rawfile b "$NEW_TMP" '{body: $b}' | gh api -X PATCH "repos/{owner}/{repo}/pulls/$PR" --input - >/dev/null 2>"$ERR_TMP"
}
halt_body() {
  python3 "$GITHUB_READ" --halt "$1; gh said: $(head -n 1 "$ERR_TMP" | cut -c1-200)"
  exit 79
}
same_body() { [ "$(cat "$1")" = "$(cat "$2")" ]; }

for attempt in 1 2; do
  patch_body && { echo updated; exit 0; }
  # Wait out the blip first: a read-back that fails during it would halt the run by itself.
  sleep 5
  META=$(read_meta) || halt_body "PR body update outcome unknown for #$PR, and the read-back failed"
  printf '%s' "$META" | jq -r '.body // ""' > "$BACK_TMP"
  same_body "$BACK_TMP" "$NEW_TMP" && { echo updated; exit 0; }
  same_body "$BACK_TMP" "$OLD_TMP" || halt_body "PR #$PR body changed while updating it; read the body before retrying"
  check_head
  echo "pr-body: PATCH of #$PR failed, body unchanged (attempt $attempt of 2): $(head -n 1 "$ERR_TMP" | cut -c1-200)" >&2
done
halt_body "PR body update failed twice for #$PR, and the body is unchanged"
