# In-system expert workflow retirement

The experimental in-system consult workflow is retired. Offline expert validation of CaneGuard recommendations is unchanged.

## Retained behavior

- AI Possible Condition, staff classification/verification, review notes, field validation and the validated advisory library/per-case selection remain available.
- Cases with old referrals show **Expert referral (historical)**, without assignment, finding, accept/override or invitation controls. All retained referral rows and normalized symptom findings remain readable.
- **Offline handoff notes** record destination, optional external reference, sent date, optional note and optional advice-received note. These are append-only plain records, not consults: no status, due date, expert account, queue, notification or lifecycle transition.
- Office users can print/download a case summary with or without a historical referral. Downloads still embed permitted private evidence. Summaries include current office context, all historical referral snapshots and plain handoff notes.

## API and contract

- Retired referral POST/DELETE operations return HTTP 410: `The in-system expert workflow was retired.` No write or notification occurs.
- Expert directory/queue/packet and signed invitation read routes are removed. Old invitation links no longer resolve.
- `POST /api/v1/reports/{report}/handoff-notes` is restricted to reviewer/admin accounts and requires `expected_version`. It increments the case lock version atomically; stale submissions receive 409.
- The report lifecycle contract stays **v1**. Existing `referral_state` values remain readable and are not rewritten by review or handoff saves. New work cannot set referral state or select `referred_for_expert_validation`; its historical label remains readable.
- Historical referred actions remain in Needs review where appropriate, rather than becoming waiting-on-expert work or being mislabeled as untouched submissions.
- Expert metrics, referral filters, specialist notifications and the nightly reminder command/schedule are removed.

## Migration and deployment safety

`2026_10_04_000000_retire_in_system_expert_workflow.php`:

1. cancels pending/in-progress consults, recording each prior status in a report audit;
2. revokes outstanding invitation hashes;
3. changes expert accounts to the non-authorized `disabled` role, preserving authorship and foreign-key references rather than deleting accounts or converting them to reviewers.

The audit retains the original handoff author because its actor foreign key is required; its reason explicitly identifies automatic retirement. Completed findings, response content, office snapshots and historical rows remain intact.

`2026_10_04_000001_create_report_handoff_notes_table.php` creates separate plain records with retained authorship. Neither migration deletes historical rows or drops any existing table/column. Both have intentionally non-destructive rollback behavior: rollback does **not** reopen consults, restore invitations, re-enable experts or remove saved notes. Re-running either migration preserves retained records.

This change prepares migrations but does not deploy or mutate live data. Before an approved deployment, operations must coordinate any ongoing consults and stop old application workers/schedulers so the previous version cannot continue writing the retired workflow. Re-enabling it or dropping retained historical storage requires a separate approved change.

## Regression checks

- `npm test -- --run`, `npx tsc -b --pretty false`, `npm run lint`, `npm run build`
- `npm run test:design-spine`, `npm run contract:lifecycle-artifact`
- Full API feature/unit suite using `api/phpunit.xml` against an isolated MySQL test database; MySQL-specific contracts using `api/phpunit.mysql.xml`
- `ReportReferralTest` covers retirement writes/access, migration preservation/idempotency, plain handoff permissions/versioning, historical reads and printing. `ReferralSummaryDownloadTest` retains evidence-boundary and unauthorized-access coverage.

The retirement regression also covers 1,005 consults across the mutation-sensitive pagination boundary; the migration uses ID-based pagination so cancelling rows cannot skip the next page.

MySQL contract tests accept the normal CI database or an isolated `firstmate_`-prefixed database and inspect the configured schema. The mobile snapshot fixture uses an exact clock tick for the existing second-precision update timestamp. Notification fixtures use explicit timestamp ordering and exact reference matching so second-precision MySQL timestamps do not make feed tests nondeterministic.
