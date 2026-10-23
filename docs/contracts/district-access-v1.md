# ADR-002 — pilot district authority and weekly versions

## Authority

- Guest: public education only, no account or restricted-record API access.
- Farmer: verified Mobile account security; scanning and own-result retention remain Mobile-owned. No official-report, assignment, office, approval or send authority.
- Inspector: existing `field_reporter` wire identity, verified email and explicit current pilot membership. Own official reports plus explicitly assigned field work only.
- Reviewer: pilot office-cookie workspace and case review; may prepare weekly drafts. Never approves or sends, even with mistakenly stored grants.
- District Mill Officer: existing `admin` wire identity and current pilot membership. The active verified Admin role carries user management, weekly approval and send. Legacy named `report:approve`, `report:send` and `staff:manage` grant rows remain compatibility/bookkeeping storage only and confer no additional authority; see [simplified Web RBAC](../security/simplified-web-rbac.md) for the single maintained role/action matrix.

Only `CANEGUARD_PILOT_DISTRICT_CODE` is live. Blank configuration, unassigned records, foreign districts and revoked memberships fail closed. Office APIs reject bearer tokens; restricted documents, images, aggregates, exports, notifications, location references and broadcast subscriptions are authenticated and scoped. Farmer wildcard tokens cannot create official reports. Expert retirement/history is preserved.

## Launch and provisioning

Migrate normally in an approved environment. The district migration adds nullable attribution and explicit access tables; it does not infer district access from role, municipality, barangay, old records, or demo seeders. Existing tokens, sessions and remember tokens are revoked. Back up and plan re-authentication before deployment. Rollback cannot resurrect deleted credentials.

An authorized operator must first create the office-approved district row with its exact code and name. Configure that one code. Provision each named verified staff identity with `caneguard:access` using an office reference; use `php artisan caneguard:access --help` for the supported options. For example (synthetic identifiers only):

```sh
php artisan caneguard:access <named-user-uuid> <pilot-district-code> <approved-roster-reference> --role=field_reporter
php artisan caneguard:access <named-officer-uuid> <pilot-district-code> <approved-roster-reference> --role=admin
php artisan caneguard:access <named-user-uuid> <pilot-district-code> <revocation-reference> --revoke
```

The office-cookie management counterpart is `PUT /api/v1/admin/users/{uuid}/access`. It requires an active verified Admin office-cookie session (no named key) and password step-up; the acting manager cannot modify themselves or adopt a foreign/unassigned identity. Required fields: `current_password`, `office_reference`, `role`, `revoke`, and complete replacement `grants`. The district comes from the configured pilot, never from request input. Reconciliation is audited and invalidates the previous grant revision/credentials; affected pending intents fail the pre-delivery authority check and cancel when checked. Regranting the same ability cannot resurrect an older approval.

Office-owned roster certification and evidence-based legacy record attribution are external launch work. Do not blanket-backfill records or manufacture verification or grant rows. Public registration is disabled unconditionally in this release and no flag re-enables it; the retired `CANEGUARD_SELF_REGISTRATION_ENABLED` and `CANEGUARD_PILOT_ROSTER_CERTIFIED` values are not read by the registration middleware. Provision staff only through the authorized operator process above, never through public sign-up.

## Accounts management compatibility

The gated [accounts-access-v1](accounts-access-v1.md) v2 office API adds approved signup discovery, atomic admission/triage, deliberate independent keys, district-only revoke/restore and approval-key transfer. Common console/v1/v2 reconciliation now serializes on the district, preserves unchanged grants, enforces the report-approver singleton, advances authority revisions and appends lifetime-retained decision evidence. Existing v1 discovery/admission boundaries and response shapes remain; unsafe self/stale/singleton operations may newly reject. V1 role changes use this same action and accept an optional office reference for compatibility. New Web decisions always require an office reference and fresh password. Bootstrap/final-manager recovery stays operator-owned; do not use public registration for recovery.

## Immutable weekly workflow

The Web document builder can still preview draft analytics. Official versions are distinct sealed district documents.

| Method | Office-cookie path | Authority |
| --- | --- | --- |
| GET | `/api/v1/district-reports?week=YYYY-Www` | Current pilot office membership |
| POST | `/api/v1/district-reports` (`week`) | Current pilot office membership; prepare only |
| GET | `/api/v1/district-reports/{uuid}/document` | Same-district office; private/no-store |
| POST | `/api/v1/district-reports/{uuid}/approve` (`content_hash`) | Active verified Admin office session and the exact version hash |
| POST | `/api/v1/district-reports/{uuid}/send` (`content_hash`, UUID `idempotency_key`) | Active verified Admin office session, valid approval and recipient contract |

Versions seal the HTML, SHA-256 content hash, week, district, source report UUIDs, lock versions and evidence hashes, version number and preparer. Approval binds the exact hash, version, named approver and recorded authority revision. Newer drafts, changed evidence, foreign district, stale authority or mismatched hashes return conflict/forbidden rather than silently sending something else. Domain events retain draft/approval/intent/cancellation history; versions and recipient sets are immutable through their model interfaces.

Sending requires `CANEGUARD_WEEKLY_SEND_ENABLED=true` and an explicitly office-approved, active, immutable `DistrictRecipientSet`. No recipient set is inferred or seeded by production migrations. Revise recipients by retiring the old set and creating a new approved version, never editing the sealed contract. In-flight intents bind the immutable recipient-set ID and will cancel if it is retired.

**This change does not deliver mail.** Send requests record an idempotent pending intent, not a transmission success. There is no queue job, SMTP transport or “sent” claim. The gate defaults closed. A future delivery integration must call `DistrictReportWorkflow::checkPending()` immediately before transport, honor a false/cancelled result, and implement its own approved delivery/receipt contract. Roster certification, recipient-contract approval and actual weekly email delivery are not completed by this PR.

## Verification authority

Regression suites: `DistrictAccessTest`, `DistrictReportWorkflowTest`, `DistrictAccessMySqlTest`, existing expert-retirement and scoped API suites; Web `WeeklyReportApproval.test.tsx` covers role controls, hash approval, gate closure, conflict states and honest send-intent wording. Factory pilot certification is test-only and creates no named grants.
