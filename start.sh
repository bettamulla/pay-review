#!/usr/bin/env bash
# One-shot dev runner. Installs deps, prepares .env.local, generates AUTH_SECRET,
# runs migrations + seed, and starts the dev server.
#
# Prereq: a Postgres database. Easiest options:
#   • Free Neon account → https://neon.tech → copy the connection string
#   • Docker:           docker run -d --name pg -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres
# Then put the connection string into .env.local as DATABASE_URL before running.
set -e

cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "[start] installing deps..."
  npm install
fi

if [ ! -f .env.local ]; then
  echo "[start] creating .env.local from example"
  cp .env.example .env.local
  echo ""
  echo "  ⚠️  Edit .env.local and set DATABASE_URL to your Postgres connection string."
  echo "      Then run ./start.sh again."
  echo ""
  exit 1
fi

# Bail early if DATABASE_URL is still the placeholder
if grep -q "^DATABASE_URL=postgres://user:password@host" .env.local; then
  echo "[start] DATABASE_URL is still the placeholder. Edit .env.local first."
  exit 1
fi

# Auto-generate a strong AUTH_SECRET on first run (or if still the placeholder).
if grep -q "^AUTH_SECRET=replace-me" .env.local || grep -q "^AUTH_SECRET=dev-only-secret" .env.local; then
  if command -v openssl >/dev/null 2>&1; then
    SECRET=$(openssl rand -base64 32)
  else
    SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
  fi
  # Cross-platform in-place edit
  if sed --version >/dev/null 2>&1; then
    sed -i "s|^AUTH_SECRET=.*|AUTH_SECRET=${SECRET}|" .env.local
  else
    sed -i '' "s|^AUTH_SECRET=.*|AUTH_SECRET=${SECRET}|" .env.local
  fi
  echo "[start] generated fresh AUTH_SECRET"
fi

# Generate migrations + apply them (idempotent).
echo "[start] generating migrations..."
npm run db:generate >/dev/null 2>&1 || true

echo "[start] applying migrations..."
npm run db:init

# Seed only if the demo user doesn't already exist (idempotent reseed).
echo "[start] seeding demo data (skips if already present)..."
npm run db:seed || echo "[start] seed skipped (already seeded)"

echo ""
echo "[start] launching dev server on http://localhost:3000"
echo "[start] demo login: demo@payreview.test / demo1234"
echo ""
echo "[start] cron: Vercel Cron will hit /api/admin/run-reminders every minute."
echo "[start] locally, run this in a second terminal to mimic that:  npm run cron:run"
echo ""

# If invoked in a terminal, run both dev + cron in foreground. Otherwise, just dev.
if [ -t 0 ]; then
  trap "kill 0" INT TERM EXIT
  npm run cron:run &
  npm run dev
else
  npm run dev
fi
