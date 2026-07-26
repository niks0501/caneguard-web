# CaneGuard Monorepo Implementation Board

This board tracks the phase gates in the CaneGuard Web monorepo plan. A phase
is marked complete only after its required automated checks pass.

## Phase cards

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Baseline and scope lock | Complete |
| 1 | Create Laravel inside the existing repository | Complete |
| 2 | MySQL report API and storage | Complete |
| 3 | Web API infrastructure | Not started |
| 4 | Authentication and protected routes | Not started |
| 5 | Dashboard overview | Not started |
| 6 | Submitted reports list | Not started |
| 7 | Report detail, image, and review | Not started |
| 8 | Refresh, errors, and resilience | Not started |
| 9 | Testing, demo, and release | Not started |

## Phase 0 baseline

- Repository: one Git repository on branch `main`
- Baseline commit: `9ef2e499a460ce44d82e45e39ee4517d5c981020`
- Web application: React/Vite remains at the repository root
- API boundary: Laravel will be created only in `api/`
- Database: `caneguard` on MySQL 8.4 LTS
- Local ports: web `5173`, API `8000`, MySQL `3306`
- Scope exclusion: no CaneGuard Mobile implementation

### Existing user work preserved

- `.gitattributes` contains an uncommitted graphify merge-driver entry.
- `.gitignore` contains an uncommitted change that exposes `docs/`.
- `docs/` is untracked and is excluded from implementation commits.

### Tool baseline

- Node dependencies: `npm install` completed with the lockfile unchanged.
- PHP: 8.3.28 through the existing Laragon installation.
- Composer: 2.9.4 through the existing Laragon installation.
- MySQL client and server: 8.4.3 through the existing Laragon installation.
- MySQL reachability: `mysqladmin --host=127.0.0.1 --user=root ping`
  returned `mysqld is alive`.

### Web baseline checks

- `npm run lint`: passed
- `npx --no-install tsc --noEmit`: passed
- `npm run build`: passed

## Phase 1 foundation

- Laravel 13 is installed in `api/` without a nested Git repository.
- Sanctum is installed for stateful web authentication and bearer tokens.
- MySQL databases `caneguard` and `caneguard_test` use the dedicated
  `caneguard_app` account.
- Demo credentials remain only in the ignored `api/.env`; the seeder validates
  all three passwords before writing any users.
- The public `/api/health` endpoint reports database and public-storage
  readiness without returning exception details.
- Credentialed CORS is limited to configured origins and covers the API,
  CSRF-cookie, login, and logout paths.
- The default API development command binds only to `127.0.0.1`, and the
  committed environment example keeps debug output disabled.
- React Router was patched from 8.2.0 to 8.3.0 to clear a high-severity
  advisory found by the required security scan.

### Phase 1 verification

- `npm run check:all`: passed
- `php api/artisan test`: 10 tests passed, 39 assertions
- `api/vendor/bin/pint --test`: passed
- `composer --working-dir=api validate --strict`: passed
- `php api/artisan migrate --force` against `caneguard_test`: four migrations
  ran successfully
- `php api/artisan db:seed --force` against `caneguard_test`: the three expected
  role accounts were created with UUIDs
- `php api/artisan route:list --path=api`: `/api/health` registered
- `just verify-full`: `PASS_WITH_GAPS`; lint, typecheck, build, Gitleaks, and
  Trivy passed, while the harness skipped its root test slot because
  `.harness/project.json` has no test command
- Trivy reported sample Python requirements embedded in Mockery documentation;
  the tracked Composer and npm lockfiles reported zero vulnerabilities

## Phase 2 report API and storage

- MySQL report, class-score, symptom, and quality-warning tables match the
  planned columns, composite keys, foreign keys, indexes, InnoDB engine, and
  `utf8mb4_unicode_ci` collation.
- Report timestamps are stored as UTC `DATETIME`, with millisecond precision
  retained for capture, submission, and review times.
- UUID route binding, reporter/reviewer relationships, factories, and a
  repeat-safe 12-report demonstration seeder are implemented.
- Reviewer/admin web access and field-reporter-only bearer-token endpoints are
  enforced by the report policy.
- Dashboard summary, searchable/filterable/paginated report list, report
  detail, review update, idempotent upload, and cursor-based status sync
  endpoints are available under `/api/v1`.
- Uploads validate real images, write child records in one transaction, recover
  competing reporter/client UUID inserts, remove failed files, and log any
  cleanup failure without masking the original database exception.
- Status sync uses a stable `(updated_at, id)` cursor and a fixed
  `sync_before` boundary to prevent loss or duplication across page ties and
  mid-sync updates.
- API validation, authentication, authorization, missing-resource, rate-limit,
  CSRF, and server failures use non-leaking JSON error shapes.

### Phase 2 verification

- `php api/artisan migrate:fresh --seed` against `caneguard_test`: passed; eight
  migrations and the report seeder completed
- `npm run api:test:mysql`: passed; 1 MySQL schema test, 115 assertions
- `npm run check:all`: passed; 31 Laravel tests, 161 assertions, plus web lint,
  typecheck, and production build
- `api/vendor/bin/pint --test`: passed
- `composer --working-dir=api validate --strict`: passed
- `php api/artisan route:list --path=api/v1`: six planned API routes registered
- Seeded image URL check: HTTP 200, `image/png`, valid 1×1 PNG
- `just verify-full`: `PASS_WITH_GAPS`; lint, typecheck, build, Gitleaks, and
  Trivy passed, while the harness root test slot remains unconfigured
- Independent high-risk review: approved with no unresolved code findings
