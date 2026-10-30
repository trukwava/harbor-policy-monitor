#!/usr/bin/env bash
# Safely publish this complete synthetic source tree to the user's existing public repository.
# Requires Git, rsync and GitHub push authentication configured on the operator's machine.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="https://github.com/trukwava/harbor-policy-monitor.git"
node "$ROOT/scripts/verify-package.mjs"
TEMP="$(mktemp -d)"
trap 'rm -rf "$TEMP"' EXIT
printf 'Cloning %s into a temporary staging directory...\n' "$REPO"
git clone "$REPO" "$TEMP/repository"
rsync -a --exclude '.git/' --exclude 'node_modules/' --exclude 'dist/' --exclude 'data/' \
  --exclude '.env' --exclude '*.sqlite' --exclude '*.sqlite-shm' --exclude '*.sqlite-wal' \
  "$ROOT/" "$TEMP/repository/"
(
  cd "$TEMP/repository"
  git add -A
  git diff --cached --check
  if git diff --cached --quiet; then
    echo 'Source repository already matches the staged files; no commit needed.'
    exit 0
  fi
  echo 'Reviewing staged source file names:'
  git diff --cached --name-status
  printf '\nPublishing all staged source changes to main (no forced updates).\n'
  git commit -m 'Publish verified Harbor Policy Operations v0.2 demo source'
  git push origin HEAD:main
)