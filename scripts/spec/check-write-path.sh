#!/usr/bin/env bash
# check-write-path.sh
#
# Guardrail for OpenCRM rebuild spec — Requirement 1.2/1.3 (Workspace Separation).
#
# Verifies that the given write target paths are under $OPENCRM_APP.
# Exits 0 when every input path is inside $OPENCRM_APP; exits 1 (with a clear
# stderr message) on the first violation.
#
# Usage:
#   scripts/spec/check-write-path.sh <path> [<path> ...]
#
# Environment:
#   OPENCRM_APP                Required. Absolute path to the app workspace
#                              (default: /home/ubuntu/.openclaw/workspace/opencrm-app).
#   OPENCRM_BUILDER_CLASS      Optional. If set and any input path is under it,
#                              the violation message will name it explicitly.
#
# Exit codes:
#   0  every path is inside $OPENCRM_APP
#   1  at least one path is outside $OPENCRM_APP, or input is invalid

set -euo pipefail

DEFAULT_OPENCRM_APP="/home/ubuntu/.openclaw/workspace/opencrm-app"
OPENCRM_APP="${OPENCRM_APP:-$DEFAULT_OPENCRM_APP}"
OPENCRM_BUILDER_CLASS="${OPENCRM_BUILDER_CLASS:-/home/ubuntu/.openclaw/workspace/skills/opencrm-builder-class/opencrm-builder-class}"

if [[ $# -lt 1 ]]; then
  echo "check-write-path: error — at least one path argument is required" >&2
  echo "usage: $(basename "$0") <path> [<path> ...]" >&2
  exit 1
fi

# Canonicalize $OPENCRM_APP without requiring it to exist on disk (-m).
if ! APP_ROOT="$(realpath -m "$OPENCRM_APP" 2>/dev/null)"; then
  echo "check-write-path: error — failed to canonicalize OPENCRM_APP=$OPENCRM_APP" >&2
  exit 1
fi

# Strip a single trailing slash so prefix matching is unambiguous.
APP_ROOT="${APP_ROOT%/}"

violation=0
for raw in "$@"; do
  if [[ -z "$raw" ]]; then
    echo "check-write-path: error — empty path argument" >&2
    violation=1
    continue
  fi

  # Canonicalize the candidate path. -m tolerates non-existent paths so this
  # works for "about to be created" files as well.
  if ! candidate="$(realpath -m "$raw" 2>/dev/null)"; then
    echo "check-write-path: error — failed to canonicalize path: $raw" >&2
    violation=1
    continue
  fi

  candidate="${candidate%/}"

  if [[ "$candidate" == "$APP_ROOT" || "$candidate" == "$APP_ROOT"/* ]]; then
    continue
  fi

  echo "check-write-path: violation — write target is outside \$OPENCRM_APP" >&2
  echo "  input:        $raw" >&2
  echo "  resolved:     $candidate" >&2
  echo "  OPENCRM_APP:  $APP_ROOT" >&2
  if [[ -n "${OPENCRM_BUILDER_CLASS:-}" ]]; then
    builder_root="$(realpath -m "$OPENCRM_BUILDER_CLASS" 2>/dev/null || true)"
    builder_root="${builder_root%/}"
    if [[ -n "$builder_root" && ( "$candidate" == "$builder_root" || "$candidate" == "$builder_root"/* ) ]]; then
      echo "  note:         path is INSIDE \$OPENCRM_BUILDER_CLASS — builder class is read-only" >&2
    fi
  fi
  echo "  hint:         only write paths under \$OPENCRM_APP (Requirement 1.2)" >&2
  violation=1
done

if (( violation != 0 )); then
  exit 1
fi

exit 0
