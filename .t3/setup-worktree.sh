#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
repo="$(git -C "${T3CODE_WORKTREE_PATH:-$PWD}" rev-parse --show-toplevel)"
repo="$(realpath -e -- "$repo")"
[[ -f "$repo/.git" && ! -L "$repo/.git" ]] || { echo 'Refusing main checkout. Select a linked worktree.' >&2; exit 1; }
[[ "$(git -C "$repo" rev-parse --path-format=absolute --git-dir)" != "$(git -C "$repo" rev-parse --path-format=absolute --git-common-dir)" ]] || { echo 'Refusing main checkout.' >&2; exit 1; }
cd "$repo"
[[ -f api/artisan && -f api/composer.lock && -f package-lock.json ]] || { echo 'Not a CaneGuard Web/API checkout.' >&2; exit 1; }
for path in .env.local api/.env api/database/t3-worktree.sqlite; do
  [[ ! -L "$path" ]] || { echo "Refusing symlink: $path" >&2; exit 1; }
  if git ls-files --error-unmatch -- "$path" >/dev/null 2>&1; then
    echo "Refusing tracked local state: $path" >&2; exit 1
  fi
  if [[ -e "$path" ]]; then
    [[ -f "$path" && "$(stat -c %h -- "$path")" == 1 ]] || { echo "Unsafe local state: $path" >&2; exit 1; }
  fi
  git check-ignore -q -- "$path" || { echo "Local state is not git-ignored: $path" >&2; exit 1; }
done
[[ "$(realpath -e -- api/database)" == "$repo/api/database" ]] || { echo 'Unsafe database directory.' >&2; exit 1; }
db="$repo/api/database/t3-worktree.sqlite"
if [[ ! -e .env.local ]]; then
  cp -- .env.example .env.local
  python3 - .env.local <<'PYENV'
import pathlib,re,sys
p=pathlib.Path(sys.argv[1]); s=p.read_text()
for k,v in {'VITE_API_BASE_URL':'http://localhost:8000','VITE_DATA_SOURCE':'api','VITE_REALTIME_ENABLED':'false','VITE_REVERB_APP_KEY':''}.items():
    s=re.sub(rf'(?m)^{k}=.*$', '',s).rstrip()+f'\n{k}={v}\n'
p.write_text(s+'\n')
PYENV
fi
if [[ ! -e api/.env ]]; then
  python3 - api/.env.example api/.env "$db" <<'PYENV'
import pathlib,re,sys
src,dst,db=sys.argv[1:]; s=pathlib.Path(src).read_text()
if any(c in db for c in ('"','\\','\n','\r','$')): raise SystemExit('Unsupported database path characters')
settings={'APP_ENV':'local','APP_KEY':'','APP_DEBUG':'true','APP_URL':'http://localhost:8000','APP_TRUSTED_HOSTS':'localhost,127.0.0.1','FRONTEND_URL':'http://localhost:5173','CORS_ALLOWED_ORIGINS':'http://localhost:5173','SANCTUM_STATEFUL_DOMAINS':'localhost:5173,127.0.0.1:5173','DB_CONNECTION':'sqlite','DB_DATABASE':f'"{db}"','DB_URL':'','MAIL_MAILER':'log','BROADCAST_CONNECTION':'log','FILESYSTEM_DISK':'local','CANEGUARD_WEEKLY_SEND_ENABLED':'false','CANEGUARD_AERIAL_ANALYSIS_ENABLED':'false'}
for k,v in settings.items():
    s=re.sub(rf'(?m)^{k}=.*$', '',s).rstrip()+f'\n{k}={v}\n'
with open(dst,'x') as f: f.write(s+'\n')
PYENV
fi
chmod 600 .env.local api/.env
touch -- "$db"
chmod 600 -- "$db"
python3 - api/.env "$db" <<'PYENV'
import pathlib,sys
p=pathlib.Path(sys.argv[1]); entries={}
for line in p.read_text().splitlines():
    if '=' not in line or line.lstrip().startswith('#'): continue
    k,v=line.split('=',1); entries.setdefault(k.strip(),[]).append(v.strip().strip('"').strip("'"))
for k,v in {'APP_ENV':'local','DB_CONNECTION':'sqlite','DB_DATABASE':sys.argv[2],'DB_URL':'','MAIL_MAILER':'log','BROADCAST_CONNECTION':'log','FILESYSTEM_DISK':'local','CANEGUARD_WEEKLY_SEND_ENABLED':'false','CANEGUARD_AERIAL_ANALYSIS_ENABLED':'false'}.items():
    if entries.get(k,[])!=[v]: raise SystemExit(f'Unsafe or unexpected {k}; refusing setup. Inspect worktree .env.')
PYENV
for key in APP_ENV DB_CONNECTION DB_DATABASE DB_URL MAIL_MAILER BROADCAST_CONNECTION FILESYSTEM_DISK CANEGUARD_WEEKLY_SEND_ENABLED CANEGUARD_AERIAL_ANALYSIS_ENABLED APP_CONFIG_CACHE; do
  if [[ -v "$key" ]]; then echo "Unset inherited $key before setup." >&2; exit 1; fi
done
npm ci --no-audit --no-fund
(cd api && composer install --no-interaction --prefer-dist --no-scripts)
(cd api && php artisan config:clear)
(cd api && CG_EXPECTED_DB="$db" php <<'PHP'
<?php
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$db = Illuminate\Support\Facades\DB::connection();
if (!app()->environment('local') || config('database.default') !== 'sqlite' || $db->getDriverName() !== 'sqlite' || config('database.connections.sqlite.url') || $db->getDatabaseName() !== getenv('CG_EXPECTED_DB') || config('mail.default') !== 'log' || config('broadcasting.default') !== 'log' || config('filesystems.default') !== 'local' || config('caneguard.weekly_send_enabled') || config('caneguard.aerial.enabled')) {
    throw new RuntimeException('Unsafe effective Laravel configuration. No migration performed.');
}
PHP
)
(cd api && php artisan package:discover --ansi)
if grep -Eq '^APP_KEY=[[:space:]]*$' api/.env; then
  (cd api && php artisan key:generate --no-interaction)
fi
(cd api && php artisan migrate --no-interaction)
echo 'Web/API worktree prepared. Run Create CaneGuard Test Accounts when needed.'
