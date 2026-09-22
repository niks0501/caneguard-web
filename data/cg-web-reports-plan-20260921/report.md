# CaneGuard Web — Documented Reports Implementation Plan

Date: 2026-09-21
Decisions recorded: 2026-09-22
Status: **decided** — Q1–Q4 locked by the captain; Q5 open pending a dependency choice (see §11)
Scope: weekly, monthly, and custom-range reported-case documents with an in-app preview, generated in one click or a few clicks.

---

## 0. Decisions recorded (2026-09-22)

The captain reviewed the plan on the board and locked the following. These supersede the corresponding
"open question" text below; the sections have been updated in place.

| # | Decision | Effect on the plan |
| --- | --- | --- |
| **Q1** | **PHT (UTC+8)** defines document period boundaries, printed on every document. The dashboard's existing UTC monthly panel is **left unchanged**. | Weekly/monthly/custom boundaries are computed in `Asia/Manila`. The document always states its period and timezone. `BuildMonthlyReportSummary` keeps its UTC semantics. |
| **Q2** | **Live HTML document in a same-origin iframe**, with a route-scoped `frame-ancestors` allowance. | The preview is the document route itself — one template, zero drift. Requires the narrow, config-driven, route-scoped CSP change in `SecurityHeaders`, with a regression test proving every other HTML route still denies framing. |
| **Q3** | **Appendix off by default**, explicitly opt-in per document, with the farmer-reference line visibly marked. | The case register appendix is never emitted unless requested. The builder warns that farmer/farm references are included when it is enabled. |
| **Q4** | **Both** the Dashboard and Submitted Reports, opening the same single builder. | One builder component, two entry points. |
| **Rollout** | **P0, P1, P2 approved** in that order, each following its stated gate. **P3 not selected.** **P4 deferred**, to be re-planned before starting. | The build round is Phases 0–2. P3 (depth: appendix defaults, saved filters, refinements) and P4 (reach: scheduled/emailed documents) are not in this round. |
| **Preview mock** | Approved: "I love the format and the future contents of the generated document." | The document template structure in §6 is confirmed as the target design. |
| **Q5** | **Open.** The captain asked whether the dependency requires Chromium given he uses only Brave, and why the risk was rated high. Both answered in §11; the risk severity has been corrected to **Medium** in §10. | §7 now records the Brave-on-host path, which avoids installing a second browser. |

---

## 1. What exists today

| Capability | Where | Limitation |
| --- | --- | --- |
| CSV case export | `GET /api/v1/reports/export` → `api/app/Actions/Reports/ExportReports.php`; UI button in `src/pages/SubmittedReportsPage.tsx` ("Export CSV", `handleExport`) | Machine-readable rows only. No document, no narrative, no aggregate sections, no preview. |
| Monthly aggregate JSON | `GET /api/v1/reports/summary?month=YYYY-MM` → `BuildMonthlyReportSummary` | **UTC calendar month only.** No week, no arbitrary range. JSON only — never rendered as a document. |
| Dashboard monthly panel | `src/components/dashboard/MonthlyCaseSummary.tsx` | Screen-only React component. Not printable, not shareable, not a PDF. |
| Print-ready HTML document | `GET /api/v1/reports/{report}/referral/summary` → `api/resources/views/referrals/summary.blade.php` | **The existing precedent.** Blade view, CaneGuard-styled, `@media print`, `break-inside: avoid`, a "Print summary" button calling `window.print()`, served inline or as an attachment. Single case only. |

So the building blocks exist: an aggregate action, a filter surface, a CSV row projection, and a proven server-rendered branded-document pattern. What is missing is a **period-parameterised document** and a **PDF artefact**.

Two constraints discovered in the code that shape the whole design (both are load-bearing, not incidental):

1. **`api/app/Http/Middleware/SecurityHeaders.php`** sets, for every HTML response:
   `default-src 'none'; frame-ancestors 'none'; … img-src 'self' data:; style-src 'self' 'nonce-…'; script-src 'self' 'nonce-…'; font-src 'self'` **plus `X-Frame-Options: DENY`**.
   → A report document **cannot** be embedded in an iframe today, and **Poppins cannot be fetched from Google Fonts** (the SPA loads it from `fonts.googleapis.com` in `src/index.css`; the document origin is not allowed to).
   → Inline `<style>`/`<script>` in a Blade document must carry `nonce="{{ request()->attributes->get('csp_nonce') }}"`, exactly as `referrals/summary.blade.php` already does.
