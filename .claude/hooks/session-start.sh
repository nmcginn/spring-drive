#!/usr/bin/env bash
# Gets a fresh cloud session to the point where `npm run check` can run.
# Local sessions are left alone: reinstalling someone's node_modules at every
# session start would be slow and surprising.
set -euo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# The container ships Chromium here and should not download another. The
# revision @playwright/test expects may differ, so point the config at this
# one explicitly (decision 11).
if [ -x /opt/pw-browsers/chromium ] && [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium' >> "$CLAUDE_ENV_FILE"
fi

# Before M0 there is nothing to install.
[ -f package-lock.json ] || exit 0
npm ci --no-audit --no-fund
