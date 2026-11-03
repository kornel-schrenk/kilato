#!/usr/bin/env bash
# Status line for this repo: shows plan usage and records it for super-board's usage guard.
# Claude Code pipes session JSON to stdin. `rate_limits` appears only for subscribers,
# and only after the session's first response, so the line can be blank at the start.
input=$(cat)
printf '%s' "$input" | bash "$(dirname "$0")/bin/super-board-usage.sh" record || true
printf '%s' "$input" | jq -r '
  [ (.rate_limits.five_hour.used_percentage // empty | "5h \(floor)%"),
    (.rate_limits.seven_day.used_percentage // empty | "7d \(floor)%") ]
  | join(" · ")'
