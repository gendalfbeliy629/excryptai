#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${1:-$PWD}"
BRANCH_NAME="${2:-feature/opencode-$(date +%Y%m%d-%H%M%S)}"

cd "$ROOT_DIR"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required"
  exit 1
fi

if ! command -v opencode >/dev/null 2>&1; then
  echo "opencode is not installed"
  exit 1
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

echo "Current branch: $CURRENT_BRANCH"
if [[ "$CURRENT_BRANCH" == "main" || "$CURRENT_BRANCH" == "master" ]]; then
  git checkout -b "$BRANCH_NAME"
  echo "Created and switched to $BRANCH_NAME"
fi

echo "Starting OpenCode in: $(pwd)"
echo "Recommended flow: /init -> use plan -> use build after approval"

exec opencode
