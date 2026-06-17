#!/usr/bin/env bash
# PreToolUse guardrail (Bash): enforces this repo's git workflow rules on the agent.
#   1. Merges must be fast-forward only — block --no-ff / --squash.
#   2. `main` is read-only while a linked worktree is open — block a direct commit/merge
#      onto main in that state (the prescribed integration is `git merge --ff-only <branch>`).
#
# Reads the PreToolUse JSON event on stdin. Exit 2 = block (stderr is shown to Claude);
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

block() {
  printf 'BLOCKED by .claude/hooks/guard-git-workflow.sh\n\n%s\n\nRule: %s\n' "$1" "$2" >&2
  exit 2
}

# Only inspect git commands.
printf '%s' "$norm" | grep -Eq '(^|[;&| ])git( |$)' || exit 0

# Rule 1 — fast-forward-only merges.
if printf '%s' "$norm" | grep -Eq '\bmerge\b' \
   && printf '%s' "$norm" | grep -Eq -- '--no-ff|--squash'; then
  block "git merge with --no-ff or --squash is not allowed." \
        "Rebase onto main, then 'git merge --ff-only <branch>' for linear history."
fi

# Rule 2 — main is read-only while a worktree is open.
worktrees="$(git worktree list 2>/dev/null | wc -l | tr -d ' ')"
branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
if [ "${worktrees:-1}" -gt 1 ] && [ "$branch" = "main" ]; then
  if printf '%s' "$norm" | grep -Eq '\b(commit|merge)\b' \
     && ! printf '%s' "$norm" | grep -Eq -- '--ff-only'; then
    block "Direct commit/merge onto 'main' while a worktree is open." \
          "main is read-only while any worktree exists; integrate only via 'git merge --ff-only <branch>'."
  fi
fi

exit 0
