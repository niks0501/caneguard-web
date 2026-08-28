# Mobile report and assignment contract gate

The mobile contract gate checks the web-owned upload and field-validation assignment artifacts against the Laravel boundaries and the Mobile producer.

The upload contract proves that the Mobile multipart producer and Laravel upload request agree.
The assignment contract proves that the owner-scoped Mobile assignment feed and its cached producer parser agree.

The assignment contract is read-only in this ticket.
Field-validation completion and sync-back remain T07.

The gate does not run device tests, Maestro, or the P0F full-system acceptance flow.
P0F remains the separate Mobile -> API -> Web -> API -> Mobile release proof.

## What the gate runs

`contract:artifact` validates the upload artifact.

`contract:assignment-artifact` validates the assignment artifact identity, owner-scoped JSON envelope, item fields, assignment states, and pagination checkpoint.

`contract:consumer` runs `MobileReportUploadContractTest` against the upload request boundary.

`contract:assignment-consumer` runs `FieldValidationAssignmentTest` against assignment authorization, ownership, and response behavior.

`contract:producer` runs the focused upload producer test from the selected Mobile revision.

`contract:assignment-producer` runs the focused assignment parser producer test from the same selected Mobile revision.

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

A trusted workflow dispatch from `main` requires an exact 40-character `mobile_ref` input.

The workflow never follows a moving branch in the private Mobile repository.

Both checkouts set `persist-credentials: false`.
The producer tests receive only an allowlisted environment and never receive a GitHub token or the Mobile read secret.

## Local deterministic commands

Run the artifact and helper tests:

```bash
npm run contract:artifact
npm run contract:assignment-artifact
npm run contract:config
npm run contract:test
```

Run both Laravel consumer boundaries:

```bash
npm run contract:consumer
npm run contract:assignment-consumer
```

Run the assignment producer check with an already checked-out clean Mobile repository:

```bash
MOBILE_REPO_DIR=/path/to/caneguard-mobile \
  MOBILE_REF=<full-mobile-commit-sha> \
  npm run contract:assignment-producer
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
P0F must use recorded Web and Mobile SHAs, artifact digests, and passing trusted gates before full-system acceptance begins.
