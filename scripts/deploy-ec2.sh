#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/ec2-user/prowlet"
BACKEND_DIR="$APP_DIR/prowlet-backend"

cd "$APP_DIR"
git fetch --prune origin main
git checkout main
git pull --ff-only origin main

npm ci
npm run build
npm prune --omit=dev

cd "$BACKEND_DIR"
npm ci
npm run api:build
npm run db:migrate
npm prune --omit=dev

sudo -n /usr/bin/install -o root -g root -m 0600 "$BACKEND_DIR/.env" /etc/prowlet/backend.env
sudo -n /usr/bin/systemctl restart prowlet-api.service prowlet-web.service
sudo -n /usr/bin/systemctl is-active --quiet prowlet-api.service
sudo -n /usr/bin/systemctl is-active --quiet prowlet-web.service
curl --fail --silent --show-error http://127.0.0.1:4000/health
curl --fail --silent --show-error http://127.0.0.1:3000/ >/dev/null
printf '\nDeployment complete at %s\n' "$(git rev-parse --short HEAD)"
