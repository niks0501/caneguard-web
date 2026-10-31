# Four-role permission audit — October 31, 2026

## Result and limits

The **exercised active-role backend matrix matched all expected outcomes**. No over-permissive endpoint was established in that matrix. This is scoped implementation-phase evidence, not an exhaustive security certification or a claim that every account state or endpoint is covered.

**Farmer app sign-in failed on the physical phone.** Its legitimate API login succeeds, but the current Mobile client accepts only `field_reporter` sessions and displays “The authentication response was incomplete.” Inspector phone sign-in succeeded. Do not label this a four-role end-to-end pass.

| Evidence surface | Observed result |
| --- | --- |
| Reviewer and Admin actual Web login forms | Both reached `/dashboard`; cookie-authenticated `/api/v1/me` confirmed the corresponding role. |
| Office-session API matrix | 62 matching HTTP observations, including four anonymous 401 controls. Requests used the authenticated Web cookies, not a separate privileged identity. |
| Office persistence and weekly lifecycle | 12 matching checks. Review notes persisted; Reviewer approval/sending denied; Admin approval accepted. Admin sending returned 503 because local sending was disabled, **not proof of successful sending**. |
| Farmer and Inspector direct HTTP matrix | **API-only:** 82 matching HTTP observations and 12 matching identity/state assertions. These requests did not run through Mobile UI. |
| Physical Android Inspector login | Actual form submission reached Home, greeted `Synthetic field reporter`, and Settings showed the Inspector synthetic email. Normal logout returned the blank login form. |
| Physical Android Farmer login | Actual form submission remained at Login with the incomplete-response error. **Failed**, not deferred or passed. |
| Provisional Expo web | Login route blocked by `DATABASE_OPEN_FAILED` before credentials could be entered. No Expo web sign-in proved. |
| Existing focused backend regression suite | 33 tests, 386 assertions passed. Local results do not establish CI success; CI status is unknown at this handoff. |

Machine-readable, credential-free HTTP observations and assertions are committed in [the evidence file](../evidence/role-permissions-20261031.json). Its `pass` fields mean that the worker's scoped expected observation matched, not that a test has been promoted to proof or a feature has universal acceptance.

## Scope, fixtures, and authority

- API/Web revision: `624832306dfb81febfc123c6c7902d57f500b8cd`.
- Read-only Mobile revision: `83009f74159d0e98c609ca178834686a3d841df2`.
- Isolated development database: `firstmate_cg_role_perms_20261031_14`. No production data or shared environment was used.
- All four synthetic identities were active and email-verified. Only Inspector received the synthetic pilot district membership needed for inspector workflows. Office identities had no district membership/grants; Farmer had no inspector authority.

| Product role | Backend role | Synthetic username |
| --- | --- | --- |
| Farmer | `farmer` | `farmer@role-permissions.caneguard.test` |
| Field Inspector | `field_reporter` | `field_reporter@role-permissions.caneguard.test` |
| SRA Reviewer | `reviewer` | `reviewer@role-permissions.caneguard.test` |
| Admin | `admin` | `admin@role-permissions.caneguard.test` |

Captain steering authorized independent dev-only passwords held only in the task-process environment, actual office Web sign-ins, then explicitly labeled Mobile API-only verification after Expo storage failure, followed by serialized physical-phone sign-ins. The existing development client's signing key was separately authorized and supplied to Metro read-only. It was not copied, displayed, permission-changed, or replaced; manifest verification stayed enabled. Database credentials used the approved local secret-injection mechanism. No passwords, bearer tokens, cookie values, signing-key contents, credential-bearing request bodies, or production/personal data are included here.

No application/auth/storage code was changed. No `actingAs`, manually minted PAT, temporary elevation, auth stub, storage bypass, or signature bypass was used. The HTTP matrices obtained their credentials through the real login endpoints.

## Observed permission matrix

**N/E** means not exercised, never a pass or a denial. Farmer/Inspector columns below remain **API-only** even though Inspector separately signed in on the phone. Office columns use real Web cookie sessions. Denials were exercised against valid synthetic resources and supported payloads unless a row explicitly tests validation or incorrect password step-up.

