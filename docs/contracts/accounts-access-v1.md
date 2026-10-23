# Accounts and keys — accounts-access-v1

> **Deprecated historical contract.** Issue #252 replaces the Web grant/membership/admission interface with [simplified Web RBAC](../security/simplified-web-rbac.md). Legacy writers remain available with deprecation telemetry for this release; read/mutation responses now omit district/grant machinery. The boundary and frontend guidance below describe the retired interface, not the supported Web flow.

This office-only contract implements decisions D1–D6 from the approved accounts plan. It is not a registration approval gate. A verified farmer's existing Mobile security access remains independent of human triage.

## Boundary and release gate

`CANEGUARD_ACCOUNTS_ENABLED` defaults **false**. When enabled, `/api/v1/me` includes the additive optional `accounts_enabled: true` field; the Web link under Administration and `/accounts` deep links required an admin with the retired `staff:manage` key; current user management is gated on an active Admin role alone. No rollout, roster reconciliation, registration toggle or email-verification bypass is performed by this feature.

In the retired interface every endpoint required Sanctum office-cookie authentication, verified supported admin identity, active configured-pilot membership and a current named `staff:manage` grant; that grant requirement is historical and no current endpoint reads `staff:manage`. Bearer credentials, including wildcard tokens, are rejected. State changes use the existing stateful-API CSRF boundary and an actor-based ten-per-minute throttle. Every decision requires the acting manager's current password; affected accounts cannot be the actor. Roles and keys supplied in a body never authorize a caller.

Scope: configured-pilot members (active and revoked), plus unassigned identities. Known public-signup farmers form the explicitly approved single-pilot global signup inbox. Historical unknown-origin identities are visible for **read-only operator reconciliation**, not silently adopted. Any foreign membership or grant excludes the identity from list, counts, detail and events. Missing and foreign UUIDs both return `404 NOT_FOUND`. Scope is declared in every list/detail policy. Do not call this an unfiltered worldwide roster.

Reads and error responses are private/no-store. Search PII stays in Web memory, never localStorage or route query state. Web request query keys are memory-only and discarded on unmount/session loss. Operators must exclude/redact the query string on this endpoint in ingress/access logs; this repository does not configure external proxy logs. No request bodies, passwords, tokens or session payloads are recorded in decision events or receipts.

URL `v2` preserves existing v1 admission prohibitions and response shape. Payload `accounts-access-v1` names the first accounts contract; immutable event payloads are independently `account-access-event-v1`. Additive optional fields are nonbreaking. Required fields, discovery scope, role/key/action semantics or authorization changes require a new major contract and coordinated consumers.

## Routes

| Method | `/api/v2/admin/accounts` suffix | Purpose |
| --- | --- | --- |
| GET | none | Authorized paged list, filtered counts, declared scope/policy |
| GET | `/{uuid}` | Identity, authority, revision and action hints |
| GET | `/{uuid}/events` | Paged durable successful decision trail |
| PUT | `/{uuid}/review` | Keep as farmer, defer or reopen; triage only |
| PUT | `/{uuid}/access` | Admit, replace, revoke or restore explicit authority |
| POST | `/approval-transfer` | Atomically revoke the old approval key and issue a fresh key to another officer |

The v2 access route reuses `DistrictAccessController` and the same `ReconcileDistrictAccess` action as v1 access, v1 role changes and `caneguard:access`. The Web uses this v2 contract, not an alternative role/grant writer.

List parameters: `view=new|staff|farmers|revoked|all` (default new), `search` (name/email, max 160), `role=all|farmer|field_reporter|reviewer|admin`, `verification=all|verified|unverified`, `membership=all|not_issued|active|revoked`, `sort=newest|oldest`, positive `page` (max 100000), `per_page=25|50` (default 25). Ordering is creation time then internal ID in the same direction. Counts honor search/role/verification/membership; each count applies its named view independently. `total` is the authorized scope total; `filtered_total` includes the selected view. Views overlap: a revoked farmer may occur in Farmers and Revoked. New is known eligible unassigned farmers whose review disposition is new, **not all farmers**.

List envelope: `{contract_version, data: Account[], meta: {page, per_page, total, filtered_total, counts: {new,staff,farmers,revoked,all}, scope: Policy}}`. Detail: `{contract_version,data: Account,policy: Policy}`. `Account` contains UUID, name, email, creation time, origin, verified flag, role, membership state, stored/effective key sets, review state, Web access flag, monotonic `access_version`, safe grant IDs/revisions and allowed actions/denial reasons. No numeric user ID, password/security hash or token is exposed. Policy contains configured district code/name, the scoped current approval-holder UUID/name/version, singleton rule, transfer eligibility and declared scope. Action hints never replace transactional checks.

