# Coordinated QA cycle rehearsal

This document records one complete synthetic rehearsal of the coordinated CaneGuard QA lifecycle.
It follows the same `qa:open`, `qa:reconcile`, `qa:staging`, and `qa:close` boundaries used by a live cycle.

The rehearsal is synthetic by design.
It does not use a real Mobile checkout, EAS account, MySQL credential, Tailscale account, GitHub mutation, or QA device.
No live release is claimed by the fixture values or the evidence below.
The live operator recipe is included so another operator can repeat the lifecycle without the original planning conversation.

## Result at a glance

| Field | Synthetic rehearsal evidence |
| --- | --- |
| QA ID | `qa/2026-08-26-01` |
| Web/API selected `main` commit | `e93412ee100581ed11c8ac96414cc3b5a34d9fe0` |
| Mobile selected `main` commit | `7a8a633144bd7b3aa70bad218c84b697299ffc83` |
| Matching initial branches | `caneguard-web:qa/2026-08-26-01` and `caneguard-mobile:qa/2026-08-26-01` |
| Public origin | `https://qa-cg-rehearsal.example.invalid` |
| Mobile delivery | EAS Update, `preview` environment, `qa` channel |
| Mobile Update identity | `update-group-synthetic-20260826-01` |
| Simulated QA fix | `QA-35-01`, a reviewer filter that is lost after returning to the report list |
| Accepted Web/API fix on `main` | `6649dc2bc6601998818a8bc754b1d6175b15dee7` |
| Accepted Web/API fix on the QA branch | `a340dbf7553c05a1a2ffbe418710ebee8c25686d` |
| Final result | `PASS` |
| Approval date | `2026-08-26` |
| Human approver | `synthetic-qa-approver` |
| Staging shutdown | Funnel and services stopped; `caneguard_staging` retained |

All commit values in this table are synthetic fixture identifiers.
They are 40-character hexadecimal values generated from rehearsal labels, not claims about objects in either remote repository.
A live run must replace them with the exact output of `git rev-parse refs/heads/main` in each repository.

## Evidence boundary

The rehearsal uses the existing executable contract tests as evidence for the individual lifecycle boundaries.

- `qa-open.node-test.mjs` proves exact source selection, matching branch creation, Mobile target validation, and build or Update evidence parsing.
- `qa-staging.node-test.mjs` proves the isolated database configuration, public-origin boundary, Funnel target shape, and deterministic seed expectations.
- `qa-reconcile.node-test.mjs` proves main-first and QA-first origin handling, the blocked `MAIN_ONLY` and `RETEST_REQUIRED` states, both-history reconciliation, current-candidate retesting, and closure readiness.
- `qa-close.node-test.mjs` proves explicit human approval, release fields, branch retention for approval, staging retention, and release-record publication behavior.

The synthetic ledger below composes those boundaries into one lifecycle.
It is not a transcript from a live host.
The absence of live EAS, Funnel, MySQL, and device execution is an intentional scope boundary from issue #35.

## Synthetic rehearsal ledger

### 1. Select source commits and create the coordinated candidate

The rehearsal selected one exact Web/API `main` commit and one exact Mobile `main` commit.
The selected pair was recorded before any branch was created.

The expected branch evidence was:

```text
caneguard-web   refs/heads/qa/2026-08-26-01 -> e93412ee100581ed11c8ac96414cc3b5a34d9fe0
caneguard-mobile refs/heads/qa/2026-08-26-01 -> 7a8a633144bd7b3aa70bad218c84b697299ffc83
```

The candidate branches are source snapshots.
The Web/API and Mobile `main` branches may move after this point without changing the initial candidate pair.

The live command uses full SHAs and the two named repository roots:

```bash
QA_ID=qa/YYYY-MM-DD-NN  # replace with a new unused ID in both repositories
WEB_REPO=/path/to/caneguard-web
MOBILE_REPO=/path/to/caneguard-mobile
WEB_COMMIT="$(git -C "$WEB_REPO" rev-parse refs/heads/main)"
MOBILE_COMMIT="$(git -C "$MOBILE_REPO" rev-parse refs/heads/main)"

git -C "$WEB_REPO" show --no-patch --format='%H %s' "$WEB_COMMIT"
git -C "$MOBILE_REPO" show --no-patch --format='%H %s' "$MOBILE_COMMIT"
```

