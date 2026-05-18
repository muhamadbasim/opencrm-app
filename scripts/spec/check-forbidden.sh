#!/usr/bin/env bash
# check-forbidden.sh
#
# Guardrail for OpenCRM rebuild spec — Requirement 6.1/6.2 (Forbidden Commands).
#
# Blocks lint/build/test/dev/start/smoke commands while gate 4 (source parity)
# is not yet complete. Once gate 4 has been recorded, set
# OPENCRM_GATE_PASSED=4 (or higher) to allow forbidden commands.
#
# Usage:
#   scripts/spec/check-forbidden.sh <command> [<arg> ...]
#
# The first argument is the executable, the rest are its arguments. The
# script does NOT execute the command — it only inspects whether the command
# would be a forbidden one and exits accordingly.
#
# Examples:
#   scripts/spec/check-forbidden.sh bun run lint            # exit 1 (forbidden)
#   scripts/spec/check-forbidden.sh bun install             # exit 0 (allowed)
#   OPENCRM_GATE_PASSED=4 scripts/spec/check-forbidden.sh bun run lint  # exit 0
#
# Exit codes:
#   0  command is allowed at the current gate
#   1  command is forbidden at the current gate, or input is invalid

set -euo pipefail

# Required gate threshold to unlock forbidden commands.
REQUIRED_GATE=4
CURRENT_GATE="${OPENCRM_GATE_PASSED:-0}"

if [[ $# -lt 1 ]]; then
  echo "check-forbidden: error — provide the command to inspect" >&2
  echo "usage: $(basename "$0") <command> [<arg> ...]" >&2
  exit 1
fi

# Validate that CURRENT_GATE is an integer.
if ! [[ "$CURRENT_GATE" =~ ^[0-9]+$ ]]; then
  echo "check-forbidden: error — OPENCRM_GATE_PASSED must be an integer (got: $CURRENT_GATE)" >&2
  exit 1
fi

cmd="$1"
shift || true
args_joined="$*"
full_cmd="$cmd${args_joined:+ }$args_joined"

# Forbidden patterns derived from requirements.md Requirement 6.1 and
# design.md section 9. Each pattern is matched as a POSIX extended regex
# against the FULL command line ($full_cmd).
forbidden_patterns=(
  # bun run lint / bun run lint:*
  '^bun[[:space:]]+run[[:space:]]+lint(:[A-Za-z0-9_:-]+)?([[:space:]]|$)'
  # bunx biome ... (biome subcommands trigger lint/format)
  '^bunx[[:space:]]+biome([[:space:]]|$)'
  # tsc --noEmit (and bun run tsc --noEmit, bun x tsc --noEmit)
  '(^|[[:space:]])tsc([[:space:]]+[^[:space:]]+)*[[:space:]]+--noEmit([[:space:]]|$)'
  # bun run build:* (e.g., build:backend, build:frontend)
  '^bun[[:space:]]+run[[:space:]]+build(:[A-Za-z0-9_:-]+)?([[:space:]]|$)'
  # vite build
  '(^|[[:space:]])vite[[:space:]]+build([[:space:]]|$)'
  # bun test (runner) — keep before "bun run test"
  '^bun[[:space:]]+test([[:space:]]|$)'
  # bun run test / bun run test:*
  '^bun[[:space:]]+run[[:space:]]+test(:[A-Za-z0-9_:-]+)?([[:space:]]|$)'
  # bun run dev:* / bun run dev
  '^bun[[:space:]]+run[[:space:]]+dev(:[A-Za-z0-9_:-]+)?([[:space:]]|$)'
  # bun run start:* / bun run start
  '^bun[[:space:]]+run[[:space:]]+start(:[A-Za-z0-9_:-]+)?([[:space:]]|$)'
  # ./run-backend.sh / run-backend.sh
  '(^|[[:space:]])(\./)?run-backend\.sh([[:space:]]|$)'
  # ./run-frontend.sh / run-frontend.sh
  '(^|[[:space:]])(\./)?run-frontend\.sh([[:space:]]|$)'
  # browser smoke test (heuristic match for headless browser smoke entry points)
  '(^|[[:space:]])(playwright|puppeteer|chromium|chrome-headless|cypress)([[:space:]]|$)'
)

is_forbidden=0
matched_pattern=""
for pat in "${forbidden_patterns[@]}"; do
  if [[ "$full_cmd" =~ $pat ]]; then
    is_forbidden=1
    matched_pattern="$pat"
    break
  fi
done

if (( is_forbidden == 0 )); then
  exit 0
fi

if (( CURRENT_GATE >= REQUIRED_GATE )); then
  # Forbidden command but gate threshold reached — allowed.
  exit 0
fi

cat >&2 <<EOF
check-forbidden: violation — command is forbidden until gate ${REQUIRED_GATE} (source parity) is complete
  command:        ${full_cmd}
  matched rule:   ${matched_pattern}
  current gate:   ${CURRENT_GATE} (need >= ${REQUIRED_GATE})
  reference:      requirements.md Requirement 6.1, design.md section 9
  unblock:        finish gate 4 (parity), then export OPENCRM_GATE_PASSED=4
EOF
exit 1
