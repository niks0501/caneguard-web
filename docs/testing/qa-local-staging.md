# Deterministic local QA staging

This procedure runs a selected `qa/*` Web/API candidate in an ignored Git worktree with ports and runtime configuration separate from normal development.

The procedure never reads the development `.env` or `api/.env` as a fallback.
The persistent ignored file `.qa-staging/staging.env` is the runtime source of truth for the candidate, service URLs, database connection, and seeded credentials.
Never commit that file or copy real credentials into the repository.

## One-time host setup

The host needs Git, Node.js and npm, PHP 8.3 or newer, Composer, a PHP MySQL driver, and a MySQL server reachable at `127.0.0.1:3306`.

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

Edit `.qa-staging/staging.env` and set `QA_BRANCH` to the candidate branch, the staging MySQL password, and all three `CANEGUARD_*_PASSWORD` values.
The initializer creates a private Laravel `APP_KEY`, but all blank values still require operator input.
The launcher refuses to start when any required value is blank, uses a placeholder, points at a non-MySQL connection, or names a database other than `caneguard_staging`.

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

The default staging URLs are:

- Web: `http://127.0.0.1:15173`
- API: `http://127.0.0.1:18000`
- API health: `http://127.0.0.1:18000/api/health`

The cycle waits for the readiness checks before reporting success.

## Readiness and operation

Run the readiness check independently when services are already running.

```bash
npm run qa:staging -- ready
```

Readiness verifies all of the following without printing passwords or tokens:

- The API health endpoint returns `ok` with ready database and storage checks.
- The Field Reporter can obtain and use a seeded mobile bearer session.
- The Reviewer and Administrator can obtain and use seeded Web sessions.
- The authenticated dashboard contains twelve seeded reports and five recent reports.
- The representative seeded report `CG-2026-0001` is available through the authenticated report API.

Use the candidate Web URL for browser QA.
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

Stop services when QA is finished.

```bash
npm run qa:staging -- stop
```

`stop` terminates only the API and Web process groups recorded by the QA launcher.
It removes local PID state and leaves `caneguard_staging`, its schema, and its data intact.
The next `cycle` is the explicit point where prior staging data is discarded and recreated.

The ignored `.qa-staging` directory contains the persistent credentials, worktree, logs, and service state.
Do not delete or share it as part of ordinary cleanup.
