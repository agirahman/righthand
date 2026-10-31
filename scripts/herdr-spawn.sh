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
  WT_PATH="wt/$SLUG"
  BRANCH="$SLUG"

  if [[ ! -d "$WT_PATH" ]]; then
    echo "==> Setting up isolated worktree at '$WT_PATH' (branch: $BRANCH)..."
    git worktree add "$WT_PATH" -b "$BRANCH"
  else
    echo "==> Worktree '$WT_PATH' already exists."
  fi
  WORKDIR="$WT_PATH"
fi

echo "==> Creating Herdr tab in workspace '$WORKSPACE' with label '$LABEL'..."
herdr tab create --workspace "$WORKSPACE" --label "$LABEL"

echo "==> Success! In the new tab, run:"
echo "    cd $WORKDIR && cmdc --mod-option default=$ROLE"
