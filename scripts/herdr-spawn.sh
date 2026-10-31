#!/usr/bin/env bash
# Helper script to spawn an agent tab in Herdr workspace with RightHand persona.
# Usage: ./scripts/herdr-spawn.sh <workspace> <role> [ticket] [description]
# Example: ./scripts/herdr-spawn.sh w1 backend T1 auth-api

set -euo pipefail

WORKSPACE="${1:-}"
ROLE="${2:-}"
TICKET="${3:-}"
DESC="${4:-}"

if [[ -z "$WORKSPACE" || -z "$ROLE" ]]; then
  echo "Usage: $0 <workspace> <role> [ticket] [description]"
  echo "Example: $0 w1 backend T1 auth-api"
  exit 1
fi

LABEL="$ROLE"
if [[ -n "$TICKET" ]]; then
  LABEL="$ROLE-$TICKET"
fi

WRITER_ROLES=("backend" "frontend" "devops" "worker")
IS_WRITER=false

for r in "${WRITER_ROLES[@]}"; do
  if [[ "${ROLE,,}" == "$r" ]]; then
    IS_WRITER=true
    break
  fi
done

WORKDIR="."

if [[ "$IS_WRITER" == true && -n "$TICKET" ]]; then
  SLUG="$TICKET-$ROLE"
  if [[ -n "$DESC" ]]; then
    SLUG="$TICKET-$DESC"
  fi
  BRANCH="$SLUG"
  MAIN_CHECKOUT="$(pwd)"
  BASE="main"
  DETECTED="$(git -C "$MAIN_CHECKOUT" symbolic-ref refs/remotes/origin/HEAD 2>/dev/null || true)"
  if [[ -n "$DETECTED" ]]; then
    BASE="${DETECTED#refs/remotes/origin/}"
  fi
  if [[ -z "$BASE" ]]; then
    BASE="main"
  fi

  echo "==> Creating Herdr lane (branch: $BRANCH, base: $BASE)..."
  JSON_OUTPUT="$(herdr worktree create --cwd "$MAIN_CHECKOUT" --branch "$BRANCH" --base "$BASE" --label "$LABEL" --no-focus)"
  LANE_PATH="$(printf '%s' "$JSON_OUTPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.worktree.path)})")"
  if [[ -z "$LANE_PATH" ]]; then
    echo "Herdr did not return a worktree path." >&2
    exit 1
  fi
  WORKDIR="$LANE_PATH"
fi

echo "==> Creating Herdr tab in workspace '$WORKSPACE' with label '$LABEL'..."
herdr tab create --workspace "$WORKSPACE" --label "$LABEL"

echo "==> Success! In the new tab, run:"
echo "    cd $WORKDIR && cmdc --mod-option default=$ROLE"