Roles retain existing wires: farmer; field_reporter (Inspector); reviewer; admin (District Mill Officer). Named keys were exactly `report:approve`, `report:send` and `staff:manage`, independently selected and **default unchecked** for admission/restoration; those rows are historical compatibility storage and are not current approval, send or management authority. Unknown role/origin/membership/review/key values render read-only in Web. Origin remains unknown for historical rows; new registration explicitly records public_signup and creates no membership or keys.

## Decision requests

All writes require:

```json
{
  "contract_version": "accounts-access-v1",
  "current_password": "<acting manager's fresh password>",
  "office_reference": "<non-secret approved office decision reference>",
  "idempotency_key": "<UUID for this exact reviewed operation>"
}
```

Never put real passwords in fixtures, logs, PR descriptions or saved command state. Password is cleared on cancel/error/completion. Reference is required, trimmed, non-whitespace, at most 160 characters. Unknown fields (district, verification, wildcard authority, etc.) and unsupported contract versions are rejected before side effects.

Access additionally requires `expected_access_version`, `operation` and complete `desired: {role,grants}`:

- **admit**: verified known public-signup/explicit office-certified unassigned farmer; concrete staff role, membership and explicitly selected keys in one atomic office decision. No foreign/historical association adoption.
- **replace**: current pilot membership. Complete grant set removes only unselected keys. A role-only admin assignment issues none. Non-admin roles require no named keys.
- **revoke**: active pilot membership, empty desired grants; retain current role or explicitly reviewed demotion to farmer. Identity, report attribution and access history remain. This is district authority withdrawal, not whole-account suspension/deletion. Demotion to farmer requires revoke.
- **restore**: revoked pilot membership, verified supported identity, fresh concrete staff role and keys. Never reuse old credentials, approvals or grant revision validity.

Review adds `expected_access_version`, `disposition=keep_farmer|defer|reopen`. Only eligible unassigned farmers can be triaged; unverified candidates may be kept/deferred without verification bypass. This writes review evidence/version only and leaves membership, keys and credentials unchanged. Reopen restores new-review status.

Transfer adds `from_uuid`, `to_uuid`, `from_expected_access_version`, `to_expected_access_version`. Source is the current active verified approval holder; destination is an active verified admin without that key. The actor must be neither affected identity. Both identities are previewed. Membership/other keys stay unchanged. Old approval key/revision and both credentials are revoked; destination receives a new/revised grant. Both events share one operation UUID. A separately named manager must perform handover; use controlled operator recovery when the only manager is affected. Emergency removal to zero approvers is allowed.

## Transaction, versions and retry

All decision writers serialize on the district row, then lock actor/targets in increasing user ID order. They re-read verification, role, current management key and current-password validity under lock; expected target versions prevent stale screen/console/email/security/grant edits overwriting authority. `User` saves changing identity/verification/password/biometrics/origin/role and membership/grant hooks advance versions. Role changes revoke prior grants. Unchanged grants/memberships are not re-saved merely to manufacture fresh approval validity.

A nullable generated column on district_grants is unique for non-revoked report:approve rows; that key is legacy compatibility storage. Migration preflight **stops** on duplicate active approvers; it never chooses a holder. Common reconciliation enforces singleton and Web self/last-manager constraints. Operator-only reconciliation remains the documented recovery path for bootstrap/final-manager withdrawal, never a public Web exception. Direct SQL is outside the application authority API and requires an approved operator procedure.

Every successful changed authority decision records its domain event, security audit, version changes and credential revocation in the same transaction. Event/audit failure rolls everything back. Triage records a durable event without revoking farmer credentials. No-op access returns `ACCOUNT_ACCESS_UNCHANGED`, no new event/revision/credential churn. Existing v1 role writes now use this same path; v1 response compatibility remains, but unsafe singleton/self/stale operations can newly reject. V1 role requests accept an optional office_reference for compatibility; omitted historical v1 references are honestly labeled as not supplied, never fabricated approval evidence. New Web decisions always require a reference. V1 remains unable to admit or restore unassigned/revoked candidates.

