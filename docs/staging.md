# Simple staging workflow

This is the supported CaneGuard Web and API staging workflow.
It prepares one isolated database, one private Web and API pair, one Tailscale Funnel, and one confidence run.
The development branch remains `main`.
The staging branch is selected and pushed manually.
The public URL is the same URL used by the Web browser and the EAS Preview APK.

## 0. Before you start - open and check your tools

Open a terminal on the staging host and confirm that the required services are running and reachable before changing the repository.
Tailscale and MySQL are host services, so start them manually using the host's normal service manager when they are not ready.
The commands below do not change the host and are safe to rerun.

```bash
tailscale status
tailscale dns status
sudo systemctl status mysql --no-pager
mysqladmin ping -h 127.0.0.1 -P 3306 -u <mysql-admin-user> -p
node -v
npm -v
php -v
composer -v
eas --version
git status --short --branch
```

Confirm that PHP reports version 8.3 or newer.
Confirm that `mysqladmin ping` reports that MySQL is alive.
Confirm that Tailscale reports the host and that HTTPS certificates and Funnel are enabled for the tailnet.
Confirm that `eas --version` works after the EAS CLI setup in Step 2.
Confirm that `git status` is for the intended Web repository before continuing.

## A. FIRST-TIME SETUP - new PC

Use the complete Steps 1 through 7 when setting up a staging host for the first time.
This path creates the host prerequisites, isolated database, Web staging configuration, Web worktree dependencies, Mobile configuration, and EAS QA APK.
After the first successful setup, keep `.qa-staging/staging.env` private and keep the worktree dependencies installed.

## B. SUBSEQUENT FEATURES / NEW QA ROUND - existing PC

Use this short repeat loop when the host already has `.qa-staging/staging.env` and the selected worktree dependencies.
There is no need to run `npm run staging -- init` again.
There is no need to reinstall dependencies unless the staging worktree was recreated or the selected branch changes `package.json`, `package-lock.json`, `api/composer.json`, or `api/composer.lock`.

1. Update the development checkout from `main`.

   ```bash
   git switch main && git pull --ff-only origin main
   ```

2. Create and push a non-`main` branch from the exact commit or feature branch to inspect, or intentionally reuse an existing non-`main` staging branch.

   ```bash
   git switch -c staging-featureX <commit-or-feature-branch>
   git push -u origin staging-featureX
   ```

3. Edit only the changed values in `.qa-staging/staging.env`.
   Set `QA_BRANCH=staging-featureX` or the reused branch name.
   `QA_PUBLIC_URL` and the three `CANEGUARD_*_PASSWORD` values usually stay unchanged.
   If `.qa-staging/worktree` is on another branch, confirm that it has no local changes and re-point it before running staging.

   ```bash
   git -C .qa-staging/worktree status --short --branch
   git -C .qa-staging/worktree switch staging-featureX
   ```

   The launcher verifies an existing worktree but does not silently move it to another branch.
   If the worktree does not exist, run `npm run staging -- checkout`.
   If the worktree was recreated, install dependencies with the Step 4 commands before continuing.
   If the branch changed `package.json`, `package-lock.json`, `api/composer.json`, or `api/composer.lock`, refresh dependencies in the existing worktree.

   ```bash
   cd .qa-staging/worktree
   npm ci --ignore-scripts --no-audit --no-fund
   composer install --working-dir=api --no-interaction --no-progress --prefer-dist
   cd ../..
   ```

4. Run the one-command staging cycle.

   ```bash
   npm run staging
   ```

   The command verifies or adds the configured worktree, runs `migrate:fresh --seed`, starts the private services, starts the canonical Funnel, and runs the confidence checks.
   Wait for `CONFIDENCE PASS` before sharing the public URL.

5. Have teammates refresh the browser and the APK at the same unchanged `QA_PUBLIC_URL`.
   Rebuild the APK using Step 6 only when the Mobile code or Mobile environment changed.

6. Stop the cycle when verification is complete.

   ```bash
   npm run staging -- stop
   ```

The database remains available after `stop`.
The next plain `npm run staging` is the deliberate reset and reseed for the next round.

