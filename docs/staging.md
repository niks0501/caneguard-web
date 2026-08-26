# Simple staging workflow

This is the supported CaneGuard Web/API staging workflow.
It replaces the former coordinated `qa:open`, `qa:close`, `qa:reconcile`, rehearsal, evidence-envelope, and device-state gates.

The development branch remains `main`.
A developer chooses and pushes a separate staging branch, then one command prepares the isolated database, Web/API services, Tailscale Funnel, and confidence checks.
The public URL is the same URL used by the Web browser and the EAS Preview APK.

## Prerequisites

The staging host needs Git, Node.js and npm, PHP 8.3 or newer, Composer, a PHP MySQL driver, a local MySQL server, and the Tailscale CLI.

The Tailscale account must have MagicDNS, HTTPS certificates, and Funnel enabled for the machine.

The staging worktree needs its locked dependencies once after it is first created:

```bash
npm run staging -- checkout
cd .qa-staging/worktree
npm ci --ignore-scripts --no-audit --no-fund
composer install --working-dir=api --no-interaction --no-progress --prefer-dist
cd ../..
```

Do not copy development `.env` or `api/.env` files into the staging worktree.
The launcher rejects those files so that staging cannot silently use development credentials or a development database.

## One-time host setup

Give the Tailscale CLI permission to manage Funnel once for the current user:

```bash
sudo tailscale set --operator="$USER"
```

Create the isolated database from a local MySQL administrator session.
Use the same username and password in `.qa-staging/staging.env`.

```sql
CREATE DATABASE IF NOT EXISTS `caneguard_staging`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON `caneguard_staging`.*
  TO 'caneguard_app'@'127.0.0.1';
FLUSH PRIVILEGES;
```

Do not grant the staging account access to the normal development database.
Do not expose MySQL or the Laravel API through Funnel.

## Web `.qa-staging/staging.env`

Create the ignored configuration once:

```bash
npm run staging -- init
chmod 600 .qa-staging/staging.env
```

Edit `.qa-staging/staging.env` and keep it private.
The file is the only runtime source for staging and must never be committed.

Use these sources for each value:

| Values | What to enter |
| --- | --- |
| `QA_BRANCH` | The manually created and pushed staging branch, such as `qa/2026-08-27-02` or `feature1`. |
| `QA_WORKTREE_PATH` | Keep `.qa-staging/worktree` unless the host has a documented local layout change. |
| `QA_API_HOST`, `QA_WEB_HOST` | Keep `127.0.0.1`. |
| `QA_API_PORT`, `QA_WEB_PORT` | Keep the private ports from the example, normally `18000` and `15173`. |
| `QA_API_URL` | Keep `http://127.0.0.1:18000`. |
| `QA_PUBLIC_URL`, `QA_WEB_URL` | The machine's HTTPS Tailscale Funnel origin, for example `https://device.tailnet.ts.net`. Both values must be identical. |
| `QA_FUNNEL_PORT` | Usually `443`, matching the Funnel command. |
| `APP_KEY` | The initializer generates a staging-only Laravel key. Do not reuse a development or production key. |
| `APP_URL`, `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS`, `VITE_API_BASE_URL` | Copy the complete `QA_PUBLIC_URL`, including `https://` and no trailing path. |
| `SANCTUM_STATEFUL_DOMAINS` | The host from the public URL only, such as `device.tailnet.ts.net`. |
| `DB_CONNECTION`, `DB_HOST`, `DB_PORT`, `DB_DATABASE` | Keep `mysql`, `127.0.0.1`, `3306`, and exactly `caneguard_staging`. |
| `DB_USERNAME`, `DB_PASSWORD` | The local MySQL staging account created above. |
| `CANEGUARD_FIELD_PASSWORD`, `CANEGUARD_REVIEWER_PASSWORD`, `CANEGUARD_ADMIN_PASSWORD` | Local QA passwords for the three seeded accounts. Choose them on the host and share them securely with teammates. |
| `APP_ENV`, `APP_DEBUG`, `VITE_DATA_SOURCE` | Keep `qa-staging`, `false`, and `api`. |
| Session, queue, cache, and filesystem values | Keep the safe values from `staging.env.example`. |

To find the Funnel hostname, inspect the machine identity before filling the file:

```bash
tailscale status --json
```

Use the `Self.DNSName` value without its trailing dot.
After staging starts, `npm run staging -- status` and `tailscale funnel status` confirm the active target.

The launcher validates the public-origin relationships, private bindings, branch name, credentials, and database isolation before it starts.
It never falls back to the development environment.

## Mobile `.env.qa.local` and EAS Preview

In the `caneguard-mobile` checkout, create or update the ignored `.env.qa.local` file:

```dotenv
EXPO_PUBLIC_API_BASE_URL=https://device.tailnet.ts.net
EXPO_PUBLIC_QA_MODE=true
```

Set `EXPO_PUBLIC_API_BASE_URL` to the exact same value as Web `QA_PUBLIC_URL`.
Do not use `http://127.0.0.1:18000` in the APK because a physical device cannot reach the host's loopback interface.

Build the EAS Preview APK using the Mobile repository's existing Preview profile and install it on the QA device.
If the Mobile repository uses the `qa` channel, keep that channel selection unchanged.

EAS build or update evidence is optional in this simple workflow.
No JSON evidence envelope, exact EAS identity, candidate-freeze record, or device-state flag is required to start staging.
The automated confidence suite still exercises the same mobile login and multipart report-upload API exchange through the public Funnel.

