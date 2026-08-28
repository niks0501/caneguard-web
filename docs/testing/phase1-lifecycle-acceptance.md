# Phase 1 lifecycle acceptance

The Phase 1 acceptance harness proves the cross-repository lifecycle through a disposable local Laravel stack.

It creates a temporary copy of the API source, uses a temporary SQLite database, seeds the three demo roles, starts a loopback PHP server, and drives the same HTTP boundaries used by Mobile and Web.

The harness does not modify the repository API database, development storage, environment files, or running services.

It prefers a directory link for the temporary API dependencies and contract documentation.
If the host blocks symlinks or junctions, it falls back to copying those directories into the temporary stack.

## Run the local-stack proof

Run the following command from the Web repository root.

```bash
npm run phase1:acceptance -- --mobile-dir /path/to/caneguard-mobile
```

The harness automatically discovers `caneguard-mobile` beside or inside the Web checkout when `--mobile-dir` is omitted.

Use `PHASE1_EVIDENCE_PATH` or `--output` to select a different evidence file.

The temporary stack uses the host runtime's temporary-directory resolution, including Windows `TEMP` and `TMP` conventions.

The harness never installs Mobile dependencies.

If Mobile dependencies already exist, it runs the focused automated Mobile seam test as an additional check.

If dependencies are absent, that check is recorded as skipped rather than silently treated as a pass.

## Acceptance flow

The flow submits a Mobile-shaped report through the local API.

A reviewer assigns the open case to the seeded field reporter.

The field reporter reads the owner-scoped assignment and assignment attention feed.

The field reporter submits completion evidence with an unavailable GPS outcome and no fresh photo.

The harness verifies that completion moves field validation to `completed` while the case remains `open` and `not_determined`.

The reviewer receives completion attention and records the final `verified` and `closed` disposition.

The field reporter receives the final office-review attention event.

The harness also compares the Web-owned lifecycle and notification artifacts byte-for-byte with the supplied Mobile reference artifacts.

## Evidence classification

The generated file defaults to `docs/evidence/phase1-lifecycle/local-stack-acceptance.json`.

Its `evidence_class` is `automated_local_stack`.

Its `physical_device` value is always `false`.

Its `maestro` value is always `not_run`.

The local evidence does not attest the trusted cross-repository producer gate until a clean Mobile lifecycle commit is pinned.

Its `PASS_WITH_GAPS` status means the local-stack proof passed while the physical-runtime proof remains outstanding.

The Mobile HTTP transport and all credentials are simulated or local test infrastructure.

The optional Mobile SQLite seam uses a temporary file reopen, but it is not a physical app process restart.

Do not cite this artifact as Android, iOS, physical-device, Maestro, staging, or production evidence.

## Captain-owned handoff

After the local-stack proof and trusted contract gate pass, the captain owns the later Maestro execution.

The captain must use the exact Web revision, exact Mobile revision, and artifact digests recorded for that run.

The captain must record device, build, environment, and flow evidence in the Mobile `.maestro/evidence/` convention.

The captain must preserve the distinction between local-stack evidence, mocked or automated Mobile evidence, and physical-device evidence.

Phase 2 review-status, referral, expert-response, and new AI-authority behavior are outside this acceptance harness.
