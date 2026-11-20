#!/usr/bin/env bash
# Invoked over SSH by the production configuration workflow, which streams the shared .env on stdin.
set -Eeuo pipefail
umask 077

root=/var/www/caneguard
target="$root/shared/api/.env"
staging="$target.next"
lock="$root/.production-deploy.lock"
trap 'rm -f "$staging"' EXIT

exec 9>"$lock"
flock -n 9 || { echo "Another deployment is running" >&2; exit 1; }
[[ -d "$root/shared/api" ]] || { echo "Shared Laravel state is missing" >&2; exit 1; }

cat > "$staging"
[[ "$(tail -n 1 "$staging")" == "# caneguard-config-complete" ]] || { echo "Configuration input is empty or incomplete" >&2; exit 1; }
setfacl -m u:www-data:r "$staging"
mv -Tf "$staging" "$target"
echo "Installed shared production configuration"