2. **Web and API share one origin** in the supported deployment: `docs/staging.md` requires `VITE_API_BASE_URL` to equal `QA_PUBLIC_URL`, and `vite.config.ts` proxies `/api`, `/sanctum`, `/login`, `/logout` to the private API when `QA_API_PROXY_TARGET` is set ("the API remains private behind the Web proxy"). Locally without that proxy the SPA talks to `http://localhost:8000` cross-origin, and `SESSION_SAME_SITE` defaults to `lax` (`api/config/session.php`).

---

## 2. Research: report generation options

Evaluated against the captain's criteria: output beauty, CaneGuard brand fidelity, offline behaviour, dependency weight, maintenance.

| Option | Beauty / brand fidelity | Offline | Dependency weight | Maintenance |
| --- | --- | --- | --- | --- |
| **A. HTML → PDF, headless Chromium** (`spatie/laravel-pdf` + `spatie/browsershot` + Puppeteer/Chromium) | **Highest.** Real CSS engine: flex/grid, `@page` margin boxes (Chrome 131+) for `counter(page)`, repeating `thead`, `break-inside: avoid`. The CaneGuard token sheet transfers directly. | Runs entirely on the host; no network needed at render time once fonts/logo are self-hosted. | Heaviest: Node 22+/Puppeteer 23+ (~`node` already a documented staging host prerequisite in `docs/staging.md`) and a ~300 MB Chromium binary; ~250 MB peak render memory, seconds not milliseconds. | MIT, Spatie-maintained, driver-based. |
| **B. Pure-PHP builders** (`barryvdh/laravel-dompdf`, `mpdf/mpdf`) | Limited. Dompdf is CSS 2.1-ish: **no flexbox, no grid**, no `@page` margin boxes, table rows cannot split across pages. mPDF's own README says modern CSS is unlikely to improve and recommends headless Chrome. | Fully local, trivially offline. | Lightest: one Composer package, zero binaries, ~12–26 MB render memory, sub-second. | Both long-lived. Dompdf LGPL-2.1; **mPDF GPL-2.0-only** (licence review needed). |
| **C. Paged-media engine, no browser** (WeasyPrint via `spatie/laravel-pdf`'s WeasyPrint driver) | **Best pure paged-media CSS**: margin boxes, named pages, running elements, real footnotes. But it is a second layout engine — flex/grid trail browsers, and it runs no JavaScript. | Fully local. | Medium: Python + Pango/Cairo toolchain — a *new language runtime* for this repo. | Maintained, but adds a runtime the project does not otherwise have. |
| **D. Containerised renderer** (Gotenberg, Chromium over HTTP) | Same as A. | Local service, no internet. | Isolates Chromium in its own container (512 MB floor, 1 GB / 1 vCPU recommended) but **this repo has no Dockerfile or compose file**; staging is a bare host. | Well maintained; `spatie/laravel-pdf` ships a Gotenberg driver. |
| **E. Client-side generators** (`@react-pdf/renderer`, pdfmake, jsPDF+html2canvas) | `@react-pdf/renderer` is decent but is a **separate renderer with its own primitives** (flexbox subset, no grid, no pseudo-selectors, TTF/WOFF only, no variable fonts) — the CaneGuard CSS would have to be re-authored as a parallel layout. `html2canvas` output is a rasterised image: unacceptable for print. | Genuinely offline in the browser. | Adds a PDF stack to the client bundle (keep it lazy-loaded) — and a *second* template to maintain. | Maintained. |
| **F. Print the HTML from the browser** (`window.print()` → "Save as PDF") | **Pixel-identical to the preview by definition.** | Fully offline. | **Zero** new dependencies. | Zero maintenance — and **already shipped** in `referrals/summary.blade.php`. | 

### Winner: A — `spatie/laravel-pdf` with the Browsershot (headless Chromium) driver, rendering a server-side Blade document.

Reasons, in priority order:

1. **Brand fidelity is the point of this request.** The brief asks for *beautiful documented reports*. Only a real browser engine renders the CaneGuard design system — `src/styles/tokens.css` brand/functional colours, Poppins, the 16 px text floor, the 5 px spacing scale — plus flex/grid and print CSS, without a second template. Dompdf would force a table-and-float rewrite of every section; `@react-pdf/renderer` would force a JSX rewrite of the same.
2. **Verified compatible with this repo, today.** `spatie/laravel-pdf` **2.13.1** requires `php ^8.2` and `illuminate/contracts ^11.0|^12.0|^13.0`. This repo runs PHP 8.3.6 and `laravel/framework ^13.8`. `spatie/browsershot` 5.4.0 needs `php ^8.2` + `symfony/process ^6|^7|^8` — no framework constraint. Node 24.19.0 is installed and **Node is already a documented staging host prerequisite**. No blocker.
3. **The preview requirement is satisfied by one template, not two.** The same Blade document is the on-screen preview *and* the PDF source. There is no drift between what the captain previews and what prints.
4. **Print quality that genuinely holds up**: page-margin footers with `counter(page)`/`counter(pages)`, repeating table headers across page breaks, `break-inside: avoid` on metric cards. Note honestly: Chromium does **not** support dynamic running headers (`string-set`/`string()`) or CSS footnotes — this plan does not need either.
5. **Driver-swappable.** The document is a Blade view + a payload. Moving to Gotenberg (D) or WeasyPrint (C) later is a config change, not a rewrite.

### Fallback: B — `barryvdh/laravel-dompdf` (pure PHP)

`barryvdh/laravel-dompdf` **v3.1.2** requires `illuminate/support ^9|^10|^11|^12|^13.0` and `dompdf/dompdf ^3.0` — also Laravel 13 compatible, also verified.

This is the right fallback because it fails in the *opposite* direction from the winner: the winner's single realistic failure mode is "this host cannot run Node/Chromium/Puppeteer" (restricted shared hosting, a locked-down image, a deployment that refuses a 300 MB binary). In that world a Python/Pango toolchain (C) is no more available, so the only viable retreat is the one with **zero system dependencies**. Dompdf costs fidelity — the plan pre-pays that cost by keeping critical layout print-safe (§6), so the swap is a CSS adjustment rather than a rewrite.

Two escalation paths if the fallback's fidelity also proves insufficient: the **WeasyPrint driver** (C) if Python is acceptable, and the **Gotenberg driver** (D) if containers become available. Both are `LARAVEL_PDF_DRIVER` changes inside the same package.

### Not chosen, and why

- **`@react-pdf/renderer` (E)** — would mean maintaining a parallel document layout in a second renderer forever, and the CaneGuard design tokens do not port.
- **`jspdf` + `html2canvas` (E)** — rasterised output; fails print quality outright.
- **Gotenberg (D)** — best answer *if and when* the project acquires container infrastructure; premature today (no Dockerfile in-repo, bare-host staging).
- **Browser print only (F)** — not rejected; it is the **degradation path**. It is what `referrals/summary.blade.php` already does, it needs no dependency, and it is why the recommended design keeps working even if Chromium is unavailable (§5).

---

## 3. Report types

All three types are the **same code path** with a different `[from, to)` range. No branching in the template, no per-type metrics.

| Type | Period definition | Default when opened | Document period label |
| --- | --- | --- | --- |
| **Weekly** | ISO week, Monday–Sunday (`PHT`) | The last **completed** week relative to today | `Week 38 · 14–20 September 2026` |
| **Monthly** | Calendar month | The last **completed** month | `September 2026` (1–30 Sep) |
| **Custom range** | Explicit `from` / `to` inclusive | Today − 30 days → today | `15 August – 20 September 2026 (37 days)` |

Rules that apply to all three:

- A **partial-period warning** appears in the document header when the range includes the current, still-in-progress week/month — so a mid-week report is never mistaken for a complete one.
- **Maximum span 366 days** on custom ranges, rejected at validation. This bounds both the SQL aggregate cost and a single Chromium render.
- The range is always rendered back into the document footer together with the active filters, so a saved or printed document is self-describing.
- **Timezone: PHT (UTC+8) — decided (Q1).** All three period boundaries are computed in `Asia/Manila`, and the timezone is printed in every document. The existing monthly summary stays UTC-scoped (`BuildMonthlyReportSummary`: "cases submitted during one UTC calendar month"), because the captain chose not to unify the dashboard panel in this round; the document states its own boundary rule explicitly so the two are never confused. Recommended follow-up, not in this round: revisit unification once the documents are in daily use.

---

## 4. The generation flow, in clicks

Entry point on the Dashboard beside the existing monthly panel, and on Submitted Reports beside "Export CSV". Both open the same builder.

```
Dashboard / Submitted Reports
  └─ [Generate report]                          ← click 1
       └─ Report builder overlay
            ├─ period control:  Weekly | Monthly | Custom
            ├─ date control:    week / month / from–to
            ├─ filters:         barangay, possible condition, case state,
            │                   field-validation state, queue
            ├─ LIVE DOCUMENT PREVIEW  (the real document, same template)
            └─ [Download PDF]  [Print]           ← click 2
```

Click counts, measured against the common cases:

| Goal | Clicks |
| --- | --- |
| **This week's standard report** (last completed week is the default) | **2** — open builder, Download PDF |
| **This month's standard report** | **3** — open, select `Monthly`, Download PDF |
| **A specific week** | **3** — open, set the week, Download PDF |
| **An arbitrary range** | **4–5** — open, `Custom`, from date, to date, Download PDF |
| **Just print it** | **2** — open, Print (browser dialog), no PDF dependency involved |

Behavioural requirements that keep this honest:

- The preview renders **as soon as the period changes** (debounced ~250 ms), so the captain never clicks "generate" to *see* something.
- Filters are remembered for the session, so the second report in a session is a 2-click action.
- The PDF button shows progress and, on failure, leaves the preview intact with the existing in-app error convention — a failed render never costs the captain the document, because the preview and Print path are independent of Chromium.

---

## 5. Preview design

The captain asked for "the document showing a preview of the generated report for whatever period the user chose".

**Decided (Q2) — render the real document HTML in a same-origin iframe.**
The preview *is* `GET /api/v1/reports/documents/report?...`, the same route the PDF renderer consumes. One template, zero drift, no Chromium render on every period change, and it degrades to fully usable when Chromium is absent. Confirmed in staging because `docs/staging.md` keeps the web and API on one origin behind the web proxy, and the web proxy already forwards `/api`.

This requires one narrow, explicit security change (the only trust-boundary change in this plan):
`SecurityHeaders` currently sends `frame-ancestors 'none'` + `X-Frame-Options: DENY` for every HTML response. The document route needs a **route-scoped** allowance — `frame-ancestors` limited to the configured embed origin, `X-Frame-Options: SAMEORIGIN` — expressed as a new `caneguard.reports.embed_origins` config value defaulting to `['self']` and set to the web origin for cross-origin local development (`http://localhost:5173` against `http://localhost:8000`). Every other HTML response keeps `frame-ancestors 'none'`; a test asserts that.

**Rejected (for the record) — preview the produced PDF in an `<iframe>` fed by an object URL.**
Literally the downloaded artefact, so drift is impossible even in principle, and it needs no CSP change at all (a `blob:` URL is same-origin). Rejected because it forces a Chromium render per period change and cannot preview at all when Chromium is unavailable — which would make the preview depend on the very dependency Q5 is still deciding.

**Local-development fallback** (no same-origin proxy, `SESSION_SAME_SITE=lax`): set `QA_API_PROXY_TARGET` so the browser still sees one origin; if that is unavailable, open the document in a new tab, exactly as `src/pages/ExpertCasePage.tsx` does for referral summaries. This is also the correct behaviour when the session cookie cannot be sent to a subframe.

---

## 6. Document template structure

One Blade view, `api/resources/views/reports/document.blade.php`, CaneGuard-branded and print-first.

```
┌─ Masthead ────────────────────────────────────────────────
│  CaneGuard lockup (brand/CaneGuard_logo_flat.svg, on light)
│  "Submitted case report — Week 38, 14–20 September 2026"
│  Generated 21 Sep 2026 09:14 PHT · by <office user> · filter summary
│  Notice: operational report counts, not population-level
│  disease statistics. Possible Condition is decision support only.
├─ Key figures ─────────────────────────────────────────────
│  Submitted reports · Estimated affected area (ha) ·
│  Requiring field validation · Closed cases
├─ Submissions over the period ─────────────────────────────
│  Per-day (weekly) or per-week (monthly/custom) counts, rendered
│  as print-safe inline SVG bars — no canvas, no JS
├─ Distribution ────────────────────────────────────────────
│  By barangay          | By Possible Condition
├─ Case lifecycle ──────────────────────────────────────────
│  Verification outcomes · Case states · Field-validation counts
├─ Expert verification ─────────────────────────────────────
│  Consult volume · expert agreement · unable-to-classify rate ·
│  time to finding · advisory coverage
├─ Operational queues ──────────────────────────────────────
│  Unassigned · needs visit · overdue against target visit date
├─ Case register appendix (OPT-IN, default off) ─────────────
│  The filtered per-case rows (same projection as the CSV export),
│  repeating <thead>, capped and continuation-noted
└─ Footer (every page, via @page margin box) ───────────────
   "CaneGuard · <period> · Page <n> of <total> · generated <date>"
```

Brand and print requirements:

- **Typography**: Poppins self-hosted as woff2 (400/600/700) served from the **API** origin, because the document CSP is `font-src 'self'` and the document must render with no network. Fallback stack `"Poppins", "Segoe UI", Roboto, Helvetica, Arial, sans-serif`, matching `src/styles/tokens.css`. Screen text keeps the 16 px floor; print uses a pt scale with a documented ~8 pt minimum.
- **Colour**: the `tokens.css` functional greens (`#2d6b40`, `#1e452a`) for headings and rules, `--color-surface-soft`/`--color-surface-tint` for section bands, the `--disease-*` colours for condition rows, danger/warning tokens for overdue and unable-to-verify. Brand *mark* fills (`#074424`) stay in the logo only — the same deviation note already recorded in `brand/README.md`.
- **Print mechanics**: `@page { size: A4; margin: 18mm 15mm }`, `@bottom-right { content: "Page " counter(page) " of " counter(pages) }`, `break-inside: avoid` on metric cards and table rows, `thead { display: table-header-group }` so appendix headers repeat. No background-image tricks; `print-color-adjust: exact` on the header band only.
- **Screen/print split**: the screen rendering adds a sticky action bar (Print / Download PDF) that is `display: none` in `@media print`, exactly as `referrals/summary.blade.php` does with `.print-actions`.
- **Renderer portability** (protects the Dompdf fallback): critical layout uses semantic tables and simple block flow; flex/grid is decorative enhancement only; no JavaScript in the document body beyond the print button; self-hosted fonts and inline SVG only.

### Data sources and filters

One new payload builder, `BuildReportDocument`, generalising the period handling of `BuildMonthlyReportSummary`, which **stays exactly as it is** — it is consumed by `DashboardSummaryController` and covered by existing tests. The shared metric and grouping helpers are extracted and delegated to, so the monthly summary's behaviour and tests are unchanged. That is the verification signal that this refactor is safe.

- **Source of record**: `Report` rows, `whereNull('canonical_report_id')`, submitted within `[from, to)`, filtered by `ApplyReportFilters` and `ApplyOperationalQueueFilter` — the *same* filter actions the CSV export uses, so report and export can never disagree about what is in scope.
- **Metrics**: reuse `BuildMonthlyReportSummary`'s computation verbatim — reported cases, estimated affected hectares, cases by barangay, cases by possible condition, field-validation counts, closed cases, review-time distribution, expert-verification block (consult volume, agreement, unable-to-classify, time to finding, advisory coverage).
- **New queries**: submissions-per-day/per-week bucketing for the trend section, and open/overdue operational queue counts. Both are grouped-count queries, bounded by the 366-day cap.
- **Filters exposed in the builder**: period (required), barangay, possible condition, case state, verification outcome, field-validation state, operational queue, and the case-register appendix toggle.
- **Privacy (Q3 decided)**: the appendix carries `farmer_or_farm_owner_name`. It is **off by default** and never emitted unless explicitly enabled per document, because a period report circulates more widely than the case register does. When it is enabled, the builder shows a visible warning that farmer and farm references are included, and the appendix itself marks the reference line.

---

## 7. Dependency to add (the only one)

```bash
# API — document rendering + Chromium driver
composer require spatie/laravel-pdf spatie/browsershot   # in api/

# Chromium driver runtime
npm install puppeteer                                     # in api/ (Node is already a host prerequisite)

# Host provisioning — pick ONE, in this order of preference
#   1. Brave for Linux (already the captain's browser; no second browser vendor)
#        sudo apt install brave-browser        # from Brave's official apt repo
#        LARAVEL_PDF_CHROME_PATH=/usr/bin/brave-browser
#   2. Plain Chromium on the host
#        sudo apt install chromium-browser
#        LARAVEL_PDF_CHROME_PATH=/usr/bin/chromium-browser
#   3. Nothing at all — choose "browser print only" (Q5 option 3)
```

**The host binary can be Brave.** `Browsershot::setChromePath()` sets Puppeteer's `executablePath`, so any
Chromium-family binary works, and `spatie/laravel-pdf` exposes this as first-class configuration — the
published `config/laravel-pdf.php` has a `browsershot.chrome_path` key backed by
`LARAVEL_PDF_CHROME_PATH`. Brave is Chromium, so pointing it at `brave-browser` needs no second browser
on the host. This is the path recommended to the captain, because it adds no browser vendor he does not
already use.

Note for this specific machine: the captain's Brave is installed on **Windows**
(`/mnt/c/Program Files/BraveSoftware/...`) while the Laravel API runs on the **Linux** side. Launching a
Windows `.exe` from WSL for headless rendering is not a supported Browsershot pattern, so the host needs
its own Linux-side binary (option 1 or 2 above) — or option 3, which needs none.

Adding it requires, and should be gated on:

- `config/laravel-pdf.php` published with an explicit `chrome_path` and A4 defaults, rather than relying on autodiscovery — an unpinned autodiscovery path is what makes a host upgrade silently change rendering.
- The render path running **on demand, queued**, never inside a request that also serves the preview — a Chromium render takes seconds and ~250 MB peak.
- **No dependency is needed for the preview, the builder UI, the document template, or the Print path.** If Chromium is unavailable, the feature degrades to preview + browser print, which is strictly more than exists today. That asymmetry is deliberate: the dependency buys the PDF *file*, not the feature.

---

## 8. Validation and testing scope

Non-interactive, following `PROJECT_CHECKS.md` and the repo's existing split.

**API (PHPUnit/Pest Feature tests, SQLite)** — extend the existing `api/tests/Feature/ReportReportingTest.php` and `ReportApiTest.php` patterns:

1. Period resolution: weekly ISO boundaries, monthly boundaries, custom ranges, defaults, and the partial-period flag.
2. The 366-day cap and inverted-range (`to` < `from`) rejection, with the documented error shape from `ApiFormRequest`.
3. **PHT period boundaries (Q1)**: a submission dated Sunday 20 September 23:30 PHT sits in week 38, and the same instant in UTC does not — the explicit test that the decided timezone is actually applied at the boundary.
3. `BuildReportDocument` equals `BuildMonthlyReportSummary` for a UTC calendar month — the regression test that proves the extraction changed nothing.
4. Authorization: only users who can `viewAny` reports receive the document; a role that cannot gets 403. Mirror `ExpertAuthorizationTest.php`'s treatment of the referral-summary route.
5. **HTML document route**: returns `text/html`, correct `Content-Disposition` for inline vs `download`, carries the CSP nonce, renders the period label and the "decision support only" notice, and never emits `farmer_or_farm_owner_name` unless the appendix is requested.
6. **CSP regression (the security-relevant test)**: the document route emits the route-scoped `frame-ancestors` value, and every other HTML response still emits `frame-ancestors 'none'` and `X-Frame-Options: DENY`. Extend `api/tests/Feature/SecurityHeadersTest.php`.
7. **Empty period**: zero cases produces a complete, valid document with explicit "No submitted reports in this period" states — not a broken layout.

**Web (Vitest + React Testing Library + MSW)** — follow `src/pages/SubmittedReportsPage.test.tsx` and `src/components/dashboard/MonthlyCaseSummary.test.tsx`:

8. The builder defaults to the last completed week and issues exactly one document request per period change (debounce verified with fake timers).
9. Period control → correct request parameters for weekly, monthly, and custom.
10. Preview loading, error, and empty states; a failed PDF render leaves the preview mounted with an actionable message.
11. The existing CSV export and dashboard monthly panel still pass unchanged.

**Rendering fidelity (a real gap, stated honestly)** — the PDF is produced by Chromium, so *no fast test can assert what the PDF looks like*. Two mitigations, both cheap:
- A **document-contract test** asserting the rendered HTML contains the required structural markers (footer page-counter rule, repeating `thead`, every mandatory section heading, the disclaimer text). This catches template regressions without a browser.
- A **one-time manual PDF verification** per template change: render the seeded demo dataset for a fixed week, open the PDF, and confirm pagination, repeating headers, footer page numbers, self-hosted Poppins, and embedded logo render correctly on the staging host. Recorded once as evidence, then only repeated when the template changes.

**Commands** (existing only): `npm run lint`, `npm run typecheck`, `npm test -- --run`, `npm run check:api`, `npm run verify:fast`, `npm run verify:backend`.
**Not in scope for validation**: E2E/browser/device suites, per the repo's no-mistakes test policy.

---

## 9. Rollout order

Each phase is independently shippable and independently valuable; nothing later is required for anything earlier to work.

| Phase | Deliverable | Value on its own | Verification gate | Status |
| --- | --- | --- | --- | --- |
| **0. Period groundwork** | Extract the shared metric helpers; add `BuildReportDocument` with weekly/monthly/custom ranges (PHT boundaries); keep `BuildMonthlyReportSummary` behaviourally identical | API can produce any period's aggregates | `npm run check:api`; the equality test (§8.3) and the PHT boundary test (§8.2) | **Approved — build first** |
| **1. Document template + preview** | `reports/document.blade.php`, the document route, the route-scoped CSP allowance, self-hosted fonts + logo on the API origin, the single builder UI with live iframe preview and **Print**, entry points on the Dashboard and Submitted Reports | **Beautiful, branded, period-accurate documents immediately — printable, no new dependency** | §8.1–8.7, §8.11, document-contract test | **Approved — delivers the ask** |
| **2. PDF artefact** | `spatie/laravel-pdf` + Browsershot + a host Chromium (Brave preferred), published config with an explicit `chrome_path`, queued render, Download PDF | One-click PDF of exactly the previewed document | §8.10 manual PDF verification; API tests for the download response | **Approved — pending the Q5 host choice** |
| **3. Depth** | Case-register appendix defaults, saved filter defaults, trend and operational-queue refinements | Richer documents | §8.5 privacy assertions extended | **Not selected this round** |
| **4. Reach** | Entry points from the Monitoring workspace; optional emailed/scheduled weekly + monthly document; driver swap to Gotenberg/WeasyPrint | Reports arrive without anyone opening the app | Re-plan before starting | **Deferred by the captain** |

Phase 1 is deliberately the milestone that delivers the captain's actual ask. Phase 2 adds the PDF file itself. If Phase 2 stalls on host provisioning, Phases 0–1 are already a complete, shippable feature — which is exactly why the captain could approve 0–2 while still deciding Q5.

---

## 10. Risks, and how each is handled

| Risk | Severity | Handling |
| --- | --- | --- |
| The host Chromium binary cannot be provisioned | ~~High~~ **Medium** — corrected after the Q5 answer, see §11 | The rating was about impact-if-it-fails, not likelihood. Brave is already the captain's browser and installs on Linux from Brave's own apt repo, so no new browser vendor is needed; `LARAVEL_PDF_CHROME_PATH` points Browsershot at it. Phases 0–1 need no binary at all, browser Print covers the need, and the Dompdf fallback is verified Laravel-13 compatible |
| Chromium render cost (seconds, ~250 MB peak) | Medium | Queue the render; never render on period change; cache by period + filters + data version |
| Template drifts toward grid/flex and becomes Dompdf-hostile | Medium | Renderer-portability rules in §6 enforced by the document-contract test's structural assertions |
| CSP relaxation widens the framing boundary (Q2 decided this path) | Medium — security | Route-scoped only, config-driven allowlist defaulting to `'self'`, explicit regression test for every other HTML route (§8.6) |
| Poppins missing → silent fallback to Arial and a subtly off-brand PDF | Low but easy to miss | Self-hosted woff2 with a test asserting the `@font-face` source resolves on the API origin; manual PDF check confirms embedding |
| Report and CSV disagree about scope | Medium | Both consume `ApplyReportFilters` / `ApplyOperationalQueueFilter`; one shared scope test |
| Farmer names leak into widely circulated documents | Medium — privacy | Decided (Q3): appendix off by default, explicit opt-in, visible warning, §8.5 assertion |
| PHT document boundaries diverge from the dashboard's UTC monthly panel (Q1 decided to keep them separate) | Low, but a real inconsistency | The document always prints its period, timezone and filter scope; the divergence is deliberate and documented. Revisit unification after the documents are in daily use |

---

## 11. Decisions and the one remaining question

### Recorded — closed (2026-09-22)

1. **Q1 — Period boundary timezone: PHT (UTC+8).** Printed on every document. The dashboard's existing UTC monthly panel is left unchanged.
2. **Q2 — Preview mechanism: live HTML document in a same-origin iframe**, with the narrow route-scoped `frame-ancestors` allowance.
3. **Q3 — Case register appendix: off by default**, explicitly opt-in per document, with the farmer-reference line visibly marked.
4. **Q4 — Entry points: both** the Dashboard and Submitted Reports, opening the same single builder.
5. **Rollout: P0, P1, P2 approved** in that order, each following its stated gate. **P3 not selected. P4 deferred**, to be re-planned before starting.
6. **Document design approved** — "I love the format and the future contents of the generated document."

### Open — Q5 only

**Q5 — Dependency weight acceptance.** The captain asked two questions before deciding; both are answered here.

> *"i'm not quite sure about this yet because it requires Chromium, right, in my environment. But I only use the Brave browser."*

**Your browser is not involved.** The render happens server-side, on the host that runs the Laravel API — the same machine that already runs Node. Whatever you use to read the app — Brave, Chrome, Firefox, or nothing — is never touched by PDF generation. So "I only use Brave" does not conflict with this plan at all.

**But yes, it needs a Chromium-family binary on that host** — and your Windows Brave does **not** satisfy it: this machine has Brave at `/mnt/c/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe`, on the Windows side, while the API runs on the Linux side. Launching a Windows `.exe` from WSL for headless rendering is not a supported Browsershot pattern. The host needs its own Linux-side binary. Three ways forward, best first:

1. **Install Brave for Linux on the host and point the config at it.** Brave publishes an official apt repo (`sudo apt install brave-browser`), and `spatie/laravel-pdf` exposes `LARAVEL_PDF_CHROME_PATH` — verified in the package's own published `config/laravel-pdf.php` — which `Browsershot::setChromePath()` turns into Puppeteer's `executablePath`. Brave is Chromium, so this works, and it adds **no browser vendor you do not already use**.
2. **Install plain Chromium on the host.** Equivalent, but a second browser vendor for a server-only job.
3. **Install nothing — "browser print only".** Your own Brave prints the document to an A4 PDF straight from the preview, because the template is authored with `@page` print CSS: real page numbers, repeating table headers, correct margins. The only thing you lose is a server-*produced file* — `Download PDF` becomes your browser's "Save as PDF".

> *"And can you also tell me why this is high risk?"*

**Fair challenge — the rating was about impact if it fails, not about likelihood, and I have downgraded it to Medium.** The reasoning was: it is the single item in the plan that touches infrastructure rather than application code, it was the only step not yet proven on the target host, and a server-side browser is a large, constantly-patched, network-capable binary that many environments deliberately forbid. If provisioning were refused, Phase 2 would stall and the `Download PDF` button would have no implementation.

**That risk is materially lower than I originally rated it, for two reasons discovered while answering you:** Brave is installable on the Linux host from Brave's own apt repository, and `chrome_path` is first-class configuration rather than a workaround. And option 3 removes the dependency entirely — which turns the risk to zero at the cost of a print dialog. **So the honest framing is: Medium if you want a server-produced PDF file, zero if you do not.**

**Recommendation unchanged:** option 1. It keeps the one-click `Download PDF` file and adds no new browser vendor, because Brave already is Chromium.
