# CaneGuard Web + API

CaneGuard is a local decision-support system for municipal agriculture staff reviewing sugarcane field observations.
AI output is decision support only, not a diagnosis.

This repository, `caneguard-web`, contains the React web workspace at the repository root and the Laravel API in `api/`.
The companion [CaneGuard Mobile repository](https://github.com/niks0501/caneguard-mobile) is a separate private repository for the Android-first Expo and React Native field app.
The mobile app captures observations, stores finalized reports offline, and synchronizes them with this API.

## Architecture and local services

```text
MySQL 127.0.0.1:3306
        ^
        | Laravel API and Sanctum authentication
        | 127.0.0.1:8000
        ^                         ^
        |                         |
React Web localhost:5173    Android development build
Sanctum cookie session        bearer token via ADB reverse
```

- The Web app uses Vite, React, TypeScript, and `VITE_API_BASE_URL`.
- The API uses Laravel 13, Sanctum, MySQL, database-backed sessions and cache, and local report-image storage.
- Web authentication uses Sanctum cookies and the configured CORS and stateful-domain values.
- Mobile authentication uses a Sanctum bearer token and the `/api/v1/mobile/*` routes.
- The root `npm run api:dev` script starts the API on `127.0.0.1:8000`.
- The root `npm run dev` script starts the Web app on Vite's default local URL, `http://localhost:5173`.
- The API health endpoint is `GET http://127.0.0.1:8000/api/health`.
- The root `npm run api:queue` script starts the database queue worker used for broadcasts.
- The root `npm run api:reverb` script starts Laravel Reverb on port `8080`.
- Reverb only provides Web freshness signals; REST remains the source of truth when the queue or WebSocket service is unavailable.

Start services in this order every day: MySQL, API, queue worker, Reverb, Web, ADB reverse, Metro, then the Android development build.
The database service is managed by your local MySQL installation because this repository does not define a database service command.

## Prerequisites

These requirements come from the checked-in package, Composer, environment, and Mobile repository files.

- Git and access to both private GitHub repositories.
- Node.js and npm compatible with the checked-in root and Mobile lockfiles.
- PHP satisfying `api/composer.json`'s `^8.3` constraint, Composer, and PDO MySQL.
- A MySQL service reachable at `127.0.0.1:3306` with `utf8mb4` support.
- An Android device or emulator and `adb` for the native workflow.
- An installed Expo development build for the full Mobile app.
  Expo Go is not sufficient because the app uses native TensorFlow Lite and other native modules.
- An authenticated EAS CLI satisfying the Mobile repository's `eas.json` CLI requirement of `>= 21.2.0` when you need to build a development APK.

The root Web package uses Vite 8.
The Mobile package pins Expo `~57.0.11`, React Native `0.86.2`, and its native dependencies in its package files.
Do not add a version to this guide when the repository does not declare one.

## Placeholders, private access, and secrets

Commands below use angle-bracket placeholders that must be replaced before running.
`<mysql-admin-user>` is a local MySQL account allowed to create databases and users.
`<local-db-password>` is a password you choose for the local `caneguard_app` account and then put in `api/.env` as `DB_PASSWORD`.
`<local-field-reporter-password>`, `<local-reviewer-password>`, and `<local-admin-password>` are local passwords you choose for the seeded demo accounts.
`<apk-path>` is the path to the development APK produced by EAS.

Both repositories are private.
Authenticate your Git client with GitHub before cloning and do not put a token, password, or credential in a clone URL.
All passwords in this guide are placeholders for local values.
Never commit `api/.env`, the Web `.env.local`, the Mobile `.env`, tokens, or real personal data.

## 1. Clone the two repositories side by side

The commands below create `$HOME/src/caneguard` as the shared parent directory.

```bash
# Parent directory: $HOME/src/caneguard
mkdir -p "$HOME/src/caneguard"
cd "$HOME/src/caneguard"
git clone https://github.com/niks0501/caneguard-web.git caneguard-web
git clone https://github.com/niks0501/caneguard-mobile.git caneguard-mobile
```

The resulting layout is:

```text
$HOME/src/caneguard/
├── caneguard-web/
└── caneguard-mobile/
```

The Web/API checkout is one Git repository.
Do not initialize or clone another repository inside its `api/` directory.
Keep the Web/API and Mobile directories side by side for the optional cross-repository contract gate.
The Mobile repository URL is [https://github.com/niks0501/caneguard-mobile](https://github.com/niks0501/caneguard-mobile).

## 2. One-time Web and API setup

Run the following from the Web/API repository root.

```bash
# Web/API repository: $HOME/src/caneguard/caneguard-web
cd "$HOME/src/caneguard/caneguard-web"
npm ci
npm run api:install
cp .env.example .env.local
cp api/.env.example api/.env
```

`npm run api:install` is a root script that runs Composer in `api/`.
The `api/package.json` `dev` and `build` scripts are for the Laravel Vite asset package and are not the API server startup command.

### Configure the Web environment

The copied `.env.local` already contains the local API defaults.
Verify these values before starting Vite:

```dotenv
VITE_API_BASE_URL=http://localhost:8000
VITE_DATA_SOURCE=api
VITE_REPORT_REFRESH_MS=600000
VITE_MAPTILER_KEY=
VITE_REALTIME_ENABLED=true
VITE_REVERB_APP_KEY=caneguard-local-key
VITE_REVERB_HOST=localhost
VITE_REVERB_PORT=8080
VITE_REVERB_SCHEME=http
```

`VITE_MAPTILER_KEY` is optional browser configuration for the hosted basemap.
All `VITE_*` values are public browser configuration and must never contain API passwords or tokens.

### Configure the API environment

The copied `api/.env` already contains the local Web, Sanctum, and MySQL defaults.
Set the local database password and all three local demo passwords.
Keep these values only in `api/.env`.

```dotenv
APP_URL=http://localhost:8000
FRONTEND_URL=http://localhost:5173
CORS_ALLOWED_ORIGINS=http://localhost:5173
SANCTUM_STATEFUL_DOMAINS=localhost:5173,127.0.0.1:5173
BROADCAST_CONNECTION=reverb
REVERB_APP_ID=caneguard-local
REVERB_APP_KEY=caneguard-local-key
REVERB_APP_SECRET=caneguard-local-secret
REVERB_HOST=localhost
REVERB_PORT=8080
REVERB_SCHEME=http
REVERB_ALLOWED_ORIGINS=http://localhost:5173
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=caneguard
DB_USERNAME=caneguard_app
DB_PASSWORD=<local-db-password>
DB_CHARSET=utf8mb4
DB_COLLATION=utf8mb4_unicode_ci
CANEGUARD_FIELD_PASSWORD=<local-field-reporter-password>
CANEGUARD_REVIEWER_PASSWORD=<local-reviewer-password>
CANEGUARD_ADMIN_PASSWORD=<local-admin-password>
```

`APP_KEY` is generated by the next step and should not be filled with a copied value.
The copied API example uses database-backed sessions, cache, queues, and Reverb, so the database migrations must run before the first login.
Start the queue worker and Reverb process alongside the API when checking live Web updates.

### Create the local MySQL databases and user

Run this SQL in a local MySQL administrative session.
Replace `<mysql-admin-user>` and `<local-db-password>` before running the commands.

```bash
# MySQL client: no repository working directory
mysql -u <mysql-admin-user> -p
```

```sql
CREATE DATABASE IF NOT EXISTS `caneguard`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS `caneguard_test`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'caneguard_app'@'127.0.0.1'
  IDENTIFIED BY '<local-db-password>';
GRANT ALL PRIVILEGES ON `caneguard`.*
  TO 'caneguard_app'@'127.0.0.1';
GRANT ALL PRIVILEGES ON `caneguard_test`.*
  TO 'caneguard_app'@'127.0.0.1';
FLUSH PRIVILEGES;
```

Use the same `<local-db-password>` in `api/.env`.
If the local MySQL user already exists, keep its existing password or update it through your local MySQL administration process before continuing.

### Migrate and seed

Run the application migration and seed from the Web/API repository root.

```bash
# Web/API repository: $HOME/src/caneguard/caneguard-web
cd "$HOME/src/caneguard/caneguard-web"
php api/artisan key:generate
php api/artisan migrate
php api/artisan db:seed
```

The seed creates the local demo accounts and synthetic report data.
The accounts are `field@caneguard.test`, `mao@caneguard.test`, and `admin@caneguard.test`.
Use the local passwords you set in `CANEGUARD_FIELD_PASSWORD`, `CANEGUARD_REVIEWER_PASSWORD`, and `CANEGUARD_ADMIN_PASSWORD`.
The Web accepts the reviewer and admin roles, while Mobile synchronization requires the field-reporter role.

Prepare the separate MySQL schema used by the read-only MySQL test suite.
Do not seed this database for the normal onboarding flow.

```bash
# Web/API repository: $HOME/src/caneguard/caneguard-web
cd "$HOME/src/caneguard/caneguard-web"
DB_DATABASE=caneguard_test php api/artisan migrate --force
```

## 3. One-time Mobile companion setup

Run the following from the separate Mobile repository.

```bash
# Mobile repository: $HOME/src/caneguard/caneguard-mobile
cd "$HOME/src/caneguard/caneguard-mobile"
npm ci
cp .env.example .env
```

For the default local Android workflow, keep the Mobile environment at:

```dotenv
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
```

The Mobile API client requires an absolute `http` or `https` URL without credentials.
Development builds may use `http`.
Restart Metro after changing `.env` because Expo public environment values are bundled into JavaScript.

If a compatible development APK is not installed yet, build it with the existing development profile and install the resulting APK.

```bash
# Mobile repository: $HOME/src/caneguard/caneguard-mobile
cd "$HOME/src/caneguard/caneguard-mobile"
eas build --platform android --profile development
adb install <apk-path>
```

Replace `<apk-path>` with the actual APK path before running `adb install`.
The development profile produces an internal Android APK and enables the development client.
Do not use Expo Go for the full native workflow.

## 4. Every-day startup order

Use separate terminals and keep each long-running command open.

### 1. Start MySQL

Start the local MySQL service using the service manager for your installation.
There is no MySQL start script in this repository.

### 2. Start the API

```bash
# Terminal 1, Web/API repository: $HOME/src/caneguard/caneguard-web
cd "$HOME/src/caneguard/caneguard-web"
npm run api:dev
```

The API binds to `127.0.0.1:8000`.
Verify it before starting the clients:

```bash
# Any terminal
curl http://127.0.0.1:8000/api/health
```

A healthy response has HTTP 200 and reports `data.status` as `ok`, with both `database` and `storage` checks as `ready`.

### 3. Start the Web app

```bash
# Terminal 2, Web/API repository: $HOME/src/caneguard/caneguard-web
cd "$HOME/src/caneguard/caneguard-web"
npm run dev
```

Open `http://localhost:5173` after Vite reports that it is ready.

### 4. Connect Android to the local API without a developer-specific IP

The team default is ADB reverse.
It maps the Android device's `127.0.0.1:8000` to the host's API loopback port, so no LAN address is checked into `.env` or this README.

```bash
# Terminal 3, any directory with adb access
adb devices
adb reverse tcp:8000 tcp:8000
adb reverse --list
```

The reverse listing should include `tcp:8000 tcp:8000`.
Keep the Mobile `.env` value at `http://127.0.0.1:8000` when using this mapping.
Keep Wi-Fi enabled when wireless ADB is controlling the phone.

For the reviewed fallback and its local-network safety constraints, see [Physical Android API connectivity](docs/development/physical-android-api.md).
Do not expose the loopback development server publicly or commit a developer's LAN address.

### 5. Start Metro

```bash
# Terminal 4, Mobile repository: $HOME/src/caneguard/caneguard-mobile
cd "$HOME/src/caneguard/caneguard-mobile"
npm run start -- --dev-client
```

### 6. Launch the Android development build

With the development APK installed and Metro ready, open the installed CaneGuard Mobile development build on the Android device or emulator.
The Mobile repository also provides this Expo launcher script when a device or emulator is attached:

```bash
# Mobile repository: $HOME/src/caneguard/caneguard-mobile
cd "$HOME/src/caneguard/caneguard-mobile"
npm run android
```

Use the installed development build, not Expo Go.

## 5. Fast end-to-end smoke checklist

Use only the local demo passwords from `api/.env`.
Do not use real farmer or production data.

1. Confirm `curl http://127.0.0.1:8000/api/health` reports `ok`, `database: ready`, and `storage: ready`.
2. Open `http://localhost:5173` and sign in as `mao@caneguard.test` with the local reviewer password.
3. Confirm the Web dashboard loads seeded report data and the authenticated session survives a refresh.
4. Open the Android development build and sign in as `field@caneguard.test` with the local field-reporter password.
5. Create a valid field report, complete its required fields and location, finalize it locally, and trigger Mobile synchronization.
6. Refresh the Web dashboard, open the synchronized report, and save a reviewer status and note.
7. Return to Mobile, refresh or trigger its normal status synchronization, and confirm the report reflects the Web review.

This path proves the local API, Web authentication, Mobile bearer authentication, report upload, Web review, and Mobile status synchronization are using the same API and database.

## Troubleshooting

### API health is unavailable

Check that MySQL is running and that `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`, `DB_HOST`, and `DB_PORT` in `api/.env` match the local account.
Run `php api/artisan migrate` against the application database if migrations have not been applied.
The health endpoint requires both the database and local storage checks to be ready.

### Web login or CORS fails

Confirm that the Web URL is `http://localhost:5173` and that `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS`, and `SANCTUM_STATEFUL_DOMAINS` in `api/.env` contain the matching values.
Restart the API and Vite processes after changing environment files.
The Web client uses cookies and credentials, not a bearer token.

### Mobile says the server is unavailable

Confirm that `adb devices` shows the device as `device` and that `adb reverse --list` includes `tcp:8000 tcp:8000`.
Re-run `adb reverse tcp:8000 tcp:8000` while the device is connected.
Confirm that Mobile `.env` contains `EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8000` and restart Metro and the development build after changing it.
If the device remains controllable by wireless ADB but the API is unavailable, fix the API process or reverse mapping before changing the app code.

### Seeding fails with a missing password error

Set all three `CANEGUARD_*_PASSWORD` values in `api/.env` and run `php api/artisan db:seed` again.
The seeder intentionally refuses to create demo users with empty passwords.

### MySQL validation tests fail because tables are missing

The MySQL suite targets `caneguard_test` and expects its latest migrations to already exist.
Run `DB_DATABASE=caneguard_test php api/artisan migrate --force` and then rerun the suite.
Do not point the read-only schema tests at a shared or production database.

### Metro or the native runtime is stale

Restart Metro after Mobile `.env` changes.
Reinstall or rebuild the development APK when native dependencies or native configuration change.
Expo Go cannot validate the TensorFlow Lite, camera, filesystem, SQLite, or synchronization behavior used by this app.

## Validation commands

Run the Web/API checks from the Web/API repository root.

```bash
# Web/API repository: $HOME/src/caneguard/caneguard-web
cd "$HOME/src/caneguard/caneguard-web"
npm run check:web
npm run check:api
npm run check:all
npm run api:test:mysql
```

`npm run check:all` runs the Web lint, typecheck, tests, and build, followed by the API feature tests and Pint format check.
`npm run api:test:mysql` is read-only and requires the separately migrated `caneguard_test` database.

Run the local Web/API side of the upload contract gate when changing the upload boundary.

```bash
# Web/API repository: $HOME/src/caneguard/caneguard-web
cd "$HOME/src/caneguard/caneguard-web"
npm run contract:artifact
npm run contract:config
npm run contract:test
npm run contract:consumer
```

Run the Mobile checks from the Mobile repository root.

```bash
# Mobile repository: $HOME/src/caneguard/caneguard-mobile
cd "$HOME/src/caneguard/caneguard-mobile"
npm run lint
npm run typecheck
npm test
npm run db:check
npm run e2e:doctor
```

Run the Mobile Maestro suite only when a fresh compatible development build, Metro session, API environment, and Android device or emulator are available.

```bash
# Mobile repository: $HOME/src/caneguard/caneguard-mobile
cd "$HOME/src/caneguard/caneguard-mobile"
npm run e2e
```

## Advanced contracts and full-system acceptance

The canonical Mobile upload and review-status contracts live in [the Web/API contracts directory](docs/contracts).
The fast cross-repository upload gate can evaluate an exact clean Mobile checkout with `MOBILE_REPO_DIR="$HOME/src/caneguard/caneguard-mobile" npm run contract:gate`.
The gate requires the exact Mobile commit pinned in `ci/mobile-report-upload-gate.json` and does not replace a device flow.

P0F is the separate full-system acceptance path for Android development build -> API -> Web review -> API status -> originating Mobile report.
Use [the P0F acceptance gate](docs/CaneGuard_P0A-P0F_Stabilization_Plans/P0F-CROSS-SYSTEM-ACCEPTANCE-GATE.md) after the fast checks pass.

## Further references

- [Simple staging workflow](docs/staging.md)
- [Physical Android API connectivity](docs/development/physical-android-api.md)
- [Mobile report upload contract](docs/contracts/mobile-report-upload-v1.md)
- [Mobile report review-status contract](docs/contracts/mobile-report-status-v1.md)
- [Mobile upload contract gate](docs/testing/mobile-report-upload-contract-gate.md)
- [Web map and queue regression evidence](docs/testing/web-map-queue-regression.md)
- [CaneGuard Mobile repository](https://github.com/niks0501/caneguard-mobile)