`qa:open` validates that both SHAs exist and are reachable from their respective `main` refs.
It then creates the same `QA_ID` branch in both repositories and checks both branch heads again before opening QA.

### 2. Prepare isolated staging and deterministic data

The staging configuration is created and maintained outside Git.
It contains no development database name, development environment file, or committed password.

```bash
cd "$WEB_REPO"
npm run qa:staging -- init
chmod 600 .qa-staging/staging.env
```

The operator fills the ignored file with the private MySQL account, the three QA passwords, and one public origin.
The required isolation values remain:

```dotenv
QA_API_HOST=127.0.0.1
QA_WEB_HOST=127.0.0.1
DB_DATABASE=caneguard_staging
APP_ENV=qa-staging
APP_DEBUG=false
VITE_DATA_SOURCE=api
```

The canonical full path is the `qa:open` command below.
It invokes the staging cycle after the candidate worktrees and automated checks are ready.

```bash
npm run qa:open -- \
  --web-repo "$WEB_REPO" \
  --mobile-repo "$MOBILE_REPO" \
  --web-commit "$WEB_COMMIT" \
  --mobile-commit "$MOBILE_COMMIT" \
  --mobile-target "$MOBILE_REPO/.env.qa.local" \
  --mobile-eas-record /path/to/qa-mobile-evidence.json \
  --qa-id "$QA_ID" \
  --device-state-cleared
```

The synthetic staging evidence for the reset was:

```text
staging-checkout: PASS
staging-database: PASS - migrate:fresh --seed --force against caneguard_staging
seeded users: PASS - field reporter, reviewer, and administrator
seeded reports: PASS - 12 reports including CG-2026-0001
private readiness: PASS - API health ok, database ready, storage ready
```

`qa:staging cycle` is the destructive boundary for the staging dataset.
It stops existing QA services, clears only the selected QA worktree's private storage, runs the migrations, runs the existing deterministic seeders, and waits for seeded readiness.
It does not touch the development `caneguard` or `caneguard_test` databases.

The post-reset checks use the same observable contract as `qa:staging ready`.
They verify API health, the seeded Mobile bearer session, Reviewer and Administrator Web sessions, twelve seeded reports, five recent dashboard reports, and `CG-2026-0001`.

### 3. Expose the Web/API candidate and deliver Mobile

The normal public path exposes only the private Web listener through Tailscale Funnel.
The API and MySQL listeners remain private.

```bash
npm run qa:staging -- public-start
npm run qa:staging -- public-ready
```

The synthetic public smoke evidence was:

```text
public-https-smoke: PASS - HTTPS origin reachable through the Web proxy
public API health: HTTP 200, status ok, database ready, storage ready
public authenticated smoke: PASS - seeded Mobile and Web sessions restored
public representative report: PASS - CG-2026-0001 returned through the public origin
```

The Mobile QA target uses that same origin and explicitly enables QA mode.

```dotenv
EXPO_PUBLIC_API_BASE_URL=https://qa-cg-rehearsal.example.invalid
EXPO_PUBLIC_QA_MODE=true
```

For this rehearsal, the compatible-delivery branch of the artifact rule was selected.
The sanitized EAS Update envelope was:

```json
{
  "qaId": "qa/2026-08-26-01",
  "sourceCommit": "7a8a633144bd7b3aa70bad218c84b697299ffc83",
  "delivery": "update",
  "environment": "preview",
  "channel": "qa",
  "apiBaseUrl": "https://qa-cg-rehearsal.example.invalid",
  "identity": {
    "id": "update-group-synthetic-20260826-01",
    "detailsUrl": "https://expo.dev/accounts/synthetic/projects/caneguard/updates/update-group-synthetic-20260826-01"
  }
}
```

The envelope is evidence only.
It contains no password, bearer token, database credential, or real user data.
When `sourceCommit` is supplied, `qa:open` compares the parsed EAS evidence with the selected Mobile commit, and it always records the selected commit in the cycle record.
This rehearsal treats `sourceCommit` as mandatory evidence.
When the field is omitted, the parser leaves it absent and `qa:open` uses the selected commit while assembling the cycle record.
The `preview` environment, `qa` channel, and public staging origin are checked before the envelope is accepted.

