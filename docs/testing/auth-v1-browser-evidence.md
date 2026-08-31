# Auth v1 browser evidence

This report records the MySQL-backed browser-evidence follow-up for [PR #77](https://github.com/niks0501/caneguard-web/pull/77).

The isolated worktree started from PR #77's exact head repository and branch, `niks0501/caneguard-web:fm/cg-auth-web-implementation-20260830`, at `d3acea604a98f01574f757561fc05df12f5ff38b`.

The primary checkout and QA, staging, and production environments were not touched.

## Local setup

The host MySQL daemon was reachable at `127.0.0.1:3306` with the provisioned local credential loaded only into shell variables.

The API used the disposable local `caneguard_test` database with MySQL 8.0.46, InnoDB tables, `utf8mb4_unicode_ci`, and the configured `+00:00` session timezone.

The disposable schema was migrated and seeded before the browser pass.

The first MySQL migration attempt exposed a real MySQL 1059 error because the generated `personal_access_tokens_tokenable_type_tokenable_id_device_id_index` identifier exceeded MySQL's 64-character limit.

The migration now uses the explicit MySQL-safe `pat_tokenable_device_id_idx` name and the matching rollback name.

`api/tests/MySql/AuthMySqlSchemaTest.php` executable coverage verifies the auth columns and the safe index name.

The API ran on `http://localhost:8001` because port 8000 was occupied by the primary checkout.

The Web app ran on `http://localhost:5174` because port 5173 was occupied by the primary checkout.

The local queue worker ran alongside the API, and realtime remained local-only and optional for these REST and browser-auth paths.

The API health response was HTTP 200 with `status: ok`, `database: ready`, and `storage: ready`.

The mailer used Laravel's local `log` mailer, and links were extracted only from the local log without recording their query values.

No password, reset token, verification signature, bearer token, or MySQL credential is recorded in this report.

## Browser evidence

All interactions below used `npx -y chrome-devtools-axi` against the isolated Web app.

| Flow | Reproducible action | Observed browser/API result |
| --- | --- | --- |
| Reviewer login and session bootstrap | Sign in with the seeded local `mao@caneguard.test` reviewer account. | The browser reached `/dashboard`, showed `Reviewer access`, and received `GET /api/v1/me` HTTP 200 from the MySQL-backed API. |
| Session reload | Reload the authenticated dashboard. | The browser remained on `/dashboard`, restored the reviewer header, and completed a fresh session bootstrap. |
| Logout | Activate the reviewer `Sign out` button. | The browser returned to `/login` after `POST /logout` HTTP 204. |
| Administrator role boundary | Sign in with the seeded local administrator account. | The browser reached `/dashboard` and showed `Administrator access`. |
| Field-reporter role boundary | Sign in with the seeded local `field@caneguard.test` account and with the newly registered field account. | Both attempts stayed on `/login` and showed `This account cannot access the web workspace.` |
| Invalid credentials | Submit the reviewer email with an intentionally incorrect password. | The browser showed `The email or password is incorrect.` after the API returned HTTP 422. |
| Login throttling | Submit six rapid incorrect-password attempts for the fresh synthetic email `mysql-throttle-20260901@example.test`. | The browser-context requests returned HTTP `422, 422, 422, 422, 422, 429`, and the browser showed `Too many sign-in attempts. Wait a minute before trying again.` |
| Service error and retry | Stop only the isolated API, open `/reports`, restart the API, and activate `Try again`. | The browser showed `CaneGuard could not confirm your session or complete sign-out because the service is unavailable. You have not been logged out.` and then recovered to `/login` after retry. |
| Registration | Register the synthetic field account `mysql-browser-20260901@example.test`. | The browser showed `Account created.` and `Continue to verification`; no client role field was submitted. |
| Email verification link | Extract the verification link from the local mail log and open it in the browser. | The browser showed `Email verified`, `Your email is verified.`, and `You can now sign in to continue.` |
| Invalid verification link | Open a synthetic link with an invalid signature. | The browser showed `This verification link is invalid or expired. Request a fresh link below.` |
| Generic recovery | Submit `unknown-mysql-20260901@example.test` on `/forgot-password`. | The browser showed `Check your email.` with the generic one-hour recovery message. |
| Password recovery and reset | Submit the seeded reviewer email, extract the local reset link from the mail log, open it, and submit a new local test passphrase. | The browser showed `Password updated.` and `All existing sessions were signed out. Sign in again with the new password.` |
| Expired recovery link | Request a recovery link for the synthetic MySQL account, age its local disposable reset record beyond one hour, and submit the link. | The browser showed `This recovery link is invalid, expired, or already used.` |
| Invalid reset value | Submit a synthetic invalid reset value. | The browser showed `This recovery link is invalid, expired, or already used.` |
| Password step-up failure | From the authenticated reviewer browser session, call `POST /api/v1/auth/password` with a wrong current password. | The browser DevTools evaluation returned HTTP 422 with code `STEP_UP_REQUIRED`. |
| Email step-up failure | From the authenticated reviewer browser session, call `PATCH /api/v1/auth/email` with a wrong current password. | The browser DevTools evaluation returned HTTP 422 with code `STEP_UP_REQUIRED`; the account email was unchanged. |
| Biometric step-up success and revocation | From the administrator session, call `POST /api/v1/auth/biometric/disable` with the local current password, then reload. | The browser DevTools evaluation returned HTTP 200 with code `BIOMETRIC_DISABLED`; the authenticated API session then returned HTTP 401 `UNAUTHENTICATED`, and reload returned to `/login`. |
| Role-management authorization boundary | From the authenticated reviewer session, call `PATCH /api/v1/admin/users/{user-uuid}/role` with a valid step-up payload. | The browser DevTools evaluation returned HTTP 403 with code `FORBIDDEN`; the administrator role was unchanged. |

The PR has no Web account-security form for the step-up endpoints.

Those endpoint paths were exercised in the authenticated browser context through Chrome DevTools evaluation rather than by inventing a UI flow.

## Automated MySQL coverage

`php api/vendor/bin/phpunit --configuration=api/phpunit.xml api/tests/Feature/AuthSecurityTest.php` passed against `caneguard_test` with 17 tests and 114 assertions.

`npm run api:test:mysql` passed against `caneguard_test` with 7 tests and 373 assertions.

The MySQL PHPUnit configuration uses the null broadcast driver so the database suite does not depend on a separately running realtime server.

## Result

MySQL-backed browser evidence passed for the implemented Auth v1 Web paths in the disposable local environment.

The MySQL migration defect was fixed without weakening authentication or authorization behavior.

No QA, staging, or production environment was contacted.
