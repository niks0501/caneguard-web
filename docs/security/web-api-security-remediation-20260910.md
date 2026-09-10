# Web/API security remediation (2026-09-10)

This note records the Web/API changes for the CaneGuard security audit issues #85-#95. It is implementation and review evidence; browser, production, staging, and device verification remain separate activities.

## Remediated controls

- **#85 CSV formula injection:** every exported cell is checked for a leading `=`, `+`, `-`, `@`, tab, carriage return, or line feed. Such text is prefixed with an apostrophe before `fputcsv()` writes it.
- **#86 referral-summary session loss:** the duplicate `web` middleware was removed from both API referral-summary routes. The existing stateful API middleware remains the single cookie-session boundary.
- **#87 unauthenticated API errors:** API authentication uses the JSON `401 UNAUTHENTICATED` contract regardless of the request's `Accept` header. The API no longer attempts the browser-only `login` redirect, avoiding the missing-route exception and its stack-trace log amplification.
- **#88 Host-header trust:** configured application roots and an exact configured host allow-list are used. Laravel rejects untrusted hosts, and generated URLs use `APP_URL` rather than request host input. `APP_TRUSTED_HOSTS` is an optional comma-separated hostname list; `APP_URL` is always included.
- **#89 MapLibre:** `maplibre-gl` and the lockfile are upgraded to the current non-vulnerable 6.x release. Map popups continue to use React children; no HTML-string popup path is introduced.
- **#90 response headers:** API and server-rendered responses receive CSP, frame protection, MIME sniffing protection, referrer and permissions policies. HSTS is emitted only when Laravel sees an HTTPS request; local HTTP responses do not opt a host into HSTS. Inline server-rendered content uses a per-response CSP nonce.
- **#91 login spray throttling:** the existing per-email+IP limiter is retained and joined by configurable per-IP and global limits. Production defaults are 5/email+IP, 30/IP, and 300/global attempts per minute; QA keeps its existing 60/email+IP override while the IP/global limits remain active.
- **#92 safe errors/debug checks:** all exception paths use either the documented JSON contract for API/JSON requests or a static generic HTML response for other requests. Exception text and debug pages are not returned even if runtime debug configuration is accidentally enabled. The staging validator rejects `APP_DEBUG=true`, and the staging runtime forces `APP_DEBUG=false`.
- **#94 bounded report map:** map requests default to at most 1,000 located features and accept a bounded `limit` up to 1,000. Responses include `limit`, `returned_count`, and `truncated`; clients must narrow filters when truncation is reported.
- **#95 Mobile sessions:** a Mobile bearer session can list its own active Mobile sessions and revoke one by its server-issued session identifier. Responses never include bearer tokens, token hashes, or session payloads; ownership is enforced in the query and revocations are audited.

## Dependency gate

`.github/workflows/web-api-pr-quality-gate.yml` runs both scanners after installation:

- `npm audit --audit-level=high`
- `composer audit --locked --no-interaction --no-dev --abandoned=fail`

High and critical npm advisories, and any Composer advisory or abandoned package, fail the PR gate. Lower-severity npm advisories are still reported by npm but do not fail this gate because the repository currently has no reviewed, reachable production path for that class of transitive finding. There are no untracked exceptions for this remediation; `.trivyignore` remains reserved for an explicitly reviewed advisory ID with an owner and expiry.

The Composer lockfile refreshes Guzzle and CommonMark to versions outside the audit's affected ranges. The npm lockfile refreshes MapLibre and its required runtime dependencies and clears the baseline advisories. Re-run both commands after dependency changes; do not replace either gate with an unconditional ignore.

## Mobile coordination and expiry decision

This repository does not modify `caneguard-mobile`. Mobile issue #70 still requires coordinated client work so biometric logout clears local credentials and, where appropriate, calls server logout or the new device-revocation endpoint. The API's documented `expires_at: null` Mobile-token policy is intentionally unchanged. Choosing a finite expiry, silent re-enrollment, or accepting the existing expiry model remains the captain-owned decision `cg-mobile-token-lifecycle-decision-20260910`.
