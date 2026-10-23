# Official weekly reporting — content v1

## Authority and scope

Official versions are built only by `BuildWeeklyReportContent` through `DistrictReportWorkflow`. `BuildReportDocument` and `BuildMonthlyReportSummary` remain ad-hoc analytics previews and never supply an official version. Existing ADR-002 pilot membership and verified office sessions remain the ceiling, and the Admin Web role is the authority: [simplified Web RBAC](../../docs/security/simplified-web-rbac.md) is the single maintained role/action matrix.

- Reviewers prepare; only an active verified `admin` approves the exact displayed hash.
- Sending requires that same active verified `admin`, current approval, unchanged source evidence, an active immutable `DistrictRecipientSet`, and `CANEGUARD_WEEKLY_SEND_ENABLED=true` (default **false**).
- Legacy `staff:manage`, `report:approve` and `report:send` grant rows are compatibility storage; they are not required for approval or send and confer no approval, send or management authority.
- Inspectors, farmers and foreign-district identities cannot read any official document or PDF.
- Public registration is disabled unconditionally; office identities come from the authorized operator provisioning process.

The five rows are Healthy, RSSI, Sugarcane Mosaic, Sugarcane Rust and Sugarcane Smut. Historical Downy mildew rows are excluded before aggregation. Mixed/multiple, unable-to-classify and unattributed cases are separately counted, never relabelled Healthy. Staff classification takes precedence over AI, then the reporter's RSSI concern. Confirmation requires staff classification **and** `verification_outcome=verified`. Active field/reviewer work is under review; all other attributed cases remain suspected.

## Sealed contract

`DistrictReportVersion.content.contract = weekly-report-content-v1` contains district, ISO week, case/source/duplicate/out-of-scope counts, five disjoint disease status rows, unclassified buckets, open/closed counts, barangays with confirmed-by-disease and per-disease area, approximate named farmer/farm references, report count carrying farmer information, recorded actions, late evidence, seven daily SQL-aggregated receipt counts, coarse case-location clusters, method statements, an evidence digest, and an optional restricted appendix.

All weeks are half-open UTC query intervals corresponding to Monday 12:00 AM through Sunday 11:59 PM Asia/Manila. Counts use server `submitted_at` (receipt), never the observation week. Late arrivals list affected prior observation weeks. Re-preparing an earlier week also records observations from that week received later, without adding them to its case counts. Those later rows join source evidence so reconciliation creates a new version.

- Case counts exclude `canonical_report_id` rows, but all duplicate source references remain sealed.
- Farmers: distinct `(normalized barangay, normalized farmer/farm name)` pairs. The label is **name-matched, approximate, not verified identity**. Record count is printed separately.
- Area: maximum measured area per `(barangay, named farmer/farm, disease)` group, summed **within each disease only**. Unnamed farms cannot establish an overlap-controlled group and are omitted from that estimate. The raw reported-area sum is secondary and labelled **may overlap**. Unique geometric area is `null`; field surveys are not yet linked to reports. There is no cross-disease hectare total.
- Content hashing recursively sorts object keys, retains deterministic list order and excludes wall-clock/preparer/render fields. An evidence digest captures evidence-only corrections. Unchanged preparation returns the existing version. Changes link `supersedes_version_id` and use `initial`, `correction` or `late_evidence`; old content is immutable.

## Documents

- `GET /api/v1/district-reports/{uuid}/document`: HTML derived exclusively from sealed content. `disease=healthy|rssi|mosaic|rust|smut` narrows class/area rows and charts. Unfiltered weekly summary, barangay, trend and map sections remain explicitly labelled full scope. This convenience view never changes the approval hash.
- `GET /api/v1/district-reports/{uuid}/pdf`: the full A4 letterhead, never filtered. A draft is labelled unapproved. Approval renders once, snapshots the officer's printed name/title/time, and stores immutable base64 PDF bytes, `document_sha256` and `renderer_version`. Downloads and delivery verify the stored bytes against that digest; they never rebuild from current reports. This avoids Dompdf's nondeterministic metadata affecting approved bytes. `X-Report-Renderer-Drift` reports asset/renderer changes without replacing the approved artifact.
- Filename: `caneguard-weekly-{district-code}-{ISO-week}-v{version}.pdf`.

