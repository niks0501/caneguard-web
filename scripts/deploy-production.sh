#!/usr/bin/env bash
# Invoked over SSH by the manual production deployment workflow.
set -Eeuo pipefail
umask 027

release_id="${1:?release id required}"
expected_hash="${2:?archive SHA256 required}"
root=/var/www/caneguard
releases="$root/releases"
shared="$root/shared/api"
current="$root/current"
archive="$releases/.upload-$release_id.tar.gz"
new="$releases/$release_id"
lock="$root/.production-deploy.lock"

if [[ ! "$release_id" =~ ^release-[0-9]+-[a-f0-9]{40}$ ]] ||
   [[ ! "$expected_hash" =~ ^[a-f0-9]{64}$ ]]; then
  echo "Invalid release identity or archive hash" >&2
  exit 1
fi

exec 9>"$lock"
flock -n 9 || { echo "Another deployment is running" >&2; exit 1; }

[[ -L "$current" && -d "$current/api" ]] || { echo "Current release is missing" >&2; exit 1; }
[[ -f "$shared/.env" && -d "$shared/storage" ]] || { echo "Shared Laravel state is missing" >&2; exit 1; }
# The ACL package must be installed on Lightsail before running this workflow.
for tool in setfacl getfacl; do
  command -v "$tool" >/dev/null 2>&1 || {
    echo "Missing $tool on Lightsail; ubuntu must install the 'acl' package" >&2
    exit 1
  }
done
[[ -f "$archive" ]] || { echo "Release archive missing" >&2; exit 1; }
[[ ! -e "$new" ]] || { echo "Release already exists" >&2; exit 1; }
printf '%s  %s\n' "$expected_hash" "$archive" | sha256sum -c -

old="$(readlink -f "$current")"
[[ "$old" == "$releases/"* && -d "$old/api" ]] || { echo "Unsafe current symlink" >&2; exit 1; }

activated=0
successful=0
cleanup() {
  status=$?
  trap - EXIT
  if [[ "$successful" -ne 1 && "$activated" -eq 1 ]]; then
    echo "Health check failed; restoring previous code symlink" >&2
    ln -s "$old" "$root/.rollback-$$"
    mv -Tf "$root/.rollback-$$" "$current"
    curl --fail --silent --show-error --max-time 15 https://caneguard.online/api/health || true
    echo "WARNING: Database migrations are not rolled back automatically." >&2
  fi
  rm -f "$archive"
  exit "$status"
}
trap cleanup EXIT

mkdir "$new"
tar -xzf "$archive" --no-same-owner --no-same-permissions -C "$new"
[[ -s "$new/api/public/index.php" && -s "$new/api/public/index.html" ]] ||
  { echo "Incomplete release archive" >&2; exit 1; }
[[ ! -e "$new/api/.env" ]] || { echo "Archive contains an unexpected api/.env" >&2; exit 1; }

ln -s "$shared/.env" "$new/api/.env"
rm -rf "$new/api/storage"
ln -s "$shared/storage" "$new/api/storage"
cd "$new/api"
composer install --no-dev --no-interaction --no-progress --prefer-dist --optimize-autoloader
php artisan optimize:clear
php artisan config:cache
php artisan view:cache

# Composer may extract 0640 deploy:deploy files despite setgid parents.
# Give only the PHP-FPM identity read/traverse access without exposing files to
# other accounts or requiring deploy to change file ownership/group.
# -P prevents following shared .env/storage symlinks into persistent state.
setfacl -R -P -m u:www-data:rX "$new"

# A fail-closed check for Composer and application entry points.
for path in "$new/api/vendor/autoload.php" "$new/api/public/index.php"; do
  [[ -f "$path" ]] || { echo "Required release file missing: $path" >&2; exit 1; }
  getfacl -cp "$path" | grep -q '^user:www-data:r' || {
    echo "PHP-FPM read ACL missing on $path; refusing activation" >&2
    exit 1
  }
done

# Only non-destructive, backward-compatible migrations may be released.
# Take an out-of-band MySQL backup before deployments with schema changes.
php artisan migrate --force --no-interaction

ln -s "$new" "$root/.activate-$$"
mv -Tf "$root/.activate-$$" "$current"
activated=1

# Ensure public API and SPA both respond through the activated Nginx root.
health="$(curl --fail --silent --show-error --max-time 20 https://caneguard.online/api/health)"
HEALTH_JSON="$health" php -r '
$body = json_decode(getenv("HEALTH_JSON"), true);
if (($body["data"]["status"] ?? null) !== "ok" ||
    ($body["data"]["checks"]["database"] ?? null) !== "ready" ||
    ($body["data"]["checks"]["storage"] ?? null) !== "ready") {
    fwrite(STDERR, "API readiness failed".PHP_EOL);
    exit(1);
}'
curl --fail --silent --show-error --max-time 20 https://caneguard.online/ |
  grep -qi '<html'
successful=1
echo "PASS: Active release $release_id"
echo "Rollback reference: $old"
