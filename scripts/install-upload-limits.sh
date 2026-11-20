#!/usr/bin/env bash
# Applies the managed nginx and PHP-FPM upload limits from this release. Run as root.
set -Eeuo pipefail

[[ "$EUID" -eq 0 ]] || { echo "Run as root, for example with sudo" >&2; exit 1; }

release="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
nginx_source="$release/deploy/server/nginx/caneguard-upload-limits.conf"
php_source="$release/deploy/server/php/caneguard-upload-limits.ini"
nginx_target=/etc/nginx/conf.d/caneguard-upload-limits.conf
php_target=/etc/php/8.3/fpm/conf.d/90-caneguard-upload-limits.ini

install -m 0644 "$nginx_source" "$nginx_target"
install -m 0644 "$php_source" "$php_target"

if ! { nginx -t && php-fpm8.3 -t; }; then
  rm -f "$nginx_target" "$php_target"
  echo "Configuration test failed; upload limits were not applied" >&2
  exit 1
fi

systemctl reload nginx
systemctl reload php8.3-fpm
echo "PASS: upload limits applied from $release"