## 1. Prerequisites

The staging host needs the following tools and services.

- Git with access to the private `caneguard-web` repository.
- Node.js and npm compatible with the checked-in lockfile.
- PHP 8.3 or newer, Composer, and the PHP PDO MySQL driver.
- A local MySQL server listening on `127.0.0.1:3306`.
- The Tailscale CLI with MagicDNS, HTTPS certificates, and Funnel enabled.
- The Expo EAS CLI and an authenticated Expo account when an Android APK is needed.

Run the following checks after installing missing tools.

```bash
command -v git node npm php composer mysqladmin tailscale eas
git --version
node -v
npm -v
php -v
composer --version
mysqladmin --version
tailscale version
eas --version
```

Do not install tools into the repository.
Do not copy a development `.env` or `api/.env` into the staging worktree.

## 2. One-time host setup

Run these steps once on each staging host.

### 2.1 Give the Tailscale CLI Funnel permission

```bash
sudo tailscale set --operator="$USER"
```

Confirm that the command completes for the user who will run `npm run staging`.
The staging launcher exposes only the private Web listener through Funnel.
It never exposes the Laravel API or MySQL port through Funnel.

### 2.2 Create the isolated staging database

Use a local MySQL administrator account to create the database and staging user.
Choose a new local password for `caneguard_app` and put that password in `.qa-staging/staging.env` as `DB_PASSWORD`.
Do not grant the staging account access to the normal development database.

```sql
CREATE DATABASE IF NOT EXISTS `caneguard_staging`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'caneguard_app'@'127.0.0.1'
  IDENTIFIED BY '<staging-db-password>';
GRANT ALL PRIVILEGES ON `caneguard_staging`.*
  TO 'caneguard_app'@'127.0.0.1';
FLUSH PRIVILEGES;
```

Test the account with the same host, port, username, and password that will go into the staging configuration.

```bash
mysqladmin ping -h 127.0.0.1 -P 3306 -u caneguard_app -p
```

### 2.3 Install and authenticate EAS CLI

Install the EAS CLI when `eas --version` is not available.

```bash
npm install --global eas-cli
eas login
eas whoami
```

Use the Expo account that owns or can access the Mobile project's EAS project.
Do not put an Expo token in a repository file or command example.

## 3. Create the Web `.qa-staging/staging.env`

Run this command from the Web repository root.

```bash
npm run staging -- init
chmod 600 .qa-staging/staging.env
```

The initializer creates the ignored `.qa-staging/staging.env` from the checked-in example and generates a staging-only Laravel `APP_KEY`.
It refuses to overwrite an existing file.
Edit the file in place and keep it private.
The launcher reads this file as the only staging runtime source and never falls back to a development `.env`.

Use `tailscale status --json` to find the public host.
The value is `Self.DNSName` without its trailing dot.

```bash
tailscale status --json
```

Fill every value in the table below.
Keep the literal values shown for fixed safety settings.
Replace angle-bracket values with local values and never commit the file.