| Operation | Farmer | Inspector | Reviewer | Admin |
| --- | --- | --- | --- | --- |
| Mobile login, valid credentials | 200; Farmer retained | 200; Inspector retained | 403 | 403 |
| Web login, valid credentials | 403, valid CSRF | 403, valid CSRF | Form → dashboard | Form → dashboard |
| Mobile self/device reads | 200 | 200 | 403 | 403 |
| Mobile device enrollment, valid step-up | 200 | 200 | N/E | N/E |
| Revoke another owner's extant backup device | 404; backup still works | 404; backup still works | N/E | N/E |
| Revoke own backup device | 204; revoked token → 401 | 204; revoked token → 401 | N/E | N/E |
| Mobile logout and token replay | 204 then 401 | 204 then 401 | N/E | N/E |
| Shared authenticated location reference | 200 | 200 | 200 | 200 |
| Mobile assignments and notification feeds | 403 | 200 | 403 | 403 |
| Mobile report-status feeds v1/v2/v3 | 403 | 200 | 403 | 403 |
| Mobile notification read-all mutation | 403 | 200 | N/E | N/E |
| Valid Mobile field-survey upload | 403 | 201; same receipt on replay | 403 | 403 |
| Valid v2 multipart Mobile report upload | 403 | 201; visible in own status feed | N/E | N/E |
| Office identity/dashboard/reports/detail/map/export | 403 | 403 | 200 | 200 |
| Valid-window analytics, inspector roster, survey map, office notifications | 403 | 403 | 200 | 200 |
| Supported report review-note mutation | 403; role unchanged | 403; role unchanged | 200; note/version persisted | 200; note/version persisted |
| New office-account directory/detail/history | 403 | 403 | 403 | 200 for office target |
| Valid same-role office-account update with step-up | 403 | 403 | 403 | 200 |
| Legacy role-escalation attempt | 403; role unchanged | 403; role unchanged | 403 | No elevation attempted |
| Legacy role update with wrong password step-up | N/E | N/E | N/E | 422 |
| District reporting settings read | 403 | 403 | 403 | 200 |
| Weekly report list | 403 | 403 | 200 | 200 |
| Prepare weekly report | 403 | 403 | 201 | N/E |
| Approve prepared weekly report | N/E | N/E | 403 | 200 |
| Send prepared weekly report | N/E | N/E | 403 | **503 local sending disabled** |
| Office-account write with wrong password step-up | N/E | N/E | N/E | 422; target unchanged |
| Self-disable or unsupported Inspector role in new office-account writer | N/E | N/E | N/E | 422; Admin remains active |

The Mobile login payload also supplied `role: admin`: neither identity was elevated. Both cross-owner revocation attempts ran before either owner revoked its own backup; each backup still authenticated afterward. This distinguishes an ownership denial from a 404 against an already-removed resource. Inspector's report upload returned a public identity which was found in its own status feed; survey replay returned the same receipt.

### Relevant route families

The evidence JSON records individual methods, paths, codes, expectations, and outcomes. Principal exercised route families are:

- `/api/v1/mobile/auth/{login,me,enroll,devices,logout}` and device-specific deletion;
- `/api/v1/mobile/{assignments,notifications,field-surveys}` and notification read-all;
- `/api/v{1,2,3}/mobile/reports/statuses` and `POST /api/v2/mobile/reports`;
- `/login`, `/api/v1/me`, `/api/v1/dashboard/summary`;
- `/api/v1/reports`, report detail/review, map, analytics, and export;
- `/api/v1/{field-reporters,field-surveys,notifications}`;
- `/api/v1/admin/accounts`, account detail/events/update, and legacy user-role mutation;
- `/api/v1/district-reporting-settings` and weekly district-report list/prepare/approve/send;
- `/api/v1/reference/locations`, intentionally shared across authenticated roles.

## Physical-phone observation

Verification was interactive, using `agent-device` against one assigned physical Android phone, strictly serialized Farmer then Inspector. Model `2311DRK48G`, Android 16; installed package `com.niks0501.caneguard`, version 1.1.1/versionCode 1. Metro served the inspected Mobile source from a read-only sandbox to this lane's isolated API. The native development client and JS revision are recorded separately; this was not a release-build acceptance claim. The approved signing key resolved the initial manifest-signing refusal without bypassing it.

1. The app reached the existing `auth.login-screen`.
2. Farmer credentials were entered through the real form, with secret input supplied through stdin from the secure task process, not exposed in command arguments. Submission stayed at Login and displayed **“The authentication response was incomplete.”** This is the directly witnessed result; a Farmer screenshot was not captured before continuing to Inspector.
3. Inspector credentials were entered through the same form afterward. Submission reached `home.scroll` and greeted **Synthetic field reporter**. Settings showed `field_reporter@role-permissions.caneguard.test`.
4. Normal Settings logout and its confirmation returned the empty login form and “Signed out.” The session was closed; only task-owned port reverses were removed and task Metro stopped. No offline workflow, biometric enrollment, local-record deletion, or infrastructure repair was performed.

