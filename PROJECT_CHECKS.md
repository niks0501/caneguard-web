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

`verify:backend` composes `npm run check:api` and `npm run api:test:mysql`. The MySQL suite requires the disposable `caneguard_test` database described in the README.

## Contract checks

- local artifact and helper tests: `npm run contract:test`
- full local and cross-repository contract gate: `npm run verify:contract`

`verify:contract` delegates to `npm run contract:gate`, which validates the Web-owned artifacts, Laravel consumers, and the exact clean Mobile producer revision when `MOBILE_REPO_DIR` is configured. See [the contract gate guide](docs/testing/mobile-report-upload-contract-gate.md).

## Broader checks

- complete repository gate: `npm run check:all`
- E2E: no repository E2E command is defined; use the separate P0F acceptance path only when its verification decision gate is met

## Manual verification

Browser, device, and full-system workflow checks are separate from the ordinary fast gate. Follow the P0F acceptance documentation for any justified browser or device flow after fast, backend, and contract checks pass.

## Database checks

- schema/integration validation: `npm run api:test:mysql`
- migration dry-run or safe check: no repository command is defined
- database test strategy: run Laravel Feature tests against in-memory SQLite; run the MySQL suite only against the disposable, migrated, and seeded `caneguard_test` database

## Rules

- Use the strict verification ladder in `.agents/skills/verification/SKILL.md`.
- Gate: run `npm run verify:fast` without re-running the focused test beforehand; then run only affected backend or contract checks.
- Do not run E2E as part of `npm run verify:fast`.
- Run only commands that exist in `package.json` or repository scripts.
- Do not run destructive migrations against shared or production data.
