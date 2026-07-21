#!/usr/bin/env bash
set -e
if command -v dnf >/dev/null 2>&1; then
  sudo dnf update -y
  sudo dnf install -y nginx nodejs npm git
elif command -v apt >/dev/null 2>&1; then
  sudo apt update
  sudo apt install -y nginx nodejs npm git
else
  echo "Distribucion no compatible: se requiere dnf o apt." >&2
  exit 1
fi
npm install
sudo npm install -g pm2
pm2 start server.js --name tactical-support-cloud || pm2 restart tactical-support-cloud
pm2 save
sudo systemctl enable --now nginx
