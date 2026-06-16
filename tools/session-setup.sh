#!/usr/bin/env bash
# SessionStart hook: prepare the repo for Claude Code web sessions.
# Idempotent and quick — installs deps if missing so the agent can build/test on demand.
set -e
cd "$(dirname "$0")/.."

if [ ! -d node_modules ]; then
  echo "[annwn] installing dependencies…"
  npm ci --no-audit --no-fund --silent 2>/dev/null || npm install --no-audit --no-fund --silent
fi

# Fast sanity gate: validate level data (cheap). Non-fatal so the session still starts.
if node tools/validate-levels.mjs >/dev/null 2>&1; then
  echo "[annwn] ready — deps installed, level data valid. Try: npm run dev | npm test | npm run build"
else
  echo "[annwn] ready — deps installed. Note: level validation reported issues (run: npm run validate)"
fi
