# Project Verification Commands

Replace placeholders with commands that actually exist in this repository.

Do not invent checks. A missing command is a verification gap, not permission to install or improvise tooling.

## Fast checks

- format/lint:
- typecheck/static analysis:
- focused test:

## Broader checks

- test suite:
- build:
- integration:
- E2E:

## Manual verification

Document UI, device, browser, workflow, or data checks that cannot be proven adequately by automated tests.

## Database checks

- schema validation:
- migration dry-run or safe check:
- database test strategy:

## Rules

- Run the narrowest meaningful checks first.
- Broaden verification when risk, changed surface, or failures justify it.
- Do not run destructive migrations against non-disposable data.
- Do not deploy or publish as part of verification unless explicitly requested.
- Do not install dependencies merely because a verification command is missing.
- Report commands exactly as run and distinguish passed, failed, skipped, and unavailable checks.
