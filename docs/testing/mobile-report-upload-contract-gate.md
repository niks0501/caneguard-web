# Mobile lifecycle contract gate

The mobile contract gate checks web-owned upload, assignment, completion, notification, and lifecycle artifacts against the Laravel consumers and the Mobile producers.

The upload contract proves that the Mobile multipart producer and Laravel upload request agree.
The assignment contract proves that the owner-scoped Mobile assignment feed and its cached producer parser agree.
The completion contract proves that Mobile completion evidence maps to the Laravel multipart boundary.
The notification contract proves that attention payloads and checkpoints remain owner-scoped and parseable.
The lifecycle contract proves that independent state dimensions and legacy projections remain aligned without making field evidence or AI output authoritative.

The gate does not run device tests, Maestro, or the P0F full-system acceptance flow.
The local-stack acceptance harness is separate and records automated evidence explicitly as non-device evidence.
Captain-owned Maestro execution remains the later physical-runtime handoff.

## What the gate runs

`contract:artifact` validates the upload artifact.

`contract:assignment-artifact` validates the assignment artifact identity, owner-scoped JSON envelope, item fields, assignment states, and pagination checkpoint.

`contract:completion-artifact` validates the completion multipart artifact.

`contract:notification-artifact` validates the owner-scoped notification envelope and fields.

`contract:lifecycle-artifact` validates lifecycle dimensions, legacy projections, transition rules, and linked payload contracts.

`contract:consumer`, `contract:assignment-consumer`, and `contract:completion-consumer` run the corresponding Laravel feature boundaries.

`contract:notification-consumer` runs the Laravel notification boundary tests.

`contract:lifecycle-consumer` runs the Laravel test that reads the canonical lifecycle artifact through the API model.

`contract:producer`, `contract:assignment-producer`, and `contract:completion-producer` run focused Mobile producer tests from the selected revision.

`contract:notification-producer` evaluates the Mobile notification parser against the Web-owned artifact.

`contract:lifecycle-producer` evaluates Mobile review projections and assignment states against the Web-owned lifecycle artifact.

Each side has a separate workflow step and a category prefix:

- `[artifact]` means a canonical web artifact or its revision configuration is malformed.
- `[producer]` means the selected Mobile producer is incompatible with the selected artifact.
- `[consumer]` means Laravel no longer accepts a declared contract boundary.
- `[config]` means the repository pin or workflow-dispatch revision input is malformed.
- `[revision]` means a checkout assertion received a non-matching exact SHA.

## Trusted workflow behavior

The pull-request workflow is `.github/workflows/mobile-report-upload-contract.yml`.
The secret-bearing workflow is `.github/workflows/mobile-report-upload-contract-trusted.yml`.

A pull request runs artifact and Laravel web-boundary checks without private Mobile repository credentials.

A push to `main` on a relevant contract or Laravel path runs the complete producer and consumer gate against the full-SHA Mobile revision in `ci/mobile-report-upload-gate.json`.

The committed Mobile pin is updated only after the Mobile lifecycle producer commit is clean and pushed.
The local evidence file records whether the exact pinned revision was verified instead of treating a dirty checkout as trusted evidence.

A trusted workflow dispatch from `main` requires an exact 40-character `mobile_ref` input.

The workflow never follows a moving branch in the private Mobile repository.

Both checkouts set `persist-credentials: false`.
The producer tests receive only an allowlisted environment and never receive a GitHub token or the Mobile read secret.

## Local deterministic commands

Run all artifact and helper tests:

```bash
npm run contract:test
npm run contract:artifact
npm run contract:assignment-artifact
npm run contract:completion-artifact
npm run contract:notification-artifact
npm run contract:lifecycle-artifact
npm run contract:config
```

Run the Laravel consumer boundaries:

```bash
npm run contract:consumer
npm run contract:assignment-consumer
npm run contract:completion-consumer
npm run contract:notification-consumer
npm run contract:lifecycle-consumer
```

Run the assignment producer check with an already checked-out clean Mobile repository:

```bash
MOBILE_REPO_DIR=/path/to/caneguard-mobile \
  MOBILE_REF=<full-mobile-commit-sha> \
  npm run contract:assignment-producer
```

Run the completion, notification, and lifecycle producer checks from that same clean exact revision with their corresponding artifact environment variables.

```bash
MOBILE_REPO_DIR=/path/to/caneguard-mobile MOBILE_REF=<full-mobile-commit-sha> npm run contract:completion-producer
MOBILE_REPO_DIR=/path/to/caneguard-mobile MOBILE_REF=<full-mobile-commit-sha> npm run contract:notification-producer
MOBILE_REPO_DIR=/path/to/caneguard-mobile MOBILE_REF=<full-mobile-commit-sha> npm run contract:lifecycle-producer
```

The producer commands refuse dirty checkouts, moving branches, and revision mismatches.
They restore the Mobile contract artifact after each focused test.

These commands do not create credentials or fetch private repositories.

## Failure response

If `[artifact]` fails, fix the canonical JSON before investigating either repository boundary.

If `[config]` fails, correct the committed Mobile pin or workflow-dispatch revision input.

If `[producer]` fails, read the focused Jest failure first.

If `[consumer]` fails, read the named Laravel boundary assertion.

If `[revision]` fails, correct the full SHA input rather than rerunning with a branch name.

A passing pull-request web-boundary check is not a substitute for the trusted cross-repository result.
A passing local-stack harness is also not a substitute for a physical device or Maestro result.
P0F must use recorded Web and Mobile SHAs, artifact digests, and passing trusted gates before the captain begins the physical-runtime handoff.
