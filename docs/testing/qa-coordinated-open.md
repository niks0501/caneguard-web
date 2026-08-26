# Coordinated QA cycle opening

`npm run qa:open` opens a fixed CaneGuard candidate only after the Web/API, Mobile, staging, public ingress, EAS, and device-preparation gates pass.

The command operates on two explicitly named repositories.
It creates the same `qa/YYYY-MM-DD-NN` branch in `caneguard-web` and `caneguard-mobile` directly from the supplied full commit SHAs.
A branch is created even when its selected commit is unchanged from the repository's `main`.
The branch heads are checked again before `QA OPEN` is reported, so newer `main` commits cannot enter the candidate implicitly.

## Prepare the evidence

First prepare the ignored staging configuration using the existing workflow.

```bash
npm run qa:staging -- init
```

Fill `.qa-staging/staging.env` with the private MySQL credentials, QA passwords, and the one public Tailscale Funnel HTTPS origin.
Keep `DB_DATABASE=caneguard_staging`, keep the service listeners on `127.0.0.1`, and keep `APP_DEBUG=false`.

In `caneguard-mobile`, configure the QA target described by the Mobile QA foundation.
The target file must be an ignored `.env.qa.local` containing the same public origin and `EXPO_PUBLIC_QA_MODE=true`.

```dotenv
EXPO_PUBLIC_API_BASE_URL=https://<device>.<tailnet>.ts.net
EXPO_PUBLIC_QA_MODE=true
```

Produce the Mobile candidate with the Mobile repository's `qa` EAS profile and retain its complete machine-readable output.
The opening command accepts a sanitized evidence envelope rather than guessing from a download URL.

```json
{
  "qaId": "qa/2026-08-26-01",
  "sourceCommit": "<40-character-mobile-commit-sha>",
  "delivery": "build",
  "environment": "preview",
  "channel": "qa",
  "apiBaseUrl": "https://<device>.<tailnet>.ts.net",
  "identity": {
    "id": "<eas-build-id>",
    "detailsUrl": "https://expo.dev/..."
  },
  "artifactUrl": "https://expo.dev/artifacts/...apk"
}
```

For a compatible JavaScript, TypeScript, or assets-only candidate, use an EAS Update instead.
Use `delivery: "update"`, record the update group identity in `identity.id`, and omit `artifactUrl`.
An update record never claims that an APK exists.
A build record must contain an HTTPS APK artifact URL.
Both delivery types must identify the `preview` environment, `qa` channel, and exact public staging origin.

The envelope is evidence only and must not contain passwords, bearer tokens, database credentials, or other secrets.

## Open a cycle

Resolve and inspect the exact source commits before passing them to the command.
Do not pass a moving branch name.

```bash
WEB_COMMIT="$(git rev-parse main)"
MOBILE_COMMIT="$(git -C /path/to/caneguard-mobile rev-parse main)"

npm run qa:open -- \
  --web-repo . \
  --mobile-repo /path/to/caneguard-mobile \
  --web-commit "$WEB_COMMIT" \
  --mobile-commit "$MOBILE_COMMIT" \
  --mobile-target /path/to/caneguard-mobile/.env.qa.local \
  --mobile-eas-record /path/to/qa-mobile-evidence.json \
  --device-state-cleared
```

The command chooses the first unused `NN` for the current UTC date unless `--qa-id qa/YYYY-MM-DD-NN` is supplied.
It rejects a cycle ID already present in either repository.
It requires each selected SHA to exist locally and to be reachable from that repository's `main` or `origin/main` ref.

The command performs these operations in order:

1. Validate the exact Web/API and Mobile commits.
2. Validate the public staging configuration and Mobile target.
3. Validate the EAS build or update identity without inventing an artifact.
4. Require the operator to confirm that CaneGuard app data was cleared on every QA device.
5. Create matching branches in both repositories.
6. Select the new branch in the ignored staging configuration.
7. Create dedicated Web/API and Mobile candidate worktrees.
8. Install locked Web, API, and Mobile dependencies inside those candidate worktrees without lifecycle scripts.
9. Run `npm run check:all` for the selected Web/API staging worktree.
10. Run Mobile linting, type checking, and Jest tests for the selected Mobile worktree.
11. Run the selected Mobile report-upload contract test against the Web-owned contract artifact.
12. Run `qa:staging cycle`, which stops services, clears private staging storage, runs `migrate:fresh --seed --force` against `caneguard_staging`, and waits for private seeded readiness.
13. Run `qa:staging public-start` and `qa:staging public-ready` through the configured Tailscale Funnel origin.
14. Recheck both branch heads and the Mobile candidate worktree against the selected frozen SHAs.

The existing staging workflow remains responsible for runtime configuration, database reset and seeding, Funnel lifecycle, and deployed smoke checks.
The opening workflow never copies secrets into a branch or replaces the development `.env`.

## Output and failure behavior

A successful run writes an ignored JSON release record below `.qa-staging/qa-cycles/` and points to the sibling reconciliation record that must be created before closure.
The reconciliation record is created by the separate `qa:reconcile begin` command when a QA defect is found.
The opening command prints:

- the QA ID;
- the `caneguard-web` Web/API commit;
- the `caneguard-mobile` Mobile commit;
- the public staging endpoint;
- the EAS build identity and APK URL, or the EAS Update group identity without an APK claim;
- the readiness result `QA OPEN`.

`QA OPEN` means the candidate is ready for human QA.
It does not mean that human QA has passed or that a human approver has been inferred.

Any failed gate writes `NOT_OPEN` to the release record, prints the named failed gate, and exits non-zero.
The branches and candidate worktree are retained for diagnosis and explicit abandonment cleanup.
No failed run is reported as `QA OPEN`.

When QA ends, stop public ingress and services with the existing command.
The staging database is intentionally retained until the next cycle.

```bash
npm run qa:staging -- stop
```
