# CaneGuard Web Monorepo

CaneGuard is a local defense prototype for municipal agriculture staff to
review submitted sugarcane field observations. Model output is decision
support, not a diagnosis.

## Repository architecture

This repository contains two applications with separate runtime boundaries:

- React 19, TypeScript, and Vite at the repository root
- Laravel 13 and Sanctum in `api/`

There is one root Git repository. Do not initialize another repository inside
`api/`, move the React application, or expose API/database secrets through
`VITE_` variables.

## Requirements

- Node.js and npm compatible with Vite 8
- PHP 8.3–8.5 with PDO MySQL
- Composer
- MySQL 8.4 LTS

## Web setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

The web runs at `http://localhost:5173`. Values prefixed with `VITE_` are
public browser configuration.

## API and MySQL setup

Create MySQL databases named `caneguard` and `caneguard_test` with
`utf8mb4_unicode_ci`, then grant a dedicated local `caneguard_app` user access
to both.

```bash
npm run api:install
cp api/.env.example api/.env
php api/artisan key:generate
php api/artisan migrate
php api/artisan db:seed
```

For an existing installation created before private evidence storage, put the
application in maintenance mode and run the migration before serving this
release:

```bash
php api/artisan down
php api/artisan reports:secure-images
php api/artisan reports:secure-images --remove-public
php api/artisan up
```

The first command copies and verifies every report image. The second removes
only verified public copies and the legacy `public/storage` symlink. To roll
back before the second command, keep using the public copies. After removal,
restore from the private disk or a backup before recreating a public link.
Do not switch traffic to this release until the copy-and-verify command passes;
the authorized image endpoint intentionally reads private storage only.

Set the database password and the three local demo account passwords only in
`api/.env`. Never commit that file. The seeded accounts are:

- `field@caneguard.test`
- `mao@caneguard.test`
- `admin@caneguard.test`

## Local development

Run the applications in separate terminals:

```bash
npm run dev
```

```bash
npm run api:dev
```

The API runs at `http://localhost:8000`. Its readiness endpoint is
`GET http://localhost:8000/api/health`. Authenticated report endpoints use the
`/api/v1` prefix; browser requests use Sanctum cookies, while mobile-compatible
submission and status requests use Sanctum bearer tokens.

## Verification

```bash
npm run check:web
npm run check:api
npm run check:all
npm run api:test:mysql
```

The API checks use Laravel feature tests and Pint. The web test suite is added
with the web API infrastructure phase. The MySQL schema suite is read-only,
refuses to target any database other than `caneguard_test`, and expects the
latest migrations to have already run.

## Presentation commands

Set `APP_DEBUG=false` in the uncommitted `api/.env` before the presentation,
confirm the MySQL service is already running, and explicitly keep this local
rehearsal on `caneguard_test`:

```bash
npm ci
npm run check:all
DB_CONNECTION=mysql DB_DATABASE=caneguard_test \
  php api/artisan migrate:status
php api/artisan route:list
DB_CONNECTION=mysql DB_DATABASE=caneguard_test \
  npm run api:dev
npm run dev
```

Keep MySQL running on port `3306`, the API on `8000`, and the web on `5173`.
Both development servers remain bound to loopback. Present from the same
machine or by screen sharing. Do not expose the repository-root Vite
development server to a LAN: it is a development tool, not a hardened file
server. A future LAN presentation requires an isolated built-asset document
root plus an explicitly reviewed API binding, CORS/Sanctum cookie policy, and
host-firewall configuration.

## Release rehearsal

Run the MySQL contract and whole-flow release test only against
`caneguard_test`. The test refuses any other database, wraps its records in a
transaction, and removes its uploaded image:

```bash
npm run api:test:mysql
cd api
vendor/bin/phpunit --configuration=phpunit.mysql.xml \
  --filter ReleaseDemoFlowMySqlTest
vendor/bin/phpunit --configuration=phpunit.mysql.xml \
  --filter ReleaseDemoFlowMySqlTest
```

The two explicit runs are the release rehearsal. Each run logs in, loads the
dashboard, submits a prepared mobile-compatible report through a separate
bearer-token client, refreshes the queue, opens and reviews the report, reads
it again to prove persistence, and logs out.

For the live presentation, first issue a dedicated field-reporter token that
expires after 30 minutes without printing it to the terminal:

