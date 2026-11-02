# Project Verification Commands

## Fast checks

- lint: `npm run lint`
- typecheck/static analysis: `npm run typecheck`
- focused frontend test: `npm test -- --run <test-file>`
- auth/RBAC documentation consistency: `npm run test:auth-doc-consistency`
- agent-facing fast gate: `npm run verify:fast`

`verify:fast` delegates to `npm run check:web`, which runs ESLint, TypeScript, Vitest with React Testing Library and MSW coverage, the Vite source-safety test, the security dependency checks, and the production build. It is the deterministic gate; live browser verification is a separate required step under the live browser verification section below.

Iteration loop: run the focused test for the changed claim while iterating; warm-up runs are not evidence requirements.

## Backend/API checks

- Laravel PHPUnit/Feature suite and formatting: `npm run check:api`
- MySQL integration suite: `npm run api:test:mysql`
- agent-facing backend gate: `npm run verify:backend`

`verify:backend` composes `npm run check:api` and `npm run api:test:mysql`. The MySQL suite requires a disposable, migrated `firstmate_` database without application seed data; its tests create their own fixtures. The local PHPUnit default is `firstmate_cg_test`; the pull-request workflow provisions an isolated `firstmate_ci_mysql` service and migrates it before running the suite.

## Contract checks

- consumer-only artifact, helper, and Laravel boundary gate: `npm run verify:contract:consumer`
- full local and cross-repository producer gate: `npm run verify:contract`

`verify:contract:consumer` validates Web-owned artifacts, gate configuration, helper tests, and Laravel consumers. It does not check out Mobile or use a private token, so it is safe in pull-request workflows.

`verify:contract` delegates to `contract:gate` and also runs Mobile producer suites. It requires a clean checkout of the exact pinned Mobile revision through `MOBILE_REPO_DIR` and the matching `MOBILE_REF`; the private checkout and token are reserved for the trusted main-branch workflow. See [the contract gate guide](docs/testing/mobile-report-upload-contract-gate.md).

## Adaptive validation tiers

Record the selected tier in exactly one line in the report and task status, such as `Tier: T1-fast` or `Tier: T3-high-stakes`.

- **T0 — Docs-only:** Markdown (`*.md`), `docs/**`, or documentation comments only. Confirm the documentation owner and run `git diff --check`; no Markdown linter is configured. No test suite or browser check is needed because no runtime behavior changed (~10s).
- **T1 — Fast lane:** Copy, non-critical configuration, styling, or dead-code changes. Run `npm run lint && npm run typecheck && npm test -- --run <test-file>`. No live browser check unless the change is user-visible (~45s).
- **T2 — Feature:** Standard non-critical behavior. Run `npm run verify:fast`; run the live browser verification below when user-visible UI or a live HTTP contract changed (~2–4m).
- **T3 — High-stakes:** Authentication, authorization, database migrations, critical API contracts, or other protected paths. Run `npm run verify:fast && npm run verify:backend && npm run verify:contract:consumer`, then conduct isolated adversarial review. Human-owned tests remain the sole proof for T3 generally. For API, migration, and contract-gate suites, secondmate-blessed tests are also sole proof; worker-written tests remain supplemental until secondmate blessing is recorded. Frozen golden suites are immutable: do not edit, weaken, delete, skip, or rebaseline them without explicit captain sign-off. The [frozen Phase 1 test-authority matrix](https://github.com/niks0501/caneguard-web/pull/286) records the golden claims. No private Mobile checkout is used in pull requests; producer checks run only in the trusted main-branch workflow (~8–15m).

The pull-request quality gate runs `npm run check:web`, `npm run check:api`, `npm run api:test:mysql` against an isolated migrated MySQL service with no demo seed data, and `npm run verify:contract:consumer`.

## Broader checks

- local Web, SQLite API, formatting, and Graphify gate: `npm run check:all` (does not include MySQL or contract checks)
  - Before running it, generate local Graphify artifacts with `npm run graphify:refresh`; `graphify-out/` is ignored and stays local.
- Live browser verification: see the section below; the repository defines no scripted E2E suite, so `chrome-devtools-axi` is the browser tooling.

## Live browser verification

Run this during validation, after the deterministic gate passes, whenever user-visible UI or a live HTTP contract changed.

1. Start the API per `README.md` with isolated `firstmate_` data, and serve the Web app with `npm run dev -- --host localhost --port <free-port> --strictPort`; keep one `localhost` origin for cookies and CSRF.
2. Drive the changed flow with `chrome-devtools-axi` (`open`, `snapshot`, `screenshot`, `console`, `network`; check `--help` for the installed version).
3. Record revision, commands, and actual evidence; unavailable required evidence is inconclusive and a defect is a no-go.

Browser evidence cannot prove Mobile native behavior; backend-only changes need no browser. Full-system workflow checks follow the P0F acceptance documentation after fast, backend, and contract checks pass.

## Database checks

- schema/integration validation: `npm run api:test:mysql`
- migration dry-run or safe check: no repository command is defined
- database test strategy: run Laravel Feature tests against in-memory SQLite; run the MySQL suite only against a disposable, migrated, unseeded database with a `firstmate_` prefix

## Rules

- Use the strict verification ladder in `.agents/skills/verification/SKILL.md`.
- Local gate: run `npm run verify:fast` without re-running the focused test beforehand; then run affected backend or consumer-contract checks. The pull-request quality gate also runs the full MySQL suite and consumer-only contract gate listed above.
- `npm run verify:fast` stays the deterministic gate; run live browser verification alongside it, not instead of it.
- Run only commands that exist in `package.json` or repository scripts.
- Do not run destructive migrations against shared or production data.
