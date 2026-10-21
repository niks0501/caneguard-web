# Project Verification Commands

## Fast checks

- lint: `npm run lint`
- typecheck/static analysis: `npm run typecheck`
- focused frontend test: `npm test -- --run <test-file>`
- agent-facing fast gate: `npm run verify:fast`

`verify:fast` delegates to `npm run check:web`, which runs ESLint, TypeScript, Vitest with React Testing Library and MSW coverage, the Vite source-safety test, the security dependency checks, and the production build. It does not run Playwright, Chrome, browser E2E, or any other E2E flow.

Iteration loop: run the focused test for the changed claim while iterating; warm-up runs are not evidence requirements.

## Backend/API checks

- Laravel PHPUnit/Feature suite and formatting: `npm run check:api`
- MySQL integration suite: `npm run api:test:mysql`
- agent-facing backend gate: `npm run verify:backend`

`verify:backend` composes `npm run check:api` and `npm run api:test:mysql`. The MySQL suite requires a disposable, migrated test database without application seed data; its tests create their own fixtures. The pull-request workflow provisions an isolated MySQL service and migrates it before running the suite.

## Contract checks

- consumer-only artifact, helper, and Laravel boundary gate: `npm run verify:contract:consumer`
- full local and cross-repository producer gate: `npm run verify:contract`

`verify:contract:consumer` validates Web-owned artifacts, gate configuration, helper tests, and Laravel consumers. It does not check out Mobile or use a private token, so it is safe in pull-request workflows.

`verify:contract` delegates to `contract:gate` and also runs Mobile producer suites. It requires a clean checkout of the exact pinned Mobile revision through `MOBILE_REPO_DIR` and the matching `MOBILE_REF`; the private checkout and token are reserved for the trusted main-branch workflow. See [the contract gate guide](docs/testing/mobile-report-upload-contract-gate.md).

## Adaptive validation tiers

Record the selected tier in exactly one line in the report and task status, such as `Tier: T1-fast` or `Tier: T3-high-stakes`.

- **T0 — Docs-only:** Markdown (`*.md`), `docs/**`, or documentation comments only. Confirm the documentation owner and run `git diff --check`; no Markdown linter is configured. No test suite or browser check (~10s).
- **T1 — Fast lane:** Copy, non-critical configuration, styling, or dead-code changes. Run `npm run lint && npm run typecheck && npm test -- --run <test-file>`. No browser or server startup (~45s).
- **T2 — Feature:** Standard non-critical behavior. Run `npm run verify:fast`; run exactly one targeted `chrome-devtools-axi` check only when user-visible UI or a live HTTP contract changed (~2–4m).
- **T3 — High-stakes:** Authentication, authorization, database migrations, critical API contracts, or other protected paths. Run `npm run verify:fast && npm run verify:backend && npm run verify:contract:consumer`, then conduct isolated adversarial review. Human-owned tests are the sole proof; agent-written tests are notes. No private Mobile checkout is used in pull requests; producer checks run only in the trusted main-branch workflow (~8–15m).

The pull-request quality gate runs `npm run check:web`, `npm run check:api`, `npm run api:test:mysql` against an isolated migrated MySQL service with no demo seed data, and `npm run verify:contract:consumer`.

## Broader checks

- local Web, SQLite API, formatting, and Graphify gate: `npm run check:all` (does not include MySQL or contract checks)
  - Before running it, generate local Graphify artifacts with `npm run graphify:refresh`; `graphify-out/` is ignored and stays local.
- E2E: no repository E2E command is defined; use the separate P0F acceptance path only when its verification decision gate is met

## Manual verification

Browser, device, and full-system workflow checks are separate from the ordinary fast gate. Follow the P0F acceptance documentation for any justified browser or device flow after fast, backend, and contract checks pass.

## Database checks

- schema/integration validation: `npm run api:test:mysql`
- migration dry-run or safe check: no repository command is defined
- database test strategy: run Laravel Feature tests against in-memory SQLite; run the MySQL suite only against a disposable, migrated, unseeded test database

## Rules

- Use the strict verification ladder in `.agents/skills/verification/SKILL.md`.
- Local gate: run `npm run verify:fast` without re-running the focused test beforehand; then run affected backend or consumer-contract checks. The pull-request quality gate also runs the full MySQL suite and consumer-only contract gate listed above.
- Do not run E2E as part of `npm run verify:fast`.
- Run only commands that exist in `package.json` or repository scripts.
- Do not run destructive migrations against shared or production data.
