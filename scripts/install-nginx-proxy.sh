#!/usr/bin/env bash
# Install YAYTD nginx reverse proxy (hide Server header, :3000 → :3001).
set -euo pipefail

SOURCE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DOMAIN="${YAYTD_DOMAIN:-letolto.gamedns.hu}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo ./scripts/install-nginx-proxy.sh"
  exit 1
fi

if ! command -v nginx >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y nginx
fi

apt-get install -y libnginx-mod-http-headers-more-filter

mkdir -p /etc/nginx/snippets
cp "${SOURCE_DIR}/deploy/nginx-snippets-yaytd-proxy-headers.conf" \
  /etc/nginx/snippets/yaytd-proxy-headers.conf

sed "s/DOMAIN_PLACEHOLDER/${DOMAIN}/g" \
  "${SOURCE_DIR}/deploy/nginx-yaytd-proxy.conf" \
  > /etc/nginx/sites-available/yaytd

ln -sf /etc/nginx/sites-available/yaytd /etc/nginx/sites-enabled/yaytd
rm -f /etc/nginx/sites-enabled/default

grep -q 'server_tokens off' /etc/nginx/nginx.conf 2>/dev/null \
  || sed -i 's/# server_tokens off;/server_tokens off;/' /etc/nginx/nginx.conf

nginx -t
systemctl enable nginx
systemctl restart nginx
echo "OK: nginx proxy for ${DOMAIN} (public :3000 → 127.0.0.1:3001)"
