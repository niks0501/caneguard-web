# CaneGuard Auth v1 Contract

This document is the Web/API authority contract for authentication and account security.

Laravel remains the identity and authorization authority.

Web uses the existing Sanctum stateful cookie session.

Mobile uses a Sanctum bearer token.

AI output remains decision support and is never an authority finding or diagnosis.

## Roles and email verification

The supported persisted roles are `farmer`, `field_reporter` (inspector wire identity), `reviewer`, and `admin` (District Mill Officer). Guests have no staff identity and read public education without signing in. Farmer scans and own-result retention belong to the Mobile app; farmers cannot submit official field reports or enter the office workspace.

Public registration is disabled unconditionally: `POST /register` always returns `403 REGISTRATION_DISABLED` and the Web `/register` route redirects to sign-in. Staff identities are provisioned by an authorized office operator, never by self-service sign-up and never with a public staff role choice; see [simplified Web RBAC](../security/simplified-web-rbac.md) for the maintained role/action matrix and [district access and weekly workflow](district-access-v1.md) for provisioning. Existing `field_reporter` identities retain their UUID, verification state and history; verification alone does not infer district membership or named grants. Official authority also requires an explicitly provisioned membership in the single configured pilot district. Unverified, disabled and retired-expert identities remain denied.

The registration payload does not have a role, phone, or barangay field.

Every newly registered account starts with an unverified email address.

Web and Mobile password login reject an unverified account with `403 EMAIL_NOT_VERIFIED`.

Seeded demo accounts are explicitly written with a verified email timestamp.

All authenticated API routes require a verified email address.

## Public Web endpoints

All state-changing Web endpoints use the existing Sanctum CSRF cookie flow.

The Web client requests `/sanctum/csrf-cookie` before each unauthenticated state-changing request.

| Method | Path | Request fields | Success |
| --- | --- | --- | --- |
| POST | `/register` | `name`, `email`, `password`, optional `password_confirmation` | Always `403 REGISTRATION_DISABLED` |
| POST | `/login` | `email`, `password` | `204` |
| POST | `/logout` | none | `204` |
| GET | `/email/verify/{id}/{hash}` | Laravel temporary signature query | `200 EMAIL_VERIFIED` |
| POST | `/email/verification-notification` | `email` | `202 VERIFICATION_LINK_SENT` |
| POST | `/forgot-password` | `email` | `202 PASSWORD_RESET_LINK_SENT` |
| POST | `/reset-password` | `email`, `token`, `password`, optional `password_confirmation` | `200 PASSWORD_RESET` |

Public self-registration is disabled unconditionally. The API returns this response before validation or account creation, and no configuration value re-enables it:

```json
{
  "message": "Public self-registration is disabled. Contact your CaneGuard administrator to request an authorized account.",
  "code": "REGISTRATION_DISABLED"
}
```

The retired `CANEGUARD_SELF_REGISTRATION_ENABLED` and `CANEGUARD_PILOT_ROSTER_CERTIFIED` values are not read by the registration middleware and do not enable sign-up. The Web `/register` route redirects to sign-in regardless of build configuration.

Historical context, not current instructions: an earlier contract offered an opt-in farmer registration response (`201 REGISTRATION_CREATED`) whose payload carried no role, phone or barangay field and always created an unverified account. That path is retired. It was never a staff provisioning route and must not be restored as one.

The generic verification response is `{ "message": "If the address is eligible, a verification link will be sent.", "code": "VERIFICATION_LINK_SENT" }`.

The generic recovery response is `{ "message": "If an account matches, a password recovery link will be sent.", "code": "PASSWORD_RESET_LINK_SENT" }`.

Validation failures use `{ "message": "The given data was invalid.", "code": "VALIDATION_ERROR", "errors": { "field": ["<validation-message>"] } }`.

The verification and reset links use `CANEGUARD_VERIFICATION_URL` and `CANEGUARD_PASSWORD_RESET_URL`.

Those values are deployment configuration and must use HTTPS in production.

The verification signature is generated for Laravel's named `verification.verify` route and is valid for the configured verification lifetime.

The password reset broker uses a one-hour expiry and a one-minute creation throttle.

Forgot-password responses are identical for unknown, known, verified, and unverified addresses.

Invalid or expired reset values return `422 INVALID_RESET_TOKEN` without returning the submitted value.

A successful reset never logs the user in.

## Password policy

Password-only authentication uses a minimum length of 15 characters.

Passwords accept at least 64 characters and the implementation default is 128 characters.

There are no composition requirements.

Registration, reset, and authenticated password changes use the same policy.

The compromise check is offline-safe and compares SHA-1 values against the configured local breach list.

Only hashes are configured or persisted for that list.

The application never logs or stores a plaintext password or reset value.

## Authenticated account security endpoints

These endpoints use the existing `auth:sanctum` cookie or bearer boundary and require the current password as an auditable step-up check.

| Method | Path | Required fields | Success |
| --- | --- | --- | --- |
| POST | `/api/v1/auth/password` | `current_password`, `password`, optional `password_confirmation` | `200 PASSWORD_CHANGED` |
| PATCH | `/api/v1/auth/email` | `current_password`, `email` | `202 EMAIL_VERIFICATION_REQUIRED` |
| POST | `/api/v1/auth/biometric/disable` | `current_password` | `200 BIOMETRIC_DISABLED` |
| PATCH | `/api/v1/admin/users/{user:uuid}/role` | `current_password`, `role` | `200 ROLE_CHANGED` |