| Key | Value or source |
| --- | --- |
| `QA_BRANCH` | The manually pushed non-`main` branch to inspect, such as `staging`. |
| `QA_WORKTREE_PATH` | Keep `.qa-staging/worktree`. |
| `QA_API_HOST` | Keep `127.0.0.1`. |
| `QA_API_PORT` | Keep `18000`, unless the host has a documented local port conflict. |
| `QA_API_URL` | Keep `http://127.0.0.1:18000`. |
| `QA_WEB_HOST` | Keep `127.0.0.1`. |
| `QA_WEB_PORT` | Keep `15173`, unless the host has a documented local port conflict. |
| `QA_WEB_URL` | The HTTPS Tailscale Funnel origin, including `https://` and no trailing slash. |
| `QA_PUBLIC_URL` | The same exact origin as `QA_WEB_URL`. |
| `QA_FUNNEL_PORT` | Keep `443` for the canonical HTTPS Funnel. |
| `APP_NAME` | Keep `CaneGuard`. |
| `APP_ENV` | Keep `qa-staging`. |
| `APP_KEY` | Leave the generated `base64:` value from `staging -- init`. Do not reuse another environment's key. |
| `APP_DEBUG` | Keep `false`. |
| `APP_MAINTENANCE_DRIVER` | Keep `file`. |
| `APP_MAINTENANCE_STORE` | Keep `database`. |
| `APP_URL` | The same exact value as `QA_PUBLIC_URL`. |
| `FRONTEND_URL` | The same exact value as `QA_PUBLIC_URL`. |
| `CORS_ALLOWED_ORIGINS` | The same exact value as `QA_PUBLIC_URL`. |
| `SANCTUM_STATEFUL_DOMAINS` | The host from `QA_PUBLIC_URL` only, such as `device.tailnet.ts.net`. |
| `APP_LOCALE` | Keep `en`. |
| `APP_FALLBACK_LOCALE` | Keep `en`. |
| `APP_FAKER_LOCALE` | Keep `en_US`. |
| `BCRYPT_ROUNDS` | Keep `12`. |
| `LOG_CHANNEL` | Keep `stack`. |
| `LOG_STACK` | Keep `single`. |
| `LOG_LEVEL` | Keep `debug` for local staging diagnosis. |
| `DB_CONNECTION` | Keep `mysql`. |
| `DB_HOST` | Keep `127.0.0.1`. |
| `DB_PORT` | Keep `3306`. |
| `DB_DATABASE` | Keep exactly `caneguard_staging`. |
| `DB_USERNAME` | Keep `caneguard_app`, matching the local MySQL grant. |
| `DB_PASSWORD` | The local password chosen for the `caneguard_app` grant. |
| `DB_URL` | Keep empty. |
| `DB_CHARSET` | Keep `utf8mb4`. |
| `DB_COLLATION` | Keep `utf8mb4_unicode_ci`. |
| `DB_TIMEZONE` | Keep `+00:00`. |
| `SESSION_DRIVER` | Keep `database`. |
| `SESSION_LIFETIME` | Keep `120`. |
| `SESSION_ENCRYPT` | Keep `false`. |
| `SESSION_PATH` | Keep `/`. |
| `SESSION_DOMAIN` | Keep empty so the public origin receives a host-only cookie. |
| `SESSION_SECURE_COOKIE` | Keep `true`. |
| `SESSION_HTTP_ONLY` | Keep `true`. |
| `SESSION_SAME_SITE` | Keep `lax`. |
| `BROADCAST_CONNECTION` | Keep `log`. |
| `FILESYSTEM_DISK` | Keep `local`. |
| `QUEUE_CONNECTION` | Keep `database`. |
| `CACHE_STORE` | Keep `database`. |
| `MAIL_MAILER` | Keep `log`. |
| `CANEGUARD_FIELD_PASSWORD` | A local password you choose for `field@caneguard.test`. |
| `CANEGUARD_REVIEWER_PASSWORD` | A local password you choose for `mao@caneguard.test`. |
| `CANEGUARD_ADMIN_PASSWORD` | A local password you choose for `admin@caneguard.test`. |
| `VITE_API_BASE_URL` | The same exact value as `QA_PUBLIC_URL`. Browser API paths use the Web proxy to reach the private API. |
| `VITE_DATA_SOURCE` | Keep `api`. |
| `VITE_REPORT_REFRESH_MS` | Keep `600000`. |
| `VITE_MAPTILER_KEY` | Keep empty when no MapTiler key is available. The map page shows its accessible provider fallback. |

The public-origin values must all match exactly.
The API and Web hosts must remain `127.0.0.1`.
The database must remain `caneguard_staging`.
The three `CANEGUARD_*_PASSWORD` values are local secrets that you choose and share only through an approved private channel.

## 4. Prepare Web worktree dependencies

The staging launcher uses `.qa-staging/worktree` and does not silently install dependencies.
The selected branch must already exist locally or as `origin/<QA_BRANCH>` before checkout.
If the branch is not available yet, complete Step 7 and then return here.

```bash
npm run staging -- checkout
cd .qa-staging/worktree
npm ci --ignore-scripts --no-audit --no-fund
composer install --working-dir=api --no-interaction --no-progress --prefer-dist
cd ../..
```

