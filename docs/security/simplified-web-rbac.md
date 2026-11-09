# Simplified Web RBAC

Implements [issue #252](https://github.com/niks0501/caneguard-web/issues/252).

**Authentication → active account → web role → resource Policy → action**

The web roles are `reviewer` and `admin`. District/barangay/farm/report locations are domain data, not a second Web authorization hierarchy. Existing field-reporter Mobile membership/ownership checks are unchanged.

## Role and action matrix

This table is the single maintained authority matrix. `npm run test:auth-doc-consistency` asserts these rows against the auth, RBAC and district guides, and the API and Web guard tests assert the same authority as behaviour.

| Action | Reviewer | Admin |
| --- | --- | --- |
| Dashboard | Yes | Yes |
| Reports / List and case review | Yes | Yes |
| Monitoring, Map and Assignments | Yes | Yes |
| Normal Settings (own account security) | Yes | Yes |
| Prepare an official weekly version | Yes | Yes |
| Approve or send an official weekly version | No | Yes |
| User Management (role and status changes) | No | Yes |
| Report Approval surface | No | Yes |
| Admin Settings | No | Yes |
| Self-service staff sign-up | No | No |

Named `staff:manage`, `report:approve` and `report:send` grant rows are legacy compatibility storage. They neither grant nor withhold any row above.

## Supported account API

All routes under `/api/v1/admin/accounts` require a Sanctum web session, an active verified account and the Admin role; bearer credentials are not accepted. User Policies enforce resource access.

| Method | Route | Result |
| --- | --- | --- |
| GET | `/` | Web-role users; optional bounded `search` and `page`; 25 per page |
| GET | `/field` | Read-only field-reporter directory; optional bounded `page`; 25 per page |
| GET | `/{uuid}` | One user's identity, role and status |
| PATCH | `/{uuid}` | Password-confirmed role/status change |
| GET | `/{uuid}/events` | Latest 25 role/status/admin audit events, newest first |

Account fields: `uuid`, `name`, `email`, `role`, `is_active`, `access_version`. Writes require `role=reviewer|admin`, boolean `is_active`, `current_password`, and `expected_access_version`. Undocumented authority fields are rejected. The version protects against stale edits; it is not an administrator control.

Field rows add the same Sanctum/verified/Admin gate plus the read-only access hints the v2 access operation enforces: `membership_state` (`not_issued`, `active`, `revoked`), `allowed_actions`, and `denial_reasons`. A field row offers no action when `allowed_actions` omits it; the screen shows the denial reason instead.

Self role/status changes and failed password confirmation return 422; stale target versions return 409. Actor and target are rechecked under ordered user locks. Successful changed fields are audited with actor, target, before/after role/status and time; no-op writes do not revoke authentication or manufacture change events. Audit history uses the configured security-audit retention policy. Passwords, credentials and session contents are never audit metadata.

## Revocation

`is_active` defaults true. Disabling an account deletes its Sanctum tokens and database sessions and rotates its hidden `auth_version`. A field reporter is the exception: its Mobile bearer session survives so uploads answer `CAPABILITY_REVOKED` rather than signing the phone out, and [auth-v1](../contracts/auth-v1.md) owns exactly which credentials each authority change revokes. Protected requests compare the session's login-time version with the current identity; this also invalidates file/Redis/array sessions and in-flight sessions saved after deletion. Re-enabling does not restore old credentials. A fresh login is required.

Role and existing password/email security changes also revoke authentication, with the same field-reporter Mobile bearer exception. Sessions created before the versioned gate was introduced require a fresh login on their next protected request.

Disabled login reports **Account disabled — contact your administrator.** An already-open client becomes signed out on its next protected server response; hiding UI is never the security boundary.

## Legacy compatibility

The existing v1 role/access and v2 account access/review/approval-transfer writers remain available for this release. Calls emit a `Deprecated account API called` notice (route template, HTTP method and actor ID only), `Deprecation: true` and a successor `Link` header. Migrate callers to the supported API before removal.

Legacy input formats, password confirmation, version/idempotency checks and legacy storage remain supported. Legacy revoke/restore map to global disabled/active status. Legacy grant storage constraints remain solely for compatibility, never as authority to approve/send/manage Web users. Read and mutation responses no longer expose district/grant/capability machinery. Legacy discovery now lists Web-role users rather than the retired farmer-admission inbox; this is an intentional response-contract transition.

## Report approval and settings

Weekly-report Policies allow an active verified Admin to approve/send (`DistrictReportVersionPolicy::approve` and `::send` require `isActiveAdmin`), without named keys or separation-of-duties. Immutable report evidence, current-version checks, recipient contracts, sealed PDFs, idempotent send intents and delivery launch gates remain business rules. Pending delivery rechecks current account authority and report evidence.

Reading or replacing official weekly-report recipients carries the same authority: `GET /api/v1/district-recipient-sets` and `POST /api/v1/district-recipient-sets/replace` require an active verified Admin office session and let a Reviewer get 403, and the replace adds password step-up and an office decision reference.

Admin Settings is a separate guarded surface. Reviewers who follow an administrative URL return to Dashboard with **That section needs an Admin account.** Server routes independently deny Reviewer writes/reads where applicable.

Public registration is disabled for every identity kind. Farmer registration has no public entry, and direct registration requests return `403 REGISTRATION_DISABLED` unconditionally. The retired rollout flags do not enable them. New identities are created only by an Admin through User Management (`POST /api/v1/admin/accounts`, step-up password, roles farmer, field reporter, reviewer or admin): the account starts unverified, a set-password link is mailed through the password-reset flow, and completing that reset verifies the email. The creation result names the next step for that role: a Reviewer or Admin signs in at the Web sign-in page, a field reporter signs in through the Mobile app, and a Farmer account is held with a support contact because the audited Mobile client accepts only field-reporter sessions ([four-role permission audit](../testing/four-role-permission-audit-20261031.md)). Each creation writes an account-access event and security-audit rows. Existing account-recovery and verification endpoints remain available.
