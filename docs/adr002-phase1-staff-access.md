# ADR-002 phase 1: registration and roster-certified staff

## Shipped boundary

- Public registration stays **off by default**. When explicitly enabled, it creates an unverified `farmer`, never an inspector. Client-supplied roles, grants, certification fields and district values confer no authority. Email verification and password recovery do not promote the account.
- Verified farmers may receive identity-only mobile sessions with **no report or assignment abilities**. They cannot use the office workspace, restricted records or any v1/v2 upload or v1/v2/v3 status endpoint, including with a forged wildcard token. Farmer mobile UI/history and anonymous inference are separate follow-on work; older inspector-only mobile clients cannot parse farmer identities.
- `field_reporter`, `reviewer` and `admin` require a recorded staff certification before staff login or restricted APIs work. Unknown/retired/disabled roles remain denied. Email verification is still required.
- A DMO/admin is not automatically a staff administrator. Phase-1 `staff:manage` delegation is limited to the **configured, verified, roster-certified office identity**. Promotions require controlled invitations; the existing role-change API only permits removal of staff authority to `farmer`, with password step-up and session/token revocation.
- Expert consult-link JSON/photo routes were already removed by the merged retirement change. They remain **404**, even with an old signature; do not restore them. Current case JSON/photos require authentication, verification, staff certification and their existing role policies. A signature is never an alternative to staff login.

## Configuration: explicitly invented placeholders

Authoritative values live in `api/config/caneguard.php` and are documented in `api/.env.example`:

```dotenv
CANEGUARD_STAFF_APPROVER=APPROVER_TBD
CANEGUARD_PILOT_DISTRICT=DISTRICT_TBD
```

These are **not office-approved identities or geography**. The register and invitation pages show **To be assigned (APPROVER_TBD)** and **To be assigned (DISTRICT_TBD)**. The public configuration DTO exposes labels/placeholder flags, not the provisioner's UUID, email or credentials. After configuration changes it displays the configured district and whether an approver identity is assigned, without claiming roster certification.

Later, set `CANEGUARD_STAFF_APPROVER` to the office-named provisioner's existing user UUID and `CANEGUARD_PILOT_DISTRICT` to the confirmed pilot value. No source changes are needed; refresh Laravel's deployed configuration cache through the normal authorized deployment process. Configuring the provisioner alone does **not** certify that account. District configuration is informational in phase 1: **no district-boundary or rollout gating is implemented here**.

## Controlled provisioning

### Prepare approved legacy staff and bootstrap the named provisioner

The additive migration retains every existing account, role, password, UUID, case, evidence path, historical actor and audit. It does **not** infer certification from a staff-looking role. Existing unclassified staff accounts therefore lose online staff authority until individually reconciled against the approved roster; their evidence remains intact. Existing tokens cannot bypass the current certification check.

Before any production rollout, the office must supply the provisioner identity and an approved roster/reference for each staff account. Arrange a coordinated migration/certification window; do not apply the migration assuming all historical `field_reporter` rows are approved. No production migration or roster import was performed by this implementation.

An authorized deployment operator with trusted shell access can certify a verified existing account out of band:

```text
php api/artisan staff:certify-roster <user_uuid> <field_reporter|reviewer|admin> <approved_authority_reference>
```

The configured provisioner must exist, be email-verified and have an office role. This operator-only command can bootstrap that named provisioner itself, and reconcile approved legacy staff. Public accounts, configuration alone, generic admins and HTTP requests cannot invoke the bootstrap. Disabled/unknown accounts cannot be silently reactivated. Every certification records the real provisioner, roster reference and role transition and revokes the target's previous tokens and database sessions. Use a nonsecret office document/reference identifier; never place credentials or personal roster contents in the reference or shell history.

The normal demo seeder creates **uncertified** staff-looking accounts and preserves existing identities/passwords/verification/certification instead of overwriting them. Seeding is not roster approval. API-ready test demos explicitly exercise the roster-certification command with synthetic references.

### Invite an existing verified pending account

The account must first exist and have a verified email. Public sign-up, where separately enabled, is one way to create a pending farmer account; it does not grant staff power. Phase 1 does not introduce an unrestricted staff-account creator.

The configured certified provisioner uses their authenticated staff session and password step-up:

```http
POST /api/v1/staff/invitations
Content-Type: application/json

{
  "user_uuid": "<roster-listed existing account UUID>",
  "role": "field_reporter",
  "authority_reference": "<approved office roster reference>",
  "current_password": "<provisioner's current password>"
}
```

An invitation is an approved roster entry for exactly one account and role, not an arbitrary role picker for the recipient. The provisioner cannot invite themselves. The response does not return a bearer secret. Delivery uses the application's existing mail transport, not official weekly-report sending.

- Invitation secrets are 256-bit random values; only SHA-256 hashes are persisted. They expire after 48 hours and are single-use.
- A reissue revokes previous outstanding invitations for the account. Staff removal and certification also invalidate outstanding invitations.
- The email link opens `/accept-staff-invitation#<secret>`; the fragment is not sent in URL requests/referrers and is immediately removed from the current history entry. Treat the invitation email as sensitive.
- Acceptance uses the recipient's verified email and **current account password**, plus the invitation secret. It rechecks current provisioner delegation/certification, account eligibility, email binding, expiry and revocation under database locks. Old links cannot restore removed staff access.
- Acceptance certifies only the stored approved role, records its roster reference and actor, and revokes old authentication. The recipient must sign in again. It does not create an automatic web session or mutate any case/evidence ownership.
- Users are locked in ID order before invitation rows; acceptance, reissue and staff removal are transactional. No secret/password/session payload is put into security-audit metadata.

Changing the configured provisioner disables acceptance of their predecessor's outstanding invitations. Revoking the current provisioner's staff certification also disables those invitations. Staff certification/reissue/removal are audited; audit retention remains the existing configured policy.

## Demonstration and verification

Recorded evidence: [phase-1 acceptance proof](evidence/adr002-phase1/README.md), including desktop/mobile placeholder screenshots and the exact automated checks actually run.

Security regressions live in `api/tests/Feature/StaffProvisioningTest.php` and the populated-schema MySQL upgrade test in `api/tests/MySql/StaffCertificationMigrationMySqlTest.php`. Existing auth, upload, review, history, image, assignment and notification suites still run. Web registration/current-user parsers and invitation/configuration component tests are updated.

## Explicit limits

No anonymous farmer inference, personal-history UI, district membership/backfill/boundary enforcement, approval/send grants, encrypted offline storage, finite offline/token policy, weekly-report transport or deployment is included. Existing token-expiry behavior is unchanged. Existing approved staff role behavior is retained **after explicit roster certification**, not through an automatic legacy-role grandfathering rule. Mail transport delivery and real office roster approval remain operational inputs; tests use mail fakes.

Keep deny policies and farmer-only registration if UI is rolled back. Do not roll application code back to the former inspector-granting register controller. The migration's `down` exists for isolated testing, not as a recommended production rollback: it removes certification/invitation metadata. Preserve the ledger and evidence during recovery.
