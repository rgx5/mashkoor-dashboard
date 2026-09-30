#!/usr/bin/env bash
# Builds and (re)starts the dashboard: API under pm2, React app as static files behind nginx.
# Run as the `mashkoor` user after new code is in /var/www/mashkoor/mashkoor-dashboard:   bash /var/www/mashkoor/mashkoor-dashboard/deploy/scripts/deploy-dashboard.sh
# Database migrations are applied before the API restarts; `migrate deploy` only applies committed migrations and never resets data.
set -euo pipefail

cd /var/www/mashkoor/mashkoor-dashboard
[ -f backend/.env ] || { echo "Missing backend/.env — copy deploy/env/backend.env.example and fill it in"; exit 1; }

echo "==> Installing dependencies"
pnpm install --frozen-lockfile

echo "==> Building"
pnpm --filter @mashkoor/shared build
pnpm --filter @mashkoor/backend exec prisma generate
pnpm --filter @mashkoor/backend exec prisma migrate deploy
pnpm --filter @mashkoor/backend build
pnpm --filter @mashkoor/frontend build

echo "==> Publishing the React app"
rsync -a --delete frontend/dist/ /var/www/mashkoor-app/

echo "==> Restarting the API"
pm2 startOrReload /var/www/mashkoor/mashkoor-dashboard/deploy/pm2/ecosystem.config.cjs --only mashkoor-api --update-env
pm2 save

echo "Dashboard deployed. Check:  curl -s https://mashkoor.rapidrabbit.cloud/api/v1/health"