```bash
umask 077
token_file="$(mktemp /tmp/caneguard-field-token-XXXXXXXX)"
TOKEN_FILE="$token_file" \
DB_CONNECTION=mysql DB_DATABASE=caneguard_test \
php api/artisan tinker --execute='
$user = App\Models\User::where("email", "field@caneguard.test")->firstOrFail();
$user->tokens()->where("name", "caneguard-release-demo")->delete();
$token = $user->createToken(
    "caneguard-release-demo",
    ["report:submit"],
    now()->addMinutes(30),
)->plainTextToken;
file_put_contents((string) getenv("TOKEN_FILE"), $token);
'
IFS= read -r CANEGUARD_FIELD_TOKEN < "$token_file"
export CANEGUARD_FIELD_TOKEN
export CANEGUARD_DEMO_IMAGE="$PWD/api/database/seeders/assets/synthetic-sugarcane-rust.png"
```

Only after exporting the variables, launch Bruno from that same process
environment, open `demo/bruno`, and select Local. If the desktop launcher
cannot inherit that shell environment, set `fieldToken` as a secret and
`imagePath` through Bruno's environment UI for this session instead.
The token ability is descriptive; the field-reporter role and server-side
policy remain the authorization boundary. The supplied image is synthetic
demo evidence, not diagnostic ground truth. Do not commit, paste, or
screen-record the token. Mobile UI sync is not implemented; the Bruno request
is the honest submission client for this release.

Follow this order during the live demonstration:

1. Log in as the reviewer.
2. Show the dashboard.
3. Submit the prepared report through Bruno.
4. Refresh and open the submitted report.
5. Review the evidence and mark it For Field Validation with a neutral note.
6. Refresh the browser and confirm the saved review.
7. Log out.

Immediately revoke and remove the presentation token:

```bash
DB_CONNECTION=mysql DB_DATABASE=caneguard_test \
php api/artisan tinker --execute='
$user = App\Models\User::where("email", "field@caneguard.test")->firstOrFail();
$user->tokens()->where("name", "caneguard-release-demo")->delete();
echo $user->tokens()->where("name", "caneguard-release-demo")->exists()
    ? "token-still-present"
    : "token-revoked";
'
unset CANEGUARD_FIELD_TOKEN
rm -f -- "$token_file"
unset token_file
```

## Rehearsal backup and rollback

The local presentation above uses `caneguard_test`, so its backup must target
that same database. Create a unique staging directory outside the repository
with restrictive permissions. The database client option file must also be
private and must never be added to Git:

```bash
umask 077
release_dir="$(mktemp -d /tmp/caneguard-rehearsal-XXXXXXXX)"
mysqldump --defaults-extra-file=/private/path/mysql-client.cnf \
  --single-transaction --routines --triggers \
  --databases caneguard_test \
  > "$release_dir/caneguard_test.sql"
tar -czf "$release_dir/private-evidence.tar.gz" \
  -C api/storage/app private
tar -czf "$release_dir/web-build.tar.gz" dist
git bundle create "$release_dir/source.bundle" --all
tar -czf "$release_dir/bruno.tar.gz" demo/bruno
cp api/database/seeders/assets/synthetic-sugarcane-rust.png \
  "$release_dir/rehearsal-image.png"
(
  cd "$release_dir"
  find . -type f ! -name SHA256SUMS -print0 \
    | sort -z \
    | xargs -0 sha256sum > SHA256SUMS
)
```

`/tmp` is staging only. Copy the completed directory to durable,
access-controlled storage and verify the checksum manifest there. Keep the
rehearsal dump, evidence archive, built web assets, source bundle, Bruno
request, test image, approved screenshots or recording, and checksum manifest
together. Add a `CREDENTIALS-REFERENCE.txt` stating that no credential is
stored in the artifact, that demo passwords remain in ignored `api/.env`, and
that the named 30-minute token was revoked. Never place a password, token, or
database option file in the release directory; private credentials remain
separate.

To roll back this local rehearsal, stop its servers, restore source from the
bundle, restore the matching `caneguard_test` dump and private-evidence archive,
rebuild, rerun `npm run check:all`, and verify `/api/health` before resuming the
rehearsal. Database or evidence restore is destructive and must be approved
for the exact target first.

The `caneguard_test` dump is not a production backup. Before any future live
deployment, resolve and confirm the actual database and evidence-storage
targets, obtain approval for those exact targets, create and restore-test a
separate backup, then reference that backup in the deployment rollback plan.
Never use the rehearsal dump to roll back a different database.

After two successful rehearsals, freeze dependencies and features. Permit only
critical fixes, and rerun both the full automated gate and the two rehearsal
runs after every such fix.
