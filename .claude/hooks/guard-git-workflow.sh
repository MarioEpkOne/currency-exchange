#!/usr/bin/env bash
# PreToolUse guardrail (Bash) for solo, agent-driven development.
#
# A quality gate is only a gate if it can't be skipped. This blocks the agent from
# bypassing the local Husky gate (lint, format, commit-msg, typecheck) with
# `git ... --no-verify`. Everything else is allowed — there is no branch/merge/worktree
# ceremony in this solo repo (commit straight to main).
#
# Reads the PreToolUse JSON event on stdin. Exit 2 = block (stderr shown to Claude);
# exit 0 = allow. Fail-open: if anything is unparseable, allow.

input="$(cat)"

# --- extract the bash command from the event JSON (jq, then python3, else give up) ---
cmd=""
if command -v jq >/dev/null 2>&1; then
  cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)"
elif command -v python3 >/dev/null 2>&1; then
  cmd="$(printf '%s' "$input" | python3 -c 'import sys, json
try:
    print(json.load(sys.stdin).get("tool_input", {}).get("command", ""))
except Exception:
    pass' 2>/dev/null)"
fi

# Nothing to inspect (empty command or no JSON parser available) → allow.
[ -z "$cmd" ] && exit 0

# Flatten newlines and line-continuations so multi-line commands match.
norm="$(printf '%s' "$cmd" | tr '\n\\' '  ')"

# Only inspect git commit / merge / push.
printf '%s' "$norm" | grep -Eq '(^|[;&| ])git( |$)' || exit 0
printf '%s' "$norm" | grep -Eq '\b(commit|merge|push)\b' || exit 0

# Block the gate-bypass flag.
if printf '%s' "$norm" | grep -Eq -- '--no-verify'; then
  printf 'BLOCKED by .claude/hooks/guard-git-workflow.sh\n\n%s\n\n%s\n' \
    '`--no-verify` would skip the Husky quality gate (lint, format, commit-msg, typecheck).' \
    'Fix what the gate reported instead of bypassing it.' >&2
  exit 2
fi

exit 0