The map is pure server-rendered SVG over the bundled, attributed Nasugbu 2011 barangay reference boundaries (42 real polygons). These are a reference, not certified mill-district jurisdiction or surveyed farm boundaries. Coordinates are coarsened to 0.01-degree count clusters; unavailable and outside-extent cases are reported. Boundaries measure no hectares. Four chart families (class status, barangay cases, daily receipts, hectares by barangay/class) render as static SVG with direct numbers. Large barangay charts are paginated, not truncated. The bundled solid palette is tested against `src/styles/tokens.css`.

The list/prepare/approve API responses never expose raw content, appendix names, source hashes or PDF bytes. An appendix requires explicit `appendix=true` at preparation **and** `CANEGUARD_WEEKLY_APPENDIX_ENABLED=true` (default false) **and** an active verified `admin` office session; legacy `report:approve` rows are compatibility storage, not an appendix gate. Default HTML always omits names; an appendix view needs the same privacy gate. PDF access to a version containing names is gated too. Closing privacy after preparation cancels queued delivery of such a version. Neither body nor charts contain farmer names or exact farm coordinates.

## Explicit transport and receipts

Only a new `POST .../{uuid}/send` intent dispatches `DeliverDistrictReport`, after commit, on the **database** queue (never synchronous HTTP delivery). Run a normal application worker on that connection; there is no report cron, scheduled approval, or automatic send.

The job rechecks `checkPending()` under the district lock immediately before a durable `delivering` claim. Duplicate job delivery cannot send twice. One attempt is permitted. On provider acceptance it records `sent`, SMTP Message-ID, completion time and an immutable `delivered` audit event bound to the ordering actor, original named grant/revision, recipient set and idempotency key. On failure it records `failed`, a sanitized reason and `delivery_failed`; secrets and SMTP diagnostics are never persisted. Worker failure/timeout is marked uncertain. A crash claim is not automatically retried; provider logs must be checked before another explicit order.

SMTP acceptance is **not** guaranteed inbox delivery. SMTP Message-ID is the accepted message's correlation identifier; SMTP does not universally supply a separate provider queue ID or final delivery notification. The website states that distinction. A failed/cancelled attempt can be replaced only by a fresh explicit send key with all gates current. Replaying the same key never creates another attempt. Corrections require their own approval and send; an already-sent version is not resent.

The dedicated `weekly_smtp` mailer cannot fall back to log/array/default mailers. Symfony requires TLS/STARTTLS and uses normal certificate verification. Configure `CANEGUARD_WEEKLY_SMTP_SCHEME` (`smtp` for STARTTLS, `smtps` for implicit TLS), host, port, username and password in the environment, plus the existing `MAIL_FROM_*` identity. No credentials or real recipient are seeded. The captain's dummy test address must first be entered in an office-approved `DistrictRecipientSet`; keep the send gate closed until that decision is recorded. No SMTP connection or email is attempted by the test suites.

## Website schedule

Settings exposes `GET/PUT /api/v1/district-reporting-settings`. The initial state is **Not configured**, not a production schedule. An active verified `admin` office session with password step-up and an office decision reference saves the preparation day/time in Asia/Manila, with a security audit naming the district; the legacy `staff:manage` row is compatibility storage and is never consulted. The UI uses a 12-hour AM/PM clock. This is schedule configuration only: it does not change Monday–Sunday week boundaries or create an automated send/approval/reminder job.

## Verification and operational limits

Targeted suites: `WeeklyReportContentTest`, `WeeklyReportPdfTest`, `DeliverDistrictReportTest`, `DistrictReportingSettingsTest`, and the existing `DistrictReportWorkflowTest`; website tests cover authority, derived filters, receipt honesty, offline controls and schedule persistence.

Approved bytes increase database storage; retaining them is deliberate so approved artifacts survive renderer/font changes. Migration rollback must not be run after multiple attempts exist for a version, because restoring the original one-transmission uniqueness would fail; deployment rollback should roll code forward, preserving history. Real SRA recipient, production schedule, certified boundary updates, geometric survey linking and bounce tracking remain external/out of scope.