### Finding: Farmer client/API role-contract mismatch

At the inspected Mobile revision:

- `src/features/auth/types.ts` defines `MobileUserRole = 'field_reporter'`.
- `src/features/auth/api/mobileAuthApi.ts:isMobileUser` accepts only that role.
- `parseMobileSessionResponse` requires `isMobileUser(value.user)` and otherwise throws `INVALID_RESPONSE` with the observed incomplete-response text.
- The legitimate Farmer API matrix independently records HTTP 200 for Mobile login and self-read with the Farmer role retained.

Therefore **Farmer's requested app sign-in is not supported by this client contract**. This is a client/API compatibility finding, not a confirmed over-permissive backend endpoint. No role conversion or parser modification was attempted. Successful Farmer phone sign-in requires a separate authorized product/auth decision and implementation; it remains unproved here.

## Exploratory corrections and uncovered scope

Original exploratory evidence is retained outside Git rather than relabeled:

- Analytics initially omitted required `from`/`to`; a valid explicit window subsequently returned 200.
- An initial composite review status-change payload returned 422. The supported independent note write succeeded and persistence was checked; the original composite status transition remains unproved.
- The new account writer/detail policy manages Web roles. Admin access to a Farmer target was denied; valid office-target operations subsequently succeeded. No claim that the new writer manages Farmers is made.
- Location reference 200 for office cookies is intentional shared authenticated data, not inspector authority.
- The first Mobile script incorrectly expected upload identity at `data.uuid`. The actual public resource uses `data.identity.uuid`; the corrected proposal checks that contract and the own-status-feed result. Original observations remain retained.
- A separate attempt to set up an inactive Inspector failed before disabling succeeded. Disabled-identity Mobile login was **not verified** and no hypothetical vulnerability from that incomplete setup is reported as confirmed.
- Expo web export succeeded in documented development mode, but actual Login showed `DATABASE_OPEN_FAILED` even with the required isolation headers and available worker/WASM. One Retry did not clear it. No Expo sign-in is claimed.
- Weekly sending remained locally disabled. An Admin 503 is availability/configuration evidence, not successful external delivery.

No application code or proof test was edited to turn these observations green.

## Evidence and verification

Raw task evidence is retained under the operator's task directory `cg-today-04-role-perms-20261031`, outside the repository. The committed JSON carries the sanitized successful backend observations for review without requiring local credentials.

| Retained artifact | What it establishes |
| --- | --- |
| `web-matrix-v2.result.txt` | Actual office form sign-ins and 62 scoped HTTP observations. |
| `web-state-and-weekly.result.txt` | 12 persistence/weekly/step-up checks, including the Admin send limitation. |
| `mobile-api-matrix-v2.result.txt` | 82 API-only HTTP observations and 12 identity/state assertions. |
| `existing-rbac-tests.txt` | Existing focused PHPUnit suite: 33 tests, 386 assertions, passed. |
| `device-inspector-home.snapshot.txt`, `device-inspector-home.png` | Actual Inspector Home identity after form login. |
| `device-inspector-identity.snapshot.txt`, `device-inspector-identity.png` | Inspector account email in Settings. |
| `device-inspector-signed-out.snapshot.txt` | Normal logout returned the blank login form. |
| `native-metro-signed.log` | Dedicated signed Metro launch; DevTools sandbox warning was not repaired or used to bypass authentication. |
| `expo-storage-blocker.snapshot.txt`, `expo-storage-blocker.png` | Actual provisional Expo storage barrier, before credential entry. |
| Original `web-matrix.result.txt`, `mobile-api-matrix.result.txt` | Exploratory mismatches, not promoted to passing evidence. |

The existing automated selection was `SimplifiedWebRbacTest|WebAuthenticationTest|MobileAuthenticationTest|DistrictAccessTest` using the repository's PHPUnit configuration. Worker-written matrix scripts are observation proposals, not replacements for those existing tests.

Claim proved: the existing focused authentication/RBAC regression selection passes at the inspected API revision | Test: the four existing PHPUnit suites above (33 tests / 386 assertions) | Would it fail on regression? yes for their covered assertions; not proof of successful Farmer app sign-in, disabled-account login, every API route, or successful weekly delivery.

worker-written tests are proposals, never proof of their own change; the implementer must never edit a proof test to make it pass; only the captain or the named delegate promotes a proposal to proof.