Wrong step-up credentials return `422 STEP_UP_REQUIRED`.

Role and status changes require an active verified `admin` Web role, an office-cookie session, and password step-up; they cannot target the acting administrator. The `admin` role is the authority for user management, weekly approval and send: [simplified Web RBAC](../security/simplified-web-rbac.md) is the single maintained role/action matrix. Legacy `staff:manage`, `report:approve` and `report:send` grant rows are compatibility storage; they are not required for role changes and do not confer or withhold approval/send authority. The gated [accounts-access-v1](accounts-access-v1.md) v2 contract adds scoped signup discovery and documented admission/triage/transfer without changing farmer authentication or verification. V1 roles/access and the console share its singleton, revision and durable-history reconciliation path; v1 responses remain compatible and v1 still cannot admit unassigned identities. `/api/v1/me` exposes optional `accounts_enabled: true` only when the new gate is enabled; old gate-off auth fixtures are unchanged.

A role change revokes the target user's sessions, bearer tokens and legacy named-grant rows. District membership changes also revoke credentials and invalidate pending weekly authority.

Password changes, email changes, biometric disablement, and password resets revoke active sessions and all personal access tokens as appropriate to the changed account.

Changing an email address clears its verification timestamp and sends a new verification link.

Ordinary field uploads do not require step-up authentication.

## Mobile bearer sessions

Mobile login remains `POST /api/v1/mobile/auth/login`.

The request contains `email`, `password`, `device_name`, and an optional `device_id` for compatibility with existing clients.

New Mobile clients should send a stable opaque `device_id`.

The enrollment endpoint is `POST /api/v1/mobile/auth/enroll`.

Enrollment requires an authenticated farmer or field-reporter bearer session, `current_password`, `device_name`, and `device_id`. Office roles cannot log in or enroll through Mobile; they must use Web cookies.

Enrollment is an auditable step-up operation.

A successful login or enrollment returns this shape:

```json
{
  "token": "<bearer-token-returned-once>",
  "token_type": "Bearer",
  "expires_at": "<RFC3339 timestamp no more than 30 days after issue>",
  "user": {
    "uuid": "<user-uuid>",
    "name": "<user-name>",
    "email": "<user-email>",
    "role": "field_reporter"
  }
}
```

Authorized verified pilot inspectors receive `report:submit`, `report:status`, `assignment:read`, `assignment:complete`, and `notification:read`. Farmers and inspectors without pilot membership receive only `account:security`; token abilities never bypass role, verification, district, assignment or ownership checks. `/api/v1/me` includes current `district_id` and server-derived `capabilities`.

All bearer tokens have a finite maximum lifetime of **30 days**, including re-enrollment. Sanctum rejects expired, null-expiry, overlong and older-than-30-day tokens with `401 UNAUTHENTICATED`. The district migration revokes legacy tokens, sessions and remember tokens rather than grandfathering unlimited credentials. Office workspace endpoints reject bearer credentials even if an officer token has wildcard abilities.

A token can be revoked earlier by logout, security changes, district reconciliation or role changes.

A fresh password login or enrollment replaces the token for that device identity only.

Password reset, password change, email change, biometric disablement, and role change revoke all tokens for the affected account.

Mobile logout revokes only the current token.

## Mobile device/session management

A farmer or field-reporter bearer session can list its own active Mobile sessions with `GET /api/v1/mobile/auth/devices`. Verified pilot office users use the separate cookie-only `/api/v1/auth/devices` GET/DELETE surface; that route does not enable mobile office enrollment.

The response is `{ "data": [...], "meta": { "count": <number> } }`. Each item contains the server session `id`, the client `device_id`, the display `device_name`, `created_at`, `last_used_at`, `expires_at`, and `is_current`. The server never returns a bearer token, token hash, or session payload. The numeric `id` is an opaque revocation handle and is authorized against the calling user's tokens.

`DELETE /api/v1/mobile/auth/devices/{id}` revokes the caller's Mobile session identified by that list `id` and returns `204`. A caller can revoke the current session; its next request must authenticate with another active session. A missing or another user's identifier returns `404 NOT_FOUND` without disclosing whether a session exists. Successful revocations are recorded as `mobile_device_revocation` security-audit events.

These endpoints provide explicit per-device/session revocation within the finite 30-day policy. This Web/API change does not modify `caneguard-mobile`; the Mobile owner must coordinate expiry/re-authentication UX, local farmer-result ownership and biometric logout credential cleanup.

## Security audit

Sensitive step-up attempts and successful security changes write a `security_audits` record.

Audit metadata contains action context only and never contains passwords, reset values, bearer tokens, or session payloads.

The retention period is configured with `CANEGUARD_SECURITY_AUDIT_RETENTION_DAYS`.

The `auth:prune-security-audits` command removes records older than that configured period.

## Admin-assisted recovery boundary

The Web accounts surface manages district authority only; it has no credential-recovery handoff workflow.

v1 therefore does not expose an admin password setter, plaintext credential handoff, email-verification bypass, or reset-token display.

If a user cannot access email, support must first verify identity through the approved municipal process and escalate to an authorized deployment operator.

A future recovery workflow must be separately approved and must require an authenticated admin step-up, an auditable identity decision, a one-time expiring handoff, forced password replacement, email verification, and session/token revocation.

Until that workflow exists, support must not issue or record a password or bearer token manually.