If native dependencies or native configuration changed, the live operator selects a fresh EAS Preview APK instead.
That envelope must use `delivery: "build"` and include an HTTPS `artifactUrl`.
An Update envelope must omit `artifactUrl` because the release record represents it as not applicable for an Update.

Before the readiness command is allowed to open QA, the operator clears CaneGuard app data on every test device.
The package name comes from the Mobile repository's checked-in application configuration.

```bash
MOBILE_PACKAGE=<application-id-from-the-Mobile-app-configuration>
adb shell pm clear "$MOBILE_PACKAGE"
```

The expected device evidence is `Success` for every device.
Clearing app data covers authentication state, local SQLite data, caches, and queued work without requiring an APK reinstall when the installed runtime remains compatible.
The `--device-state-cleared` flag is an explicit operator attestation, not an inference from an automated check.

If Tailscale Funnel is unavailable, a temporary HTTPS tunnel may target `127.0.0.1:15173` as an operational fallback.
The fallback must preserve the one-origin Web proxy boundary, update every matching public-origin value, and never expose the Laravel or MySQL ports.
Run the same public readiness checks through the fallback origin and record the tunnel identity in the cycle evidence.
Tailscale Funnel remains the canonical automated path, so a fallback is a documented manual exception rather than a claim that `qa:open` ran its Funnel gate.

### 4. Pass the complete readiness gate and mark QA open

The synthetic gate ledger was:

| `qa:open` gate | Evidence | Result |
| --- | --- | --- |
| `source-commits` | Exact selected SHAs were valid and reachable from both `main` refs | PASS |
| `staging-config` | Private configuration selected the public origin and `caneguard_staging` | PASS |
| `mobile-target` | `.env.qa.local` used the same HTTPS origin and QA mode | PASS |
| `mobile-eas` | Preview Update identity, channel, environment, source commit, and origin matched | PASS |
| `device-state` | Operator attested that every QA device was cleared | PASS |
| `branches` | Both `qa/2026-08-26-01` branches matched their selected commits | PASS |
| `staging-config-selection` | `QA_BRANCH=qa/2026-08-26-01` was persisted | PASS |
| `staging-checkout` | Web/API candidate worktree used the selected Web commit | PASS |
| `mobile-worktree` | Mobile candidate worktree used the selected Mobile commit | PASS |
| `dependencies` | Locked Web, API, and Mobile dependencies were installed without lifecycle scripts | PASS |
| `automated-web-api` | Web/API checks and the Mobile report-upload producer contract passed | PASS |
| `automated-mobile` | Mobile lint, typecheck, and Jest checks passed | PASS |
| `staging-database` | Staging was reset, migrated, seeded, and verified | PASS |
| `public-https-smoke` | Public health, authentication, dashboard, and report checks passed | PASS |
| `candidate-freeze` | Both branch heads and both candidate worktrees still matched the frozen pair | PASS |

Only after the final `candidate-freeze` gate passed did the synthetic record change from `NOT_OPEN` to `QA OPEN`.
`QA OPEN` means the environment is ready for human testing.
It is not a human approval and does not close the cycle.

### 5. Exercise a QA-discovered fix and reconcile both histories

The synthetic QA session found one defect at the public Web boundary.
After a Reviewer opened a report and returned to the filtered report list, the selected reviewer filter was lost.
This scenario is a synthetic defect declaration used to exercise the approved fix path.
It is not a claim about an unreleased product bug.

The captain selected the documented main-first path.
The reconciliation record was started with the active QA branch supplied explicitly:

```bash
MAIN_BASE="$(git -C "$WEB_REPO" rev-parse refs/heads/main)"

npm run qa:reconcile -- begin \
  --repo "$WEB_REPO" \
  --qa-id "$QA_ID" \
  --qa-branch "$QA_ID" \
  --origin main \
  --source-commit "$MAIN_BASE" \
  --fix-id QA-35-01 \
  --summary "Reviewer filter is lost after returning to the report list"
```

The fix was implemented on a normal fix branch, reviewed, and merged to `main`.
The exact merged commit was recorded as `MAIN_FIX`.
Equivalent accepted behavior was then reviewed into the active QA branch and recorded as `QA_FIX`.
The synthetic values were:

```bash
MAIN_FIX=6649dc2bc6601998818a8bc754b1d6175b15dee7
QA_FIX=a340dbf7553c05a1a2ffbe418710ebee8c25686d
```

The evidence was recorded only after both histories were available:

```bash
npm run qa:reconcile -- reconcile \
  --record .qa-staging/qa-cycles/2026-08-26-01-reconciliation.json \
  --fix-id QA-35-01 \
  --main-commit "$MAIN_FIX" \
  --qa-commit "$QA_FIX" \
  --method cherry-pick \
  --evidence "The QA candidate contains the reviewed equivalent of the merged main fix; the filter-retention scenario passed on both histories." \
  --regression added \
  --regression-path src/App.mock.test.tsx \
  --regression-evidence "Focused Web test and the public filter-retention scenario passed on the current QA candidate."
```

The reconciliation gate was deliberately exercised through its intermediate blocked states.

```text
main history recorded only: MAIN_ONLY, closure blocked
both histories recorded, no retest: RETEST_REQUIRED, closure blocked
current QA candidate retested with PASS: READY_FOR_HUMAN_APPROVAL
```

The active candidate was retested only after the accepted QA commit was present at its current branch head.

```bash
npm run qa:reconcile -- retest \
  --record .qa-staging/qa-cycles/2026-08-26-01-reconciliation.json \
  --fix-id QA-35-01 \
  --candidate-commit "$QA_FIX" \
  --result pass \
  --evidence "Focused regression and the Reviewer filter-retention scenario passed against the current public QA candidate."

npm run qa:reconcile -- check \
  --record .qa-staging/qa-cycles/2026-08-26-01-reconciliation.json
```

The final check exits zero only when the accepted behavior is reachable from both `main` and the active QA branch, the current candidate has a passing retest, and the regression decision is recorded.
Different SHAs are valid when the evidence describes equivalent behavior.
A later QA branch movement makes the retest stale and blocks closure until the current candidate is retested again.

The Web/API staging worktree is updated to the accepted QA branch commit without resetting the database.
The services are restarted and the public smoke check is repeated before approval.

```bash
# Use the selected QA worktree and a fast-forward-only update.
git -C .qa-staging/worktree pull --ff-only origin "$QA_ID"
npm run qa:staging -- stop
npm run qa:staging -- start
npm run qa:staging -- public-ready
```

### 6. Record explicit human approval and the release record

The synthetic human approval was a separate event after the reconciliation check.
No automated readiness result, test result, or worker identity was treated as approval.

The live approval command is:

```bash
npm run qa:close -- approve \
  --web-repo "$WEB_REPO" \
  --mobile-repo "$MOBILE_REPO" \
  --qa-id "$QA_ID" \
  --confirm-human-approval \
  --human-approver '<human approver name>' \
  --final-result pass \
  --approval-date "$(date -u +%F)" \
  --github-repo niks0501/caneguard-web
```

When a cycle issue already exists, add `--github-issue <cycle-issue-number>` to comment on that issue instead of creating a duplicate.
The command verifies the candidate identities, checks reconciliation, stops staging, persists the terminal record, and publishes the release record through `gh-axi`.

The synthetic terminal record contained this required-field excerpt:

```json
{
  "status": "APPROVED",
  "qaId": "qa/2026-08-26-01",
  "repositories": {
    "web": {
      "name": "caneguard-web",
      "branch": "qa/2026-08-26-01",
      "commit": "e93412ee100581ed11c8ac96414cc3b5a34d9fe0"
    },
    "mobile": {
      "name": "caneguard-mobile",
      "branch": "qa/2026-08-26-01",
      "commit": "7a8a633144bd7b3aa70bad218c84b697299ffc83"
    }
  },
  "release": {
    "webApiCommit": "a340dbf7553c05a1a2ffbe418710ebee8c25686d",
    "mobileCommit": "7a8a633144bd7b3aa70bad218c84b697299ffc83",
    "eas": {
      "delivery": "update",
      "identity": "update-group-synthetic-20260826-01",
      "detailsUrl": "https://expo.dev/accounts/synthetic/projects/caneguard/updates/update-group-synthetic-20260826-01",
      "artifactUrl": null
    },
    "finalQaResult": "PASS",
    "approvalDate": "2026-08-26",
    "humanApprover": "synthetic-qa-approver"
  },
  "reconciliation": {
    "status": "READY"
  },
  "stagingShutdown": {
    "status": "PASS",
    "database": "caneguard_staging retained"
  }
}
```

