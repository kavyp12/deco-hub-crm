#!/usr/bin/env bash
#
# DecoHub CRM production deploy script.
#
# This is the reference copy. Install it on the server at:
#   /usr/local/bin/decohub-deploy.sh
# and make it executable + root-owned:
#   sudo cp scripts/deploy.sh /usr/local/bin/decohub-deploy.sh
#   sudo chown root:root /usr/local/bin/decohub-deploy.sh
#   sudo chmod 755 /usr/local/bin/decohub-deploy.sh
#
# It is run as root by GitHub Actions via passwordless sudo, so no inner
# `sudo` calls are needed and pm2 runs as the same (root) user that started it.

set -euo pipefail

REPO="/var/www/deco-hub-crm"
WEBROOT="/var/www/decohub"

echo "==> Pulling latest code"
cd "$REPO"
git pull origin main

echo "==> Building frontend"
npm install
npm run build
rm -rf "${WEBROOT:?}"/*
cp -r dist/* "$WEBROOT"/

echo "==> Building backend"
cd "$REPO/server"
npm install
npx prisma db push
npx prisma generate
npm run build

echo "==> Restarting backend (pm2)"
pm2 restart decohub-backend

echo "==> Reloading nginx"
systemctl reload nginx

echo "==> Deploy complete."