Do not copy development `.env` files into this worktree.
The launcher rejects `.env`, `.env.local`, and `api/.env` files in the staging worktree.
The launcher checks for both `node_modules` and `api/vendor/autoload.php` before a reset or service start.

## 5. Configure Mobile `.env.qa.local`

In the companion `caneguard-mobile` repository, create or update the ignored `.env.qa.local` file.
Use the exact same public origin as Web `QA_PUBLIC_URL`.
Do not use the private API URL, `localhost`, or `127.0.0.1` in the APK.

```dotenv
EXPO_PUBLIC_API_BASE_URL=https://device.tailnet.ts.net
EXPO_PUBLIC_QA_MODE=true
```

Replace the example origin with the value from `.qa-staging/staging.env`.
Keep `EXPO_PUBLIC_QA_MODE=true` for the QA build.

## 6. Build the EAS QA Android APK

Run these commands from the companion `caneguard-mobile` repository.

First confirm that `eas.json` contains the Mobile repository's `build.qa` profile.
The profile must produce an Android APK for internal QA and use the repository's existing `qa` channel and Preview EAS environment.
Do not create a second profile or change the Web repository to add EAS configuration.

```bash
cat eas.json
eas build --profile qa --platform android
```

Follow the EAS prompts if the project has not been linked on this host.
The build command prints a build details URL and the build identifier when it is submitted.
The Expo dashboard build details page shows the same build ID and the Android artifact or install URL after the build completes.
You can list recent builds if the terminal output is no longer available.

```bash
eas build:list --platform android --limit 1
```

Use the build details page or `eas build:view <build-id>` to retrieve the build ID and `artifactUrl` or APK artifact link.
The simple Web staging launcher does not require an EAS evidence JSON file or build ID to reach `CONFIDENCE PASS`.
The build ID and artifact URL are needed when installing the APK for teammate verification.

Install the resulting APK on the QA device using the Mobile repository's normal installation procedure.
Open the APK only after the Web staging Funnel is running.

## 7. Create and push the manual staging branch

Create the branch from the exact Web/API commit to inspect.
For the latest `main`, use the requested `staging` branch command.

```bash
git switch main
git pull --ff-only origin main
git switch -c staging main && git push -u origin staging
```

If `staging` already exists, switch to it and confirm that it points at the intended commit instead of creating it again.

```bash
git switch staging
git log -1 --oneline
```

Set `QA_BRANCH=staging` in `.qa-staging/staging.env` and rerun the Step 4 checkout and dependency commands if the branch was not available earlier.
Do not set `QA_BRANCH` to `main` or `master`.
Do not let the staging launcher create, move, or freeze a branch.

## 8. Run staging, verify both clients, and stop

From the Web repository root, run the one-command workflow.

```bash
npm run staging
```

The workflow verifies the selected branch, preserves the staging worktree's `.gitignore`, resets and seeds only `caneguard_staging`, starts Laravel on `127.0.0.1:18000`, starts Vite on `127.0.0.1:15173`, and exposes only the Web listener through Tailscale Funnel.
It then runs private health and seeded-data checks, public Funnel and mobile API checks, and automated Web, API, and upload-contract checks.

A successful run ends with a line like this.

```text
[staging] CONFIDENCE PASS: staging is ready at https://device.tailnet.ts.net.
```

The Web check runs its tests and build with deterministic local test defaults, including an empty `VITE_MAPTILER_KEY` and `http://localhost:8000` as the test API base.
The running staging Web service still uses the public `VITE_API_BASE_URL` from `.qa-staging/staging.env`.
This separation keeps the confidence tests from making real requests to the Funnel while preserving the real staging runtime.

If `api/vendor/autoload.php` is missing, the command stops before PHP starts and prints an actionable dependency message.
Run the printed checkout, `npm ci`, and Composer commands in `.qa-staging/worktree`, then rerun `npm run staging`.
Do not diagnose a missing vendor directory from a raw PHP require stack.

After the pass line, open the exact `QA_PUBLIC_URL` in a browser and install or open the EAS QA APK against that same origin.
Use the Web browser for reviewer and administrator login.
Use the APK for field reporter login, report upload, and status synchronization.
Keep all teammates on the public HTTPS origin and never send them the private API URL or staging database credentials.