Receipts uniquely bind actor/district/key to a canonical non-secret operation body and target/version(s); passwords are neither stored nor hashed into receipts. Grant order/reference whitespace are normalized. Matching retries authenticate and step up again, return the committed receipt before stale-version checks, and never reconcile twice. Different body or expired receipt returns `IDEMPOTENCY_CONFLICT`. Receipt validity is 24 hours; retained receipts are not authority, and must not be blindly replayed after expiry. Refetch and confirm a fresh operation instead. Concurrent requests serialize under the same district lock; deadlock retries are bounded at three.

Success: `{contract_version,code,data,event_id,operation_id,access_version,credentials_revoked}`. Codes: `ACCOUNT_ACCESS_UPDATED`, `ACCOUNT_ACCESS_UNCHANGED`, `ACCOUNT_REVIEW_UPDATED`. Transfers also include `affected` (both current account snapshots). Review/no-op credentials_revoked is false. A lost network response is **Outcome not confirmed**, not a failed write: check fresh details/history before retrying the same operation key. A 409 reloads and requires fresh selection/confirmation. Saved writes with failed follow-up fetch say **Change saved. Refresh to load current details.**

## Errors

Existing `{message,code,errors?}` envelope:

- 401 UNAUTHENTICATED; 403 FORBIDDEN / SELF_CHANGE_FORBIDDEN / DISTRICT_NOT_CONFIGURED
- 404 NOT_FOUND (missing and foreign indistinguishable)
- 409 ACCESS_VERSION_CONFLICT / APPROVER_ALREADY_ASSIGNED / LAST_MANAGER_PROTECTED / IDEMPOTENCY_CONFLICT
- 419 CSRF_TOKEN_MISMATCH
- 422 VALIDATION_ERROR / STEP_UP_REQUIRED / EMAIL_NOT_VERIFIED / INVALID_ACCESS_TRANSITION
- 429 RATE_LIMITED; 503 ACCOUNTS_UNAVAILABLE

V1 access password failure remains its existing 403 behavior; v2 normalizes wrong-password to 422 STEP_UP_REQUIRED. Lost management authorization clears sensitive account data and restores/signs out the session; unknown contracts/states are never silently interpreted as safe authority.

## Durable history — account-access-event-v1

Event fields: ID, operation UUID, target UUID, actor UUID/name/role snapshot or controlled-console channel, action, bounded non-secret office reference, before/after role/membership/review and grant IDs/revisions/revoked flags, and occurred_at. Times display in 12-hour Asia/Manila with AM/PM. No email snapshot, password/hash/token, IP, session payload or arbitrary request metadata. Transfer events link both sides through the operation UUID.

`account_access_events` is append-only through the model/API; no update/delete endpoint. Restricted foreign keys retain identity/official attribution. History is paged at 25 (bounded below 50), latest occurred_at then ID, with separate retry/error state. New-origin history reports since_registration; legacy history explicitly says earlier_history_unavailable. Never reconstruct earlier events from prunable security_audits or mutable current grant timestamps.

D6 retention is the life of the identity and official-record history, until an office-approved disposition schedule. No automatic event purge or invented statutory fixed-year requirement. Security-audit pruning is independent. Database operators must enforce restricted UPDATE/DELETE privileges/retention under an approved procedure; model hooks do not provide tamper-proof protection from raw SQL. Rollback is forward recovery: the migration intentionally refuses to drop identity/event/receipt/version evidence or resurrect deleted credentials.

## Operator and Mobile handoff

Before any separately authorized rollout: preflight the pilot roster and singleton, provision an independent recovery manager through `caneguard:access`, resolve foreign/unsupported/unknown historical identities with named evidence (no blanket origin backfill), migrate, then enable the accounts gate. An explicit operator-certified legacy candidate may be marked office_certified only through approved evidence-backed reconciliation; this release adds no certification UI or automatic writer. Turning the accounts gate off stops discovery/issuance, not previously issued authority. Public registration is disabled unconditionally; this contract adds no sign-up path. Roster certification and the weekly-send gate remain untouched.

Mobile must treat revoked tokens/old grant revisions as lost authority and re-authenticate. Inspector membership revocation blocks official reports/assignments; farmer account-security access remains governed by verification/role, not triage. Historical report ownership and expert retirement are unchanged. Production deployment, data reconciliation and account disposition require separate authorization.

## Evidence

Synthetic fixtures: `examples/accounts-access-v1-list.json`, `examples/account-access-event-v1.json`. Static validator: `npm run contract:accounts-artifact`. Web tests: AccountsPage, AccountDetailPage, accountsAdmin.api. Backend: AccountsAccessTest; MySQL AccountsAccessMySqlTest; current auth/district/report suites remain required. A green lower-level suite is not a claim that production rollout or live browser acceptance occurred.
