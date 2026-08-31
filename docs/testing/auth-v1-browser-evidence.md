# Auth v1 browser evidence

This report records the browser-evidence follow-up for [PR #77](https://github.com/niks0501/caneguard-web/pull/77).

The isolated worktree started from PR head `niks0501/caneguard-web:fm/cg-auth-web-implementation-20260830` at `a7bfec089b380c9eb4b69380d43fcc3ece7a3341`.

The primary checkout and QA, staging, and production environments were not touched.

## Local setup

The host MySQL daemon was already running, but its local application and administrator credentials were not available to this worktree.

To keep the evidence isolated and reversible, the API used a disposable SQLite database at `api/database/database.sqlite`.

The API ran on `http://localhost:8001` because port 8000 was occupied by the primary checkout.

The Web app ran on `http://localhost:5174` because port 5173 was occupied by the primary checkout.

The local queue worker and Reverb process ran alongside the API.

The API health response was HTTP 200 with `status: ok`, `database: ready`, and `storage: ready`.

The mailer used Laravel's local `log` mailer, and links were extracted only from `api/storage/logs/laravel.log`.

No password, reset token, verification signature, or bearer token is recorded in this report.

## Browser evidence

All interactions below used `npx -y chrome-devtools-axi` against the isolated Web app.

| Flow | Reproducible action | Observed browser/API result |
| --- | --- | --- |
| Reviewer login and session bootstrap | Sign in with the seeded local `mao@caneguard.test` reviewer account. | The browser reached `/dashboard`, showed `Reviewer access`, and received `GET /api/v1/me` HTTP 200. |
| Session reload | Reload the authenticated dashboard. | The browser remained on `/dashboard`, restored the reviewer header, and completed a fresh session bootstrap. |
| Logout | Activate the reviewer `Sign out` button. | The browser returned to `/login` after `POST /logout` HTTP 204. |
| Administrator role boundary | Sign in with the seeded local administrator account. | The browser reached `/dashboard` and showed `Administrator access`. |
| Field-reporter role boundary | Sign in with the seeded local `field@caneguard.test` account and with the newly registered field account. | Both attempts stayed on `/login` and showed `This account cannot access the web workspace.` |
| Invalid credentials | Submit the reviewer email with an intentionally incorrect password. | The browser showed `The email or password is incorrect.` after the API returned HTTP 422. |
| Login throttling | Submit six rapid incorrect-password attempts for a fresh synthetic email. | The first five requests returned HTTP 422 and the sixth returned HTTP 429; the browser showed `Too many sign-in attempts. Wait a minute before trying again.` |
| Service error and retry | Stop only the isolated API, open `/reports`, then restart the API and activate `Try again`. | The browser showed `CaneGuard could not confirm your session or complete sign-out because the service is unavailable. You have not been logged out.` and then recovered to `/login` after retry. |
| Registration | Register `browser-evidence-20260901@example.test` as a field reporter using a local test passphrase. | The browser showed `Account created.` and `Continue to verification`; no client role field was submitted. |
| Email verification link | Extract the verification link from the local mail log and open it in the browser. | The browser showed `Email verified`, `Your email is verified.`, and `You can now sign in to continue.` |
| Invalid verification link | Open a synthetic link with an invalid signature. | The browser showed `This verification link is invalid or expired. Request a fresh link below.` |
| Generic recovery | Submit an unknown synthetic email on `/forgot-password`. | The browser showed `Check your email.` with the generic one-hour recovery message. |
| Password recovery and reset | Submit the seeded reviewer email, extract the local reset link from the mail log, open it, and submit a new local test passphrase. | The browser showed `Password updated.` and `All existing sessions were signed out. Sign in again with the new password.` |
| Invalid reset value | Submit a synthetic invalid reset value. | The browser showed `This recovery link is invalid, expired, or already used.` |
| Password step-up failure | From the authenticated browser session, call `POST /api/v1/auth/password` with a wrong current password. | The browser DevTools evaluation returned HTTP 422 with code `STEP_UP_REQUIRED`. |
| Email step-up failure | From the authenticated browser session, call `PATCH /api/v1/auth/email` with a wrong current password. | The browser DevTools evaluation returned HTTP 422 with code `STEP_UP_REQUIRED`; the account was unchanged. |
| Biometric step-up success and revocation | From the administrator session, call `POST /api/v1/auth/biometric/disable` with the local current password, then reload. | The browser DevTools evaluation returned HTTP 200 with code `BIOMETRIC_DISABLED`; reload returned to `/login`, proving the current session was revoked. |
| Role-management authorization boundary | From the authenticated reviewer session, call `PATCH /api/v1/admin/users/{user-uuid}/role`. | The browser DevTools evaluation returned HTTP 403 with code `FORBIDDEN`; the reviewer could not use the admin endpoint. |

The PR has no Web account-security form for the step-up endpoints, so those endpoint paths were exercised in the authenticated browser context through Chrome DevTools evaluation rather than by inventing a UI flow.

## Result

Browser evidence passed for the implemented auth-v1 Web paths in the disposable local environment.

The remaining verification gap is that this evidence used SQLite because the worktree could not authenticate to the already-running MySQL daemon.

No implementation defect was exposed by the browser pass.