When verification is complete, stop Funnel and both services without deleting the staging database.

```bash
npm run staging -- stop
```

The stop command retains the `caneguard_staging` schema, seeded rows, and uploaded files for diagnosis.
The next plain `npm run staging` is the explicit destructive boundary because it resets and reseeds that database.

## 9. Troubleshooting

### The preflight tool check fails

Start Tailscale and MySQL manually, then rerun `tailscale status`, `tailscale dns status`, and `mysqladmin ping`.
Install missing tools on the host and confirm their versions with the commands in Step 1.
Do not install tools by modifying this repository.

### The staging configuration is missing or rejected

Run `npm run staging -- init` only when `.qa-staging/staging.env` does not exist.
Fill every blank value and replace every placeholder.
Keep the file mode at `600`.
Confirm that `QA_PUBLIC_URL`, `QA_WEB_URL`, `APP_URL`, `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS`, and `VITE_API_BASE_URL` are identical.
Confirm that `SANCTUM_STATEFUL_DOMAINS` contains the public host.
Never copy a development `.env` into the staging worktree.

### The branch or worktree does not match

Inspect the selected branch and worktree.

```bash
npm run staging -- status
git -C .qa-staging/worktree branch --show-current
git -C .qa-staging/worktree log -1 --oneline
```

Update `QA_BRANCH` to the manually pushed branch and repair an incorrect worktree explicitly before retrying.
The launcher refuses to move an existing worktree to a different branch.

### Dependencies are missing

The launcher stops before running PHP when either `node_modules` or `api/vendor/autoload.php` is absent.
Run the following commands from the Web repository root.

```bash
npm run staging -- checkout
cd .qa-staging/worktree
npm ci --ignore-scripts --no-audit --no-fund
composer install --working-dir=api --no-interaction --no-progress --prefer-dist
cd ../..
npm run staging
```

The launcher never installs or updates dependencies automatically.

### Funnel will not start

Confirm that the one-time operator command has completed for the current user.

```bash
sudo tailscale set --operator="$USER"
tailscale status
tailscale funnel status
```

Confirm that Funnel is enabled for the tailnet and that `QA_FUNNEL_PORT=443`.
Confirm that the Web service is reachable at `127.0.0.1:15173`.
The launcher exposes only that Web listener and never the API or MySQL port.

### A service or confidence check fails

A failed confidence check leaves the services and Funnel running for investigation.
Inspect the ignored logs without sharing their contents.

```bash
tail -n 80 .qa-staging/logs/api.log
tail -n 80 .qa-staging/logs/web.log
curl --fail http://127.0.0.1:18000/api/health
curl --fail "${QA_PUBLIC_URL}/api/health"
```

Run `npm run staging -- ready` for private checks or `npm run staging -- public-ready` for public checks after correcting the issue.
Use `npm run staging -- stop` when the session is no longer needed.

### The map provider is not configured

An empty `VITE_MAPTILER_KEY` intentionally renders the accessible map fallback and leaves the report table and validation queue available.
The Web confidence check also forces an empty map key so the test suite does not depend on a real MapTiler credential.
A map provider key is not required for `CONFIDENCE PASS`.

### The APK cannot connect

Confirm that the APK was built after `.env.qa.local` was updated.
Confirm that `EXPO_PUBLIC_API_BASE_URL` is the exact HTTPS Funnel origin.
Confirm that it is not the private API URL, `localhost`, an old Tailscale hostname, or a URL with a trailing path.
Confirm that the Web browser and APK use the same public origin.
Confirm that Funnel targets `127.0.0.1:15173`.

### Stop retains data

`npm run staging -- stop` stops Funnel and services without deleting `caneguard_staging`.
Use the next plain `npm run staging` only when you intend to reset and reseed that isolated database.

## Retired workflow names

`qa:open`, `qa:close`, and `qa:reconcile` remain only as explicitly named legacy scripts for old local automation.
They are not part of the simple staging workflow and do not create evidence records or device gates.
Use this document and `npm run staging` for new staging sessions.
