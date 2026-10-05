# Railway review-only deployment payload

This branch retains the Apache/Laravel Docker deployment. A PR is **not** launch approval. Ordinary production boots do not seed. The separately approved Nasugbu dashboard demonstration has the narrowly gated bootstrap below; never infer other pilot authority, enable registration/accounts/roster/appendix/sends, or change the database queue to sync to make a deployment appear ready.

## Frontend build inputs

Railway must supply these **during the Docker frontend build**, not only at runtime:

- `VITE_API_BASE_URL`: the approved public HTTPS app origin, without `/api`, credentials, query or fragment. Blank, loopback, private host and HTTP inputs fail before Vite emits a bundle.
- `VITE_DATA_SOURCE=api` (Docker default).
- `VITE_REALTIME_ENABLED=false` (Docker default). Realtime remains closed until separately provisioned.

There is intentionally no hardcoded deployed origin. Local `npm run dev` keeps its localhost default; production builds no longer inherit it. CI uses a reserved `.example.test` origin only to compile and inspect artifacts. It is not deploy configuration.

Example **local proof build**, not a deploy command:

```sh
VITE_API_BASE_URL=https://caneguard.example.test VITE_DATA_SOURCE=api VITE_REALTIME_ENABLED=false npm run build
npm run verify:production-bundle -- dist https://caneguard.example.test
npm run test:railway-runtime
```

Both map entry points explicitly use Vite's bundled MapLibre module worker. `verify:production-bundle` checks that a real worker implementation is emitted and referenced at a same-origin URL, with no missing MapLibre shared-module sibling or development API fallback. This is artifact proof, not WebGL/browser acceptance. No MapTiler key or external basemap authorization is supplied; the existing unconfigured-map state remains honest. The production CSP stays same-origin, not wildcard/provider-open.

## Runtime payload and response policy

The runtime includes the five mobile JSON contracts under `/var/www/docs/contracts/` and the weekly SVG logo under `/var/www/brand/`, matching the existing PHP readers relative to `/var/www/html`. Laravel maps, templates and the lifecycle contract remain inside `api/`. `RailwayPayloadTest` reconstructs the relevant runtime COPY payload in a temporary directory and runs the actual five contract readers with that runtime base path.

`railway/uploads.ini` gives PHP a 12M file / 16M POST budget for the 10 MiB photo contract plus multipart overhead. The Docker build checks the effective PHP ini values; local tests load the same ini. This does not prove the effective settings of a deployed image that has not been built/run.

SPA HTML may load same-origin report preview frames; documents cannot create child frames. Report document embedding stays same-origin and API JSON remains deny-by-default. Weekly HTML styles use the middleware nonce. `ProductionResponsePolicyTest` exercises Laravel's production file response and document/API policy without database access. HTTPS HSTS is covered when Laravel knows a request is secure; actual Railway forwarded-HTTPS, host/cookies and auth-email links still require separately authorized runtime verification.

## Forward migration recovery

Keep the September 18 drift guards and September 24 table-exists guard **with the short index names**. Keep startup's runtime single-prefork enforcement.

The five newer schema migrations and demo-receipt migration use narrow `MigrationReplay` helpers to recover missing columns, indexes and restrictive foreign keys after completed nontransactional MySQL DDL. CREATE replay checks all declared columns and repairs separately emitted constraints; missing declared columns or contradictory existing indexes/FKs fail closed for operator recovery. This is not arbitrary schema reconciliation or a rollback plan. Existing account singleton checks, irreversible expert retirement, credential revocation and retained history are unchanged. Replaying the district migration revokes old credentials again; it never creates district rows, memberships, grants or record attribution.

Focused tests (SQLite in-memory, no seed command):

```sh
cd api
vendor/bin/phpunit tests/Feature/RailwayMigrationReplayTest.php tests/Feature/ProductionResponsePolicyTest.php tests/Unit/RailwayPayloadTest.php
```

Optional real-engine replay proof, **local development only**, uses the existing `FIRSTMATE_DEV_DB_*` credentials:

```sh
CANEGUARD_REPLAY_LOCAL_MYSQL=1 api/vendor/bin/phpunit --configuration api/phpunit.xml api/tests/Feature/RailwayMySqlReplayTest.php
```

That opt-in creates one fresh random `firstmate_caneguard_replay_*` development database, simulates process loss immediately after six MySQL DDL statements, and replays pending migrations. It asserts constraints and empty authority/data tables. It never uses the application's `.env` database, provisions identities, or drops the proof database. Without opt-in it is skipped.

## Approved one-time dashboard demonstration bootstrap

The latest approval is **nasugbu**, existing `admin@caneguard.test` reused as its manager, **membership only**. No `staff:manage`, approval or sending grant is provisioned. The development `DatabaseSeeder` remains unchanged in scope for ordinary local use; startup may invoke only the guarded `RailwayDemoSeeder`.

For this authorized demonstration, the captain must supply at runtime:

- `CANEGUARD_RAILWAY_DEMO_SEED=nasugbu-dashboard-20261006` (exact approval marker; default blank disables seeding).
- `CANEGUARD_PILOT_DISTRICT_CODE=nasugbu`.
- `CANEGUARD_RAILWAY_DEMO_MANAGER_NAME`: the captain-approved manager display name. Personal identity is runtime configuration, not checked into source.
- `CANEGUARD_FIELD_PASSWORD`, `CANEGUARD_REVIEWER_PASSWORD`, `CANEGUARD_ADMIN_PASSWORD`: policy-compliant runtime passphrases; no embedded/default credentials.
- Nondelivering `MAIL_MAILER=log`; accounts, self-registration, roster certification, weekly sends and appendix remain false.

After migrations and before Apache starts, this exact opt-in runs the guarded seeder. Missing inputs, open gates, conflicting demo identities, unreceipted namespace collisions or incomplete receipts fail startup rather than silently delivering an empty or unsafe demo. Newly written private files are re-owned to Apache's runtime user.

The existing development seeders populate all their dummy case/dashboard/analytics/advisory/validation fixtures, but deployment copies use `DEMO-NAS-20261006-` references, isolated UUIDs and separate evidence paths. All pre-existing report/advisory rows and evidence remain untouched, including colliding old fixture references. **Historical district-null reports remain district-null and out of view.** Only the three approved demo account identities can be reused; no inspector roster or named grants are created.

A transactional `railway_demo_seed_runs` receipt makes subsequent boots read-only for seeding: no password reset, monthly refresh, fixture edits or user-history replacement on restart. If SQL seeding fails, data and receipt roll back together; namespaced synthetic files can remain after a failure and are safely reused on retry. There is no destructive cleanup. Disable the approval marker after the demonstration bootstrap; it is not ongoing launch authority.

`RailwayDemoSeederTest` verifies populated dashboard reads with real scoping, existing admin identity reuse, membership-only authority, legacy isolation, closed gates, refusal cases, restart idempotence and transaction failure recovery using private in-memory fixtures. No seed command has been run against a shared/deployed database by this work.

## Remaining captain/office launch gates

This demo approval does not authorize an operational pilot roster, named grants, legacy attribution or general-production credential bootstrap. Separately approve credential invalidation/forward recovery before the deploy click. Sending has no approved worker/provider/from/recipient contract and stays excluded. Privacy/self-registration/accounts/roster/appendix gates stay closed. This worker makes no Railway service/variable/domain/volume changes or shared database writes. The captain must configure the required demonstration inputs and confirm the seeded dataset after his separately authorized deployment. The captain owns the deploy click, public HTTPS/proxy/session/origin configuration and healthcheck choice (`/up` for boot readiness, independently `/api/health` for dependencies).