The `webApiCommit` in the terminal record is the accepted current QA candidate commit.
The initial selected Web commit remains available under `repositories.web.commit`.
The reconciliation record links that final candidate commit to the accepted `main` commit.

### 7. Shut down public staging and preserve the database

Approval invokes the complete shutdown path before recording the terminal state.
The synthetic postcondition was:

```text
Tailscale Funnel: stopped
QA API service: stopped
QA Web service: stopped
caneguard_staging: retained with schema and post-QA data
approved QA branches: retained for inspection
```

A live operator can verify the non-secret service state after approval:

```bash
npm run qa:staging -- status
```

The status output must show the selected candidate and `Services: stopped, Funnel stopped`.
The database is preserved because `qa:close` uses `qa:staging stop`, not `cycle`.
The next `qa:staging cycle` is the explicit destructive boundary that resets and reseeds `caneguard_staging`.

For a post-QA database check, use a local MySQL administrative session and verify that the schema still exists.
Do not print credentials or copy real data into the release record.

```sql
USE `caneguard_staging`;
SHOW TABLES;
SELECT COUNT(*) AS report_count FROM `reports`;
```

## Acceptance traceability

| Issue #35 acceptance criterion | Synthetic evidence in this rehearsal |
| --- | --- |
| Selected `main` commits and matching `qa/YYYY-MM-DD-NN` branches | Section 1 and the `source-commits` and `branches` gate rows |
| Reset, migrations, deterministic seed, and verification | Section 2 and the `staging-database` gate row |
| Public HTTPS Web/API access | Section 3, `public-start`, `public-ready`, and the `public-https-smoke` gate row |
| QA-ready Mobile artifact or compatible EAS Update on the same staging origin | Section 3 Update envelope and the `mobile-target` and `mobile-eas` gate rows |
| QA device state cleared before testing | Section 3 `adb shell pm clear` step and the `device-state` gate row |
| Full readiness gate before `QA OPEN` | Section 4 complete gate ledger and freeze check |
| QA-discovered issue using approved reconciliation | Section 5 `QA-35-01` begin, reconcile, and retest sequence |
| Reconciled behavior in active QA and `main` before closure | Section 5 `MAIN_FIX`, `QA_FIX`, zero-exit check, and current-candidate retest |
| Explicit human approval | Section 6 `--confirm-human-approval` and named approver |
| Required final release fields | Section 6 terminal record excerpt |
| Public staging shut down and database preserved | Section 7 shutdown postcondition and retained-database check |
| Reproducible operator guidance | This document's ordered recipe, commands, postconditions, fallback, and evidence boundary |

## Live-run handoff checklist

Before calling a live run complete, the operator must replace every synthetic value with evidence from the actual two-repository cycle.

- [ ] Both repositories are clean checkouts, and exact `main` SHAs were captured.
- [ ] The same new QA ID exists in both repositories.
- [ ] `.qa-staging/staging.env` is private, ignored, complete, and points only to `caneguard_staging`.
- [ ] `qa:open` completed every readiness gate and printed `QA OPEN`.
- [ ] Public `QA_PUBLIC_URL` smoke checks passed through canonical Funnel, or a manual fallback exception was recorded without claiming that `qa:open` ran its Funnel gate.
- [ ] The Mobile target and EAS evidence contain the same public origin and exact Mobile source SHA.
- [ ] Every QA device was cleared before human testing.
- [ ] Every accepted QA fix has a reconciliation record, both histories, a current passing retest, and a regression decision.
- [ ] The human approver explicitly supplied the approval flag, name, result, and date.
- [ ] The terminal record or linked GitHub issue contains the QA ID, final source commits, EAS identity, result, date, and approver.
- [ ] Funnel and staging services are stopped, and `caneguard_staging` remains available for investigation.
- [ ] Approved QA branches are retained, or an abandoned cycle has followed the separate deletion policy.

The live run is complete only after the terminal record and its shutdown evidence are both discoverable.
A fallback tunnel is useful for manual smoke and recovery, but the canonical `qa:open` readiness result must not be represented as a Funnel pass when Funnel was unavailable.
