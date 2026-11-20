#!/usr/bin/env bash
# Invoked over SSH by the production configuration workflow after it uploads the shared .env.
set -Eeuo pipefail
umask 077

run_id="${1:?run id required}"
root=/var/www/caneguard
upload="$root/releases/.env-$run_id"
target="$root/shared/api/.env"
lock="$root/.production-deploy.lock"
trap 'rm -f "$upload" "$target.next"' EXIT

if [[ ! "$run_id" =~ ^[0-9]+$ ]]; then
  echo "Invalid run id" >&2
  exit 1
fi
exec 9>"$lock"
flock -n 9 || { echo "Another deployment is running" >&2; exit 1; }
[[ -f "$upload" && ! -L "$upload" && -s "$upload" ]] || { echo "Configuration upload is missing or empty" >&2; exit 1; }
[[ -d "$root/shared/api" ]] || { echo "Shared Laravel state is missing" >&2; exit 1; }

install -m 0600 "$upload" "$target.next"
mv -Tf "$target.next" "$target"
echo "Installed shared production configuration"
