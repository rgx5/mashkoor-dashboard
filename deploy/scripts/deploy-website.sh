#!/usr/bin/env bash
# Builds and (re)starts the public website under pm2. Independent of the dashboard deploy.
# Run as the `mashkoor` user after new code is in /var/www/mashkoor/mashkoor-website:   bash /var/www/mashkoor/mashkoor-dashboard/deploy/scripts/deploy-website.sh
set -euo pipefail

cd /var/www/mashkoor/mashkoor-website
[ -f .env.production ] || { echo "Missing .env.production — copy deploy/env/website.env.production.example and fill it in"; exit 1; }

echo "==> Installing dependencies"
pnpm install --frozen-lockfile

echo "==> Building"
pnpm build

echo "==> Restarting the website"
pm2 startOrReload /var/www/mashkoor/mashkoor-dashboard/deploy/pm2/ecosystem.config.cjs --only mashkoor-website --update-env
pm2 save

echo "Website deployed. Check:  curl -sI https://www.mashkoor.co.in | head -1"