## Manual branch creation

Create the staging branch yourself from the exact head or commit you want to inspect.
The command does not create branches, move `main`, or infer a candidate from a moving branch.

For the latest `main`:

```bash
git switch main
git pull --ff-only origin main
git switch -c qa/staging-2026-08-27 main
git push --set-upstream origin qa/staging-2026-08-27
```

For a feature branch or exact commit:

```bash
git switch -c qa/staging-feature1 feature1
git push --set-upstream origin qa/staging-feature1
```

```bash
git switch -c qa/staging-commit <40-character-commit-sha>
git push --set-upstream origin qa/staging-commit
```

Set that pushed branch in `QA_BRANCH` before running staging.
The branch may use a simple name such as `feature1` or a `qa/` name, but `main` and `master` are rejected so development remains separate.

## One-command run

From the Web repository root, run:

```bash
npm run staging
```

The command performs this cycle:

1. Adds or verifies `.qa-staging/worktree` on the configured manual branch.
2. Stops an older Funnel and service session if one is tracked.
3. Clears only the staging worktree's private report storage.
4. Runs `migrate:fresh --seed --force` against exactly `caneguard_staging`.
5. Starts Laravel on `127.0.0.1:18000` and Vite Web on `127.0.0.1:15173`.
6. Starts Tailscale Funnel for the private Web port.
7. Runs the private and public confidence checks.
8. Runs the staging copy's Web lint, typecheck, tests, build, API tests, and upload-contract checks.

The output reports one `PASS` or `FAIL` line for private seeded data, public Funnel plus mobile API exchange, and each automated check.
A failed confidence check returns a non-zero status but leaves the services and Funnel running for investigation instead of acting as a manual gate.
Use the logs and then run `npm run staging -- stop` when finished.

The seeded confidence accounts are:

- Field Reporter: `field@caneguard.test`.
- Reviewer: `mao@caneguard.test`.
- Administrator: `admin@caneguard.test`.

The suite verifies API health, storage and database readiness, mobile authentication, Web authentication for all required roles, twelve seeded reports including `CG-2026-0001`, and an idempotent multipart upload exchange through both the private API and public Funnel.
The upload smoke reuses the first seeded report client UUID, so it does not add a diagnostic report to the seeded dataset.

Use the lower-level commands only for investigation:

```bash
npm run staging -- status
npm run staging -- ready
npm run staging -- public-ready
```

## Teammate access

Send teammates the `QA_PUBLIC_URL` and the QA account credentials through an approved private channel.
They should use the public URL in a browser and the same URL in Mobile `.env.qa.local`.

Teammates must not use the private API port, MySQL credentials, `.qa-staging/staging.env`, service logs, or bearer tokens.
A teammate with the EAS Preview APK can verify login, report upload, and status synchronization against the same Funnel origin while Web reviewers use the browser.

## Stop and retain data

Stop public ingress and services without deleting the database:

```bash
npm run staging -- stop
```

`stop` leaves the `caneguard_staging` schema, seeded rows, and uploaded files in place for forensics.
The next `npm run staging` is the explicit destructive boundary that resets and reseeds that database.
Use `npm run staging -- public-stop` when only Funnel should be disabled while private services remain available.

## Troubleshooting

### Configuration is missing or rejected

Run `npm run staging -- init` only when `.qa-staging/staging.env` does not exist.
Fill every blank value, keep the file mode at `600`, and confirm that all public-origin values match exactly.
Never solve a staging error by copying `api/.env` into the staging worktree.

### The branch or worktree does not match

Check `QA_BRANCH` and inspect the checkout:

```bash
npm run staging -- status
git -C .qa-staging/worktree branch --show-current
git -C .qa-staging/worktree log -1 --oneline
```

Update the branch yourself and push it before retrying.
Do not use `qa:open` to create or freeze a candidate.

### Funnel will not start

Run the one-time operator command again only if the Tailscale operator is not set:

```bash
sudo tailscale set --operator="$USER"
```

Confirm that Funnel is enabled for the tailnet, that `QA_FUNNEL_PORT` is `443`, and that the Web listener is reachable at `127.0.0.1:15173`.
The script exposes only the Web listener and never the API or MySQL port.

### A service or confidence check fails

Inspect the ignored logs without sharing their contents:

```bash
tail -n 80 .qa-staging/logs/api.log
tail -n 80 .qa-staging/logs/web.log
```

Check health directly from the host:

```bash
curl --fail http://127.0.0.1:18000/api/health
curl --fail "${QA_PUBLIC_URL}/api/health"
```

The command retries transient readiness and throttle responses.
A persistent failure is reported as `FAIL` while the staging session remains available for diagnosis.

### The APK cannot connect

Verify that the APK was built after `.env.qa.local` was updated.
Confirm that its API base URL is the exact HTTPS Funnel origin, not the private API URL, `localhost`, or an old device hostname.
Confirm that the Web and API use the same public origin values and that Funnel targets `127.0.0.1:15173`.

### Dependencies are missing

Install dependencies in `.qa-staging/worktree` once using the commands in [Prerequisites](#prerequisites), then rerun `npm run staging`.
The staging command does not silently install or update dependencies.

## Retired workflow names

`qa:open`, `qa:close`, and `qa:reconcile` remain only as explicitly named legacy scripts with deprecation notices for old local automation.
They are not part of the staging workflow and do not create evidence records or device gates.
Use this document and `npm run staging` for all new QA sessions.
