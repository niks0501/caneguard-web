# CaneGuard Monorepo Implementation Board

This board tracks the phase gates in the CaneGuard Web monorepo plan. A phase
is marked complete only after its required automated checks pass.

## Phase cards

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Baseline and scope lock | Complete |
| 1 | Create Laravel inside the existing repository | Complete |
| 2 | MySQL report API and storage | Complete |
| 3 | Web API infrastructure | Complete |
| 4 | Authentication and protected routes | Complete |
| 5 | Dashboard overview | Complete |
| 6 | Submitted reports list | Complete |
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

## Phase 3 web API infrastructure

- Axios is configured for Laravel's credentialed XSRF flow, with normalized
  API errors and no low-level redirects.
- Zod schemas validate environment, user, dashboard, report, pagination,
  review, and error boundaries before snake-case DTOs are mapped to the
  camel-case web domain.
- API and mock report/dashboard repositories are selected explicitly through
  `VITE_DATA_SOURCE`, with API mode as the default.
- TanStack Query providers, stable keys, hooks, devtools, and query-cache
  invalidation replace page-level repository calls.
- Vitest, Testing Library, jsdom, and MSW cover configuration, schemas,
  mappers, pagination, repository selection, API requests, and the mock-mode
  report workflow.

### Phase 3 verification

- `npm run check:web`: passed; 9 frontend test files, 19 tests, plus lint,
  typecheck, and production build
- `VITE_DATA_SOURCE=mock npm run build`: passed
- `npm run check:all`: passed; 31 Laravel tests, 161 assertions
- `just verify-targeted`: passed
- Local commit: `3bce8a2 feat: add web API data infrastructure`

## Phase 4 authentication and protected routes

- Sanctum SPA authentication follows CSRF cookie, login, and authenticated-user
  restoration requests without browser token storage.
- Login regenerates sessions, logout invalidates sessions and rotates CSRF,
  and reviewer/admin role checks are enforced on the server.
- Login attempts are rate-limited by normalized email and IP, and auth-route
  401, 419, and 429 responses use canonical non-leaking error envelopes.
- React protected routes preserve internal destinations, distinguish network
  restoration errors from confirmed logout, clear sensitive query state on
  expiration/logout, and handle both 401 and 419 session expiration once.
- The login screen supports keyboard submission, password visibility, invalid
  credentials, access denial, throttling, service failure, and restored paths.
- Independent security review approved the corrected implementation with no
  unresolved actionable findings.

### Phase 4 verification

- `npm run check:all`: passed; 11 frontend test files, 32 tests, and 37 Laravel
  tests with 196 assertions
- `just verify-full`: passed lint, typecheck, tests, build, Gitleaks, and Trivy;
  tracked npm and Composer lockfiles reported zero vulnerabilities
- `api/vendor/bin/pint --test`: passed
- Route audit confirmed throttled login, authenticated logout, and Sanctum
  protected `/api/v1/me`
- Local commit: `cac95ac feat: add Sanctum web authentication`

## Phase 5 dashboard overview

- `/dashboard` is the protected default route and uses the dashboard summary
  repository/query boundary.
- Primary and secondary totals, last-refresh time, refresh action, full-queue
  link, and five latest reports use decision-support language.
- Loading, cached refresh failure, empty, server error, and access-denied states
  are implemented and tested.
- Recent report actions route by server UUID while displaying the human
  reference code.

### Phase 5 verification

- `npm run check:all`: passed; 12 frontend test files, 38 tests, and 37 Laravel
  tests with 196 assertions
- `just verify-targeted`: passed
- `git diff --check`: passed

## Phase 6 submitted reports list

- `/reports` derives page, search, status, possible result, barangay, date range,
  and sort state from the URL; filter changes reset the server page.
- Laravel/MySQL performs filtering, sorting, and pagination. The browser
  requests 15 rows at a time and renders Laravel pagination metadata.
- The report list contract now returns the true capture timestamp and a
  policy-protected evidence URL. Evidence is stored on the private disk and is
  never served through Laravel's public storage link.
- The idempotent `reports:secure-images` rollout command copies and checksum
  verifies legacy images before optional public-copy and exact-target symlink
  removal. Maintenance-mode deployment and rollback steps are documented.
- Refresh invalidates only the exact current queue query. Cached data remains
  visible for ordinary refresh failures, but is suppressed immediately for
  invalid URL state or revoked access.
- First load, background refresh, empty database, no filter match, invalid
  query, access denial, unavailable service, and malformed payload states are
  distinct and tested.
- SQL search treats `%`, `_`, and the escape character literally. Large
  pagination ranges are bounded in the UI and expose a named navigation
  landmark.
- Independent high-risk review approved the settled diff with no unresolved
  actionable findings.

### Phase 6 verification

- `npm run check:all`: passed; 15 frontend test files, 57 tests, and 43 Laravel
  tests with 235 assertions
- `just verify-full`: passed lint, typecheck, tests, build, Gitleaks, and Trivy;
  tracked npm and Composer lockfiles reported zero vulnerabilities
- `api/vendor/bin/pint --test`: passed
- `git diff --check`: passed
- Graphify was updated after the final code changes
- The 12 local seeded images were copied to private storage and SHA-256
  verified; the legacy web symlink was moved to a recoverable `/tmp` backup
- Live MySQL migration-command verification remains unavailable because the
  local MySQL service was stopped; the command failed safely without removal
