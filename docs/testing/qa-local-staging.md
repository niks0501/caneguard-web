# Deterministic local QA staging

This procedure runs a selected `qa/*` Web/API candidate in an ignored Git worktree with ports and runtime configuration separate from normal development.

Tailscale Funnel is the canonical public HTTPS ingress for QA.
It exposes only the local Web port, while Vite proxies the API and authentication paths to the private Laravel port.
The browser therefore uses one public origin for the Web application, health endpoint, and authenticated API behavior.

The procedure never reads the development `.env` or `api/.env` as a fallback.
The persistent ignored file `.qa-staging/staging.env` is the runtime source of truth for the candidate, private service target, public origin, database connection, and seeded credentials.
Never commit that file or copy real credentials into the repository.

## One-time host setup

The host needs Git, Node.js and npm, PHP 8.3 or newer, Composer, a PHP MySQL driver, a MySQL server reachable at `127.0.0.1:3306`, and the Tailscale CLI.

The Tailscale account must have HTTPS certificates, MagicDNS, and Funnel permission enabled for the QA machine.
Funnel uses the machine's `*.ts.net` hostname and listens on the configured public HTTPS port, normally `443`.
The public Funnel URL is intentionally operator-supplied because it is specific to the machine and tailnet.

The launcher uses this canonical command shape through `public-start`:

```bash
tailscale funnel --bg --https=443 127.0.0.1:15173
```

Do not expose the Laravel API port or MySQL port through Funnel.
The Web server is the only public target.

Create the isolated database and grant the local application account access from a MySQL administrative session.
Use the same password in `.qa-staging/staging.env`.

```sql
CREATE DATABASE IF NOT EXISTS `caneguard_staging`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON `caneguard_staging`.*
  TO 'caneguard_app'@'127.0.0.1';
FLUSH PRIVILEGES;
```

If the `caneguard_app` account does not exist, create it through the local MySQL administration process before granting the database privilege.
Do not grant the staging account access to the normal development database as part of this procedure.

Create the ignored persistent configuration once from the repository root.

```bash
npm run qa:staging -- init
```

Edit `.qa-staging/staging.env` and set `QA_BRANCH` to the candidate branch, replace the `QA_PUBLIC_URL` and matching public-origin values with the machine's Tailscale Funnel URL, set `SANCTUM_STATEFUL_DOMAINS` to that URL's host, set the staging MySQL password, and set all three `CANEGUARD_*_PASSWORD` values.
Keep `QA_API_URL` as the private `http://127.0.0.1:18000` target.
Keep `QA_WEB_HOST` and `QA_API_HOST` bound to `127.0.0.1`.
Keep `SESSION_DOMAIN` empty so the public HTTPS host receives a host-only session cookie.
The initializer creates a private Laravel `APP_KEY`, but all blank values still require operator input.
The launcher refuses to start when any required value is blank, uses a placeholder, exposes a service binding, uses a non-MySQL connection, or names a database other than `caneguard_staging`.

Install dependencies in the dedicated worktree after it is created.
This keeps dependency trees independent from normal development.

```bash
npm run qa:staging -- checkout
cd .qa-staging/worktree
npm ci
composer install --working-dir=api
cd ../..
```

The checkout command accepts a local `qa/*` branch or an already fetched `origin/qa/*` branch.
It refuses to create a worktree for another branch name and never replaces an existing worktree that is on the wrong branch.

## Start a new QA cycle

A cycle is the destructive boundary for staging data.
It stops the QA services, clears the candidate's private staging storage and cached Laravel configuration, runs `migrate:fresh --seed --force` against exactly `caneguard_staging`, and starts the API and Web services on the staging ports.
The existing migrations and the existing `DatabaseSeeder` and `ReportSeeder` are the only schema and fixture sources.

```bash
npm run qa:staging -- cycle
```

The deterministic seed includes the existing Field Reporter, Reviewer, and Administrator accounts and twelve representative report fixtures.
The seeded image remains the existing synthetic fixture and is not diagnostic ground truth.
The cycle does not run against `caneguard`, `caneguard_test`, or any database named by the development `.env`.
It clears only the private storage directory inside the selected QA worktree.

The default staging endpoints are:

- Private Web listener: `http://127.0.0.1:15173`
- Private Laravel API target: `http://127.0.0.1:18000`
- Public Web and API origin: the configured `QA_PUBLIC_URL`
- Public API health: `${QA_PUBLIC_URL}/api/health`

The cycle waits for private readiness checks before reporting success.
It does not enable public ingress.

## Readiness and operation

Run the private readiness check independently when services are already running.

```bash
npm run qa:staging -- ready
```

Private readiness verifies all of the following without printing passwords or tokens:

- The API health endpoint returns `ok` with ready database and storage checks.
- The Field Reporter can obtain and use a seeded mobile bearer session.
- The Reviewer and Administrator can obtain and use seeded Web sessions.
- The authenticated dashboard contains twelve seeded reports and five recent reports.
- The representative seeded report `CG-2026-0001` is available through the authenticated report API.

Start the canonical public ingress after a successful cycle or start command.
The command enables Funnel for the private Web listener and then runs the full smoke check through `QA_PUBLIC_URL`.

```bash
npm run qa:staging -- public-start
```

Public readiness verifies the same health, seeded mobile authentication, Reviewer and Administrator Web sessions, dashboard data, and representative report through the Funnel URL.
It includes a seeded Web login and authenticated `/api/v1/me` request through the public origin.
Run it again without changing ingress when an explicit smoke check is needed.

```bash
npm run qa:staging -- public-ready
```

Use `QA_PUBLIC_URL` for browser QA and for manual checks.
Do not use the private API URL in browser configuration.
The API and Web processes are launched from the selected worktree, so normal development processes and their ports remain unaffected.

A cycle can be resumed without discarding data by starting the services without the reset step.

```bash
npm run qa:staging -- start
```

Use `status` to inspect the selected candidate and service state without exposing secrets.

```bash
npm run qa:staging -- status
```

## Stop and next cycle

Stop public ingress and services when QA is finished.

```bash
npm run qa:staging -- stop
```

`stop` disables only the Tailscale Funnel configuration tracked by `public-start`, verifies the current Funnel target and service process identities before terminating them, removes local PID state, and leaves `caneguard_staging`, its schema, and its data intact.
If state is stale or an identity cannot be verified, the launcher refuses to signal the process or Funnel and keeps the state for operator repair.
Use `public-stop` when the Funnel should stop while the staging services remain available privately.
The next `cycle` is the explicit point where prior staging data is discarded and recreated.

For an operational fallback, another HTTPS tunnel may target the same private Web listener and use the configured `QA_PUBLIC_URL`.
It must preserve the one-origin Web proxy boundary and must never expose Laravel or MySQL directly.
Such a tunnel is deliberately not automated or canonical; Tailscale Funnel remains the supported QA ingress.

The ignored `.qa-staging` directory contains the persistent credentials, worktree, logs, and service state, including the tracked Funnel state while public ingress is enabled.
Do not delete or share it as part of ordinary cleanup.
