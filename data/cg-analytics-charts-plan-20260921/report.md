# CaneGuard Web — Charts-First Analytics Implementation Plan

Date: 2026-09-22 · decisions recorded 2026-09-22
Status: **decisions recorded** — 7 of 7 answered on the board; one dependency sub-choice remains (Q8). No code changed by this task
Authority: the frozen Analytics Opportunity Mapping spec (`data/cg-analytics-charts-plan-20260921/spec.md`), treated as the requirement of record. Where the spec and the shipped Web app disagree, the spec wins and the disagreement is named.
Subject: the Web dashboard analytics surface of `caneguard-web`.
Related, already approved: `data/cg-web-reports-plan-20260921/report.md` (documented reports, P0–P2 approved). Charts share its period groundwork.

---

## 0. The ask, and what this document is

The captain holds the frozen spec and an approved Lavish plan for documented reports. The request here:
**prioritise charts, not advanced analytics; say plainly what cannot be built right now.**

So this document does three things:

1. Audits what the Web app already collects and already shows (§2).
2. Sorts **every** analytics item the frozen spec asks for into **CHARTS NOW**, **NEEDS DATA FIRST**, and **NOT NOW**, each with the exact blocking input or frozen rule (§3–§5).
3. Gives a three-phase charts-first build order with the per-chart data source and a verification gate (§6–§8).

The plan adds **one runtime dependency** — a chart library, decided by the captain (Q3) with the specific package still open (Q8) — and makes **no schema change**. Every chart below is drawn from columns the system already writes today.

---

## 1. What the spec actually asks the system to compute

The five maps reduce to one analytics requirement each (`spec.md` §9–§13, §29):

| Map | Process | Requirement | Measurement rule that constrains every chart |
| --- | --- | --- | --- |
| 1 | Detection and guided validation | Result uncertainty and evidence consistency | Rule-based indicator only; **no arbitrary confidence threshold without validation evidence**; never a second opaque model |
| 2 | Field report documentation and submission | Report readiness and synchronisation | Categorical states; **no invented readiness percentage**; unsynced data stays mobile-local |
| 3 | SRA Don Pedro case review and action planning | Review backlog aging and attention | Waiting age is the measure; **"overdue" only with a real deadline** |
| 4 | Field validation and follow-up | Validation status, workload, turnaround | Workload for balancing only; **never best/worst/fastest/slowest ranking** |
| 5 | Case monitoring and office reporting | Period trends, geographic concentration, estimated-area summaries, AI-to-staff agreement | Weekly/monthly/custom + previous-period comparison; **no forecasting**; barangay first, GPS second; never hotspot/outbreak/prevalence/incidence; area is a labelled estimate with overlaps acknowledged; agreement over eligible reviewed reports only, `Unable to Classify` separate, **never called model accuracy** |

Two cross-cutting rules decide most of the bucket sort below:

- **§3.3 Available Data Rule** — only data CaneGuard actually collects may be labelled available.
- **§3.2 Current Implementation vs Target System** — the target system may be described, but unfinished target capability must never be presented as operating.

---

## 2. Audit: what the Web app collects and already shows

### 2.1 What is collected (verified in the schema and models)

| Field group | Columns | Migration / source |
| --- | --- | --- |
| Period | `submitted_at`, `observed_at`, `captured_at`, `reviewed_at`, `first_reviewed_at` | `api/database/migrations/2026_07_26_153000_create_reports_table.php`, `.../2026_09_22_000000_add_first_reviewed_at_to_reports_table.php` |
| Geography | `barangay` (string, 120), `province`, `municipality`, `final_latitude`, `final_longitude`, `location_source`, `gps_accuracy`, `location_unavailable_reason` | `.../2026_08_15_000000_add_mobile_field_report_contract_fields_to_reports_table.php`, `.../2026_09_15_..._measurement_and_location_provenance...` |
| AI evidence | `predicted_label`, `confidence`, `checklist_consistency`, `reported_severity`, `model_version`, `report_class_scores`, `report_symptoms`, `report_quality_warnings` | `.../2026_07_26_153000_create_reports_table.php` and siblings |
| Lifecycle | `case_state`, `verification_outcome`, `field_validation_state`, `referral_state`, `review_status`, `action_taken` | `.../2026_08_28_000000_add_report_lifecycle_dimensions.php`; contract `docs/contracts/report-lifecycle-v1.json` |
| Staff classification | `authority_classified_condition` (incl. `smut`, `rssi`, `mixed_or_multiple`, `unable_to_classify`) | `api/app/Models/Report.php:320-357`; written through `ReviewReportController` |
| Area estimate | `affected_area_hectares`, `affected_area_measurement`, `affected_portion_percent`, `affected_portion_measurement` | `.../2026_08_14_...smart_field_report_fields...`, `.../2026_09_15_...` |
| Duplicates | `canonical_report_id` | `.../2026_09_01_000000_add_duplicate_linkage_to_reports.php` |
| Validation | `field_validation_assignments.assignee_id`, `assigned_by_id`, `target_visit_date`, `activated_at`; `field_validation_completions.visited_at`, `gps_*`, `follow_up_outcome` | `.../2026_08_30_...`, `.../2026_08_31_...`, `.../2026_09_22_000000_add_follow_up_outcome...` |
| Referral | `report_referrals.consult_status`, `referral_date`, `finding_recorded_at`, `due_date`, `expert_id` | `.../2026_09_01_000000_create_report_referrals_table.php`, `.../2026_09_18_...`, `.../2026_09_23_...` |

### 2.2 What the app already shows (Current System Support — keep, never repackage)

| Existing surface | Where | Shape today |
| --- | --- | --- |
| Five operational queue counts | `api/app/Http/Controllers/Api/V1/DashboardSummaryController.php`; cards in `src/pages/DashboardPage.tsx` | Numbers + links |
| Attention bands (green/amber/red) | `api/app/Actions/Reports/CalibrateReportTriage.php` | Calibrated from reviewed verdicts, explainable reason strings, no opaque score |
| Monthly summary: reported cases, estimated hectares, validation counts, closed cases, review-time stats | `api/app/Actions/Reports/BuildMonthlyReportSummary.php`; `src/components/dashboard/MonthlyCaseSummary.tsx` | **UTC calendar month only**; rendered as metric tiles + `<ul>` lists + `<dl>` definitions — **no chart of any kind** |
| Barangay and Possible Condition lists | same | Ordered lists, month-scoped |
| Expert verification (consult volume, agreement, unable-to-classify, time to finding, advisory coverage) | `BuildMonthlyReportSummary::expertVerificationMetrics()`; `src/components/dashboard/ExpertVerificationPanel.tsx` | Metric tiles + definition lists, month-scoped |
| Historical review-status totals | `DashboardSummaryController` → `SecondaryMetric` band | Four numbers |
| Case register with filters incl. custom date range | `api/app/Actions/Reports/ApplyReportFilters.php`; `src/pages/reportListUrlState.ts` | Paginated table, `per_page` **max 100** (`ListReportsRequest`) |
| CSV export with the full case projection | `api/app/Actions/Reports/ExportReports.php` | Machine-readable rows |
| Map of located reports + located/unlocated counts | `api/app/Actions/Reports/QueryMapReports.php`; `src/pages/FieldValidationMapPage.tsx` | MapLibre map, barangay-first list |
| Visit calendar (target dates per day) | `src/components/reports/MonitoringCalendar.tsx`; `ApplyOperationalQueueFilter::followUpDue()` | Month grid; "Today is not overdue" copy already in place |

### 2.3 The honest gaps

1. **There is exactly one aggregate endpoint, and it is a UTC month.** `GET /api/v1/reports/summary?month=YYYY-MM` and the dashboard's embedded `monthly_summary` are the only server-side aggregations. There is no week, no custom range, no per-day/per-week series, no previous-period comparison.
2. **There is no charting library and no chart component.** `package.json` has no chart dependency; the only inline SVG in the SPA is on the login page, and today's "charts" are lists and definition lists. The captain's decision (Q3) adds one library for this work; nothing exists to reuse.
3. **The register is the wrong chart source.** `per_page` is capped at 100 and results are paginated, so a browser-side chart would silently truncate.
4. **Several spec dimensions have a stored column but no aggregation at all**: `case_state` series, `authority_classified_condition` distribution, workload per assignee, waiting-age buckets, turnaround durations.
5. **The area total has no provenance and no overlap disclosure.** `estimated_affected_hectares` is a bare `SUM(affected_area_hectares)` over rows with `canonical_report_id IS NULL`. It does not split `measured` from `not_measured`, and it never prints how many linked duplicates were excluded — both of which the spec's area rule (§13) and duplicate rule (§15) require a chart to state.
6. **Demo data can lie.** `api/database/seeders/ReportSeeder.php` seeds `predicted_label` from `Report::v2Labels()`, which **includes `smut`**, explicitly "so monitoring exercises every prediction class". Any chart built on the seeded database will show a Smut series that no shipped model produces.

---

## 3. CHARTS NOW — buildable from data already collected

Each row: the chart, the question it answers, the exact data source, and the copy discipline the frozen spec imposes on it.

| # | Chart | Question answered | Data source (columns → existing/new) | Spec basis | Mandatory copy/label discipline |
| --- | --- | --- | --- | --- | --- |
| **C1** | Submitted reports over time — bars per day (≤ 60 days) or per ISO week | How many reports came in across the selected period? | `reports.submitted_at`, `canonical_report_id IS NULL` → **new** period aggregate | §13 flexible periods, Q42 | Label "Submitted reports"; never "cases" alone, never "occurrences" |
| **C2** | Barangay distribution — horizontal bars | Where are submitted reports concentrated? | `reports.barangay` → exists monthly (`cases_by_barangay`); needs period | §13 geographic rule, Q43 | "Higher concentration of submitted reports"; never hotspot/outbreak. Barangay first, GPS second |
| **C3** | Possible Condition split | Which possible conditions does the AI evidence suggest? | `reports.predicted_label` → exists monthly (`cases_by_possible_condition`); needs period | §13 condition rule, §14 | "Possible Condition — decision support only"; Healthy stays visible (§14), never folded into Unknown |
| **C4** | Open vs closed | How much of the register is still open? | `reports.case_state` → **new** series (a single `closed_cases` count exists) | §13 open/closed counts, Q36 | Counts of submitted reports, not of confirmed occurrences |
| **C5** | Lifecycle composition — verification outcome, validation state, referral state | Where is work sitting in the lifecycle? | `verification_outcome`, `field_validation_state`, `referral_state` → `field_validation_state` exists monthly; the rest **new** | §13 by lifecycle, Q36 | Referral is a supporting dimension (§16), shown as a state split, not a sixth process |
| **C6** | Estimated affected area, with provenance and overlap labels | How much **estimated** area do submitted reports describe? | `affected_area_hectares` + `affected_area_measurement` + `affected_portion_percent` + `canonical_report_id` → sum exists; provenance and duplicate counts **new** | §13 area rule, §15, Q13/Q21/Q45 | Must print: contributing report count, `measured` vs `not_measured` split, and "N linked duplicates excluded; estimates may overlap". Never "total affected area" |
| **C7** | Field-validation workload | How much open validation work is on each assignee? | `field_validation_assignments.assignee_id`, `field_validation_state`, `case_state` → **new** aggregate (the queue endpoint returns assignees but is capped at 100) | §12 workload rule, Q41 | Distribution for balancing only. No ordering by fastest/most, no per-person "best". Unassigned shown as its own bucket |
| **C8** | Validation schedule vs target date | What is scheduled, due, or past its recorded target date? | `field_validation_assignments.target_visit_date` (nullable) → `ApplyOperationalQueueFilter::followUpDue()`/`upcoming()` already encode the rule; a chart aggregate is **new** | §11 "overdue only with a real deadline", Q40 | Four buckets — unscheduled / scheduled / due today / past target date — with "unscheduled" always visible so past-due is never read as the whole backlog |
| **C9** | Review backlog by waiting age | Who has waited longest for a first review? | `reports.submitted_at` over the `needs_review` predicate (`case_state=open`, `verification_outcome=not_determined`) and `first_reviewed_at` for completed ones → **new** | §11 waiting age, Q31/Q40 | Label buckets as **waiting age**, never "overdue". Oldest unreviewed count shown beside the histogram |
| **C10** | AI-to-staff agreement, eligible denominator | How often did the office's Staff-Classified Condition match the Possible Condition? | `predicted_label` vs `authority_classified_condition` → computed today only for completed consults; a reviewed-report aggregate is **new** | §13 agreement rule, §12, Q44 | Denominator first; `unable_to_classify` separate and excluded; **never** labelled accuracy; counts-only when the denominator is small (see Q4 on the board) |
| **C11** | Previous-period comparison | Is this period up or down on the last comparable one? | The same C1–C6 payload run over two windows → **new** | §13 previous-period comparison, Q33 | Two counts and a delta; **no projection, no trend line into the future** |
| **C12** | Field-validation turnaround (measured) | How long did completed validations actually take? | assignment `activated_at` → completion `visited_at` → **new** | §12 turnaround, Q32 | Descriptive durations only, non-negative intervals only, no target/SLA comparison, no ranking |

**Already shipped surfaces stay as they are** and must not be relabelled as new analytics (§18): queue counts, attention bands, the monthly summary blocks, expert verification, historical status totals, map located/unlocated, the visit calendar.

---

## 4. NEEDS DATA FIRST — the Available Data Rule fails today

### N1 — Smut as an AI Possible Condition series
- **Blocked by:** §4.3 and §3.2 — Model v0's integrated outputs are Healthy, Sugarcane Mosaic Disease, Sugarcane Rust. Smut is a *target* capability that "must not be presented as current Model v0 outputs until the model is retrained, integrated, and tested".
- **Exact missing input:** a retrained and integrated classifier emitting `smut`, with evaluation evidence (§27 lists dataset, balance, retraining, evaluation as outstanding).
- **The trap to avoid:** the upload contract *can* carry `smut` (`docs/contracts/mobile-report-upload-v2.json`, enum `healthy|mosaic|rust|smut`), and `ReportSeeder` deliberately seeds it. A Smut bar chart therefore renders **seeded rows**, not model output. That is exactly the "unfinished target capability presented as operating" failure the spec forbids.
- **Verdict:** the split chart must enumerate conditions from a single declared list that today is `healthy, mosaic, rust`, and must gain `smut` only with the model integration, not with the data.

### N2 — RSSI as an AI Possible Condition series
- **Blocked by:** §4.2 (RSSI is in the five-category target) and §3.2 (current vs target).
- **Exact missing input, and it is stronger than N1:** there is **no `rssi` value in the prediction enum at all**. `docs/contracts/mobile-report-upload-v2.json` `predicted_label` accepts `healthy|mosaic|rust|smut`; `Report::LABEL_*` defines `healthy`, `mosaic`, `rust`, `smut`. RSSI exists only as `reporter_suspected_condition = 'RSSI'` (a Level-2 reporter observation, §7) and as a Staff-Classified Condition (`AUTHORITY_CONDITION_RSSI`).
- **Verdict:** a "Possible Condition: RSSI" bar cannot be drawn without inventing data. The two honest options are (a) a clearly separate **reporter-suspected RSSI** count, labelled as a reporter observation, or (b) wait for the five-category model. Recommendation: (a), and never inside the Possible Condition chart.

### N3 — AI-to-staff agreement at a useful volume
- **Blocked by:** §13 agreement rule read with §3.3 — agreement needs *usable* Staff-Classified Conditions, and `Unable to Classify` is excluded from the denominator.
- **Exact missing input:** reviewed reports carrying `authority_classified_condition`. `ReportSeeder` writes **none** (it sets `review_status` and the lifecycle projection only); `AdvisorDemoSeeder` sets roughly eight. The register's real agreement denominator is therefore near zero, and any rate drawn today is a ratio on a handful of rows.
- **Verdict:** C10 ships in Phase 3 with an explicit insufficient-data state and the denominator always printed. It is not a Phase 1 chart, and it must never be headlined as a percentage alone.

### N4 — Policy-target and SLA comparisons
- **Blocked by:** §11 ("overdue only with a real deadline") and §25 ("arbitrary thresholds/SLAs" out of scope).
- **Exact missing input:** a policy date. Two distinct cases:
  - **Validation follow-up:** `target_visit_date` **is** a real, human-entered deadline, so past-target comparisons are legitimate where it is set — that is C8. What is missing is *coverage*: the column is nullable and only exists once an assignment is created, so an unknown share of the backlog has no target date. C8 therefore prints an `unscheduled` bucket rather than implying universal lateness.
  - **Review turnaround:** there is no stored review deadline anywhere. "Reviewed within N days" has no policy date to measure against, and choosing N would be the invented threshold the spec forbids.
- **Verdict:** actual measured turnaround (C12) is fine; comparison against a review SLA is not, and validation performance against a *policy* target waits for a policy decision — not for data.

### N5 — Ready-for-reporting and sync charts (Map 2) — on the wrong surface, not merely missing
Map 2's states (`Incomplete`, `Ready for Submission`, `Finalized-Pending Synchronization`, `Synchronization Failed`, `Submitted`) are decided by §17 and Q39: **unsynchronised reports stay mobile-local, and office analytics only use synchronised data.** The office therefore receives only `Submitted`. A Web chart of "Synchronization Failed" is not a data-collection gap — it is structurally impossible without breaking the frozen rule. This requirement belongs to the Mobile readiness surface, and the Web dashboard may state only the `Submitted` count it already has.

---

## 5. NOT NOW — forbidden by the frozen spec itself

Each line names the rule that forbids it, so this list is not revisable by preference.

| # | Item | Frozen rule that blocks it |
| --- | --- | --- |
| X1 | Uncertainty indicator (consistent / uncertain / conflicting) as a Web chart | §9: the indicator is a field decision ("accept, retake, or report") in Process 1, rule-based, and "never a second opaque model", with "no arbitrary confidence threshold without validation evidence" (also Q29, Q37). The offer already ships a *calibrated attention band* — explainable and derived from reviewer verdicts — but relabelling that as uncertainty analytics would misstate what it is |
| X2 | Forecasting, projections, trend extrapolation | §13 period rule "no forecasting"; §25 "outbreak prediction", "yield prediction", "weather forecasting" |
| X3 | Prevalence, incidence, infection-rate and survey estimates | §13 geographic rule; §25 "prevalence/incidence estimation", "municipality-wide infection rates"; §30 "totals ≠ incidence" |
| X4 | Hotspot / outbreak maps and tiers | §13 "never hotspot/outbreak/prevalence/incidence"; §30 "concentrations ≠ hotspots" |
| X5 | Ranking (validators, barangays, reporters, experts) | §12 "never best/worst/fastest/slowest ranking"; §25 "employee ranking"; Q41 |
| X6 | Any opaque composite risk or "attention score" chart | §9 "never a second opaque model"; §25 "opaque risk scoring" |
| X7 | Readiness percentage | §10 "no invented readiness percentage"; Q38 categorical readiness |
| X8 | Deduplicated "canonical case" totals used as the analytics unit | §15 primary unit stays the submitted report; §25 "canonical-case unit"; Q45. Duplicates are disclosed next to the count ("23 submitted, 3 linked duplicates"), never silently netted |
| X9 | Farmer-level totals or league tables | §25 "farmer totals" out of scope; §6 the farmer is a stakeholder, **not** the formal verifier |
| X10 | Treatment, intervention or outcome-effectiveness analytics | §25 "treatment analytics" |
| X11 | Model accuracy, reliability, or performance claims | §13 agreement is over eligible reviewed reports and is "never called model accuracy"; §30 "agreement ≠ accuracy", "possible ≠ diagnosis"; §25 "automatic/laboratory diagnosis" |
| X12 | Severity, crop-age and variety trend analytics | Not required anywhere in the frozen spec, and `reported_severity` is a Level-2 reporter observation (§7), not a validated measurement. Drawing a severity trend would manufacture a claim the spec does not authorise |
| X13 | Expert referral charts as an independent analytics stream | §16 referral is a supporting function under Process 3, "not a sixth process"; §25 "extra maps for sync/duplicates/referral/admin" |
| X14 | Lab-confirmation or diagnostic-certainty analytics | §25 "automatic or laboratory diagnosis"; §30 "review ≠ lab confirmation" |

**Critique, plainly.** X1–X6 are the items that look most attractive on a dashboard, and every one of them is blocked by a rule the project owner froze after seven decision rounds. They are not "hard"; they are *disallowed*. X7–X11 are the same class of temptation: percentages, rankings and leaderboards that read as insight while quietly converting operational counts into claims the study cannot support — the manuscript's central risk (§1). X12–X14 are simply out of requirement: nothing in CaneGuard asks for them, so building them would be scope expansion dressed as analytics.

---

## 6. The phased charts-first plan

Design stance, stated once from the recorded decisions:

- **One new runtime dependency — a chart library (Q3)** — and **no schema change**. The specific package is the only remaining choice (Q8).
- **The period substrate is owned by the approved documents work (Q5).** Since documents ship first, their Phase 0 already provides PHT weekly/monthly/custom boundaries and the 366-day range cap. Phase 1 below **extends** that substrate instead of rebuilding it; if documents P0 slips, Phase 1 waits rather than duplicating boundary logic.
- **The Dashboard is the only chart surface (Q2).** The Monitoring workspace register stays a table.

Three honest costs of that stance, stated rather than buried:

1. **Two renderers for one series.** The library does not serve the printed document, which keeps its server-rendered, print-safe inline SVG bars (the documents plan's own decision). The SPA chart and the document bar now come from different code, so the shared *aggregate* — not shared rendering — is what keeps their numbers equal.
2. **The dependency must survive this repo's gates.** `npm run security:dependency-check` runs a dependency contract, `npm run test:design-spine` forbids literal hex colours, literal `font-size` and literal `border-radius` outside `tokens.css`, and `npm run lint` runs with the repo's rules. The library is therefore themed by reading token values at runtime, never by hardcoding palette hexes in components.
3. **Tooltips and legends come from the library, but accessibility does not.** Every chart still ships a visually-hidden data table (§7.3).

### Phase 1 — Period trend and composition
**Charts delivered: C1, C2, C3, C4, C11.**

| Item | Work |
| --- | --- |
| Depends on | The documents plan's Phase 0 period groundwork (Q5): PHT boundaries, weekly/monthly/custom resolution, the 366-day cap |
| API | New `BuildReportAnalytics` action behind `GET /api/v1/reports/analytics` with `from`, `to`, `granularity`, plus the existing `ReportFilterRules` filters. It reuses the metric/grouping helpers extracted from `BuildMonthlyReportSummary`; the monthly builder's behaviour stays byte-identical and its existing tests in `api/tests/Feature/ReportReportingTest.php` are the regression signal. Adds: per-day/per-week buckets, `case_state` series, and a previous-window comparison block |
| Web | The chart library (Q3, package per Q8) plus a chart-theme module that reads colours and text sizes from `tokens.css`; a period control (week / month / custom) driven by the same URL state the register already parses (`src/pages/reportListUrlState.ts` uses `date_from`/`date_to`); a dashboard section beside — not replacing — the monthly panel |
| Panel cleanup (Q6) | Once C2 and C3 render, remove the duplicate barangay and Possible Condition lists from `MonthlyCaseSummary.tsx` and update `MonthlyCaseSummary.test.tsx`. The metric tiles and review-time block stay |
| Scope parity | Chart scope uses `ApplyReportFilters` and `canonical_report_id IS NULL`, the same actions the CSV export uses, so a chart and an export can never disagree |
| Value on its own | Any week, month or custom range becomes visible as a chart instead of a list |
| Gate | Lockfile reviewed and `npm run security:dependency-check` green; `npm run check:api` (bucket boundaries, filter parity, empty period, monthly-summary equality); `npm run verify:fast` (which includes lint, typecheck, Vitest, the design-spine validator and the build) |

### Phase 2 — Area, workload and backlog
**Charts delivered: C5, C6, C7, C8, C9, C12.**

| Item | Work |
| --- | --- |
| API | Extend the same aggregate: `area` (sum + `measured`/`not_measured` provenance + linked-duplicate counts), lifecycle distributions, `validation_workload` by assignee, `validation_schedule` four-bucket counts, `validation_turnaround` durations, `review_backlog` waiting-age buckets |
| Indexes | Groupings are already index-backed: `['barangay','submitted_at']`, `['predicted_label','submitted_at']`, `['case_state','submitted_at']`, `['field_validation_state','submitted_at']` (lifecycle migration), and `field_validation_assignments` `['assignee_id','updated_at','id']`. No migration is needed |
| Web | Six chart cards, each with its "what this is" line and the label discipline from §3. C6 is the per-period bar with the measured/not-measured split and the duplicate-and-overlap disclosure line (Q7) |
| Value on its own | The operational picture — where work sits, who is loaded, what has waited longest, what the area estimate actually contains |
| Gate | `npm run check:api` plus `npm run api:test:mysql` (grouped joins against real MySQL), then `npm run verify:fast` |

### Phase 3 — Agreement, with an honest empty state
**Chart delivered: C10.**

| Item | Work |
| --- | --- |
| API | `agreement` block: `eligible` = reviewed reports with a usable Staff-Classified Condition; `unable_to_classify` counted separately and excluded; `agreed` count; denominator always returned; `eligible: 0` returns a first-class insufficient-data shape, not `0 %` |
| Web | Denominator-first agreement card — "12 of 15 eligible reviewed reports agreed · 3 unable to classify (excluded)". **Counts only until `eligible` reaches 10, then the rate appears with the denominator (Q4).** No standalone percentage. No accuracy wording anywhere in the component |
| Value on its own | Answers the researcher's agreement requirement the moment enough reviews exist, and refuses to mislead before then |
| Gate | `npm run check:api` with an assertion mirroring the existing agreement assertions in `ReportReportingTest.php` (including the sub-10 counts-only state), then `npm run verify:fast` |

**Ordering rationale.** Documents first (Q5) so the period rule is decided once. Phase 1 is then the smallest change that turns the dashboard from lists into charts, which is where the captain's "charts first" ask is actually satisfied. Phase 2 is the operational depth the spec's Maps 3 and 4 require. Phase 3 is last because its data is thinnest, and shipping it earlier would put an empty rate on the dashboard — the single most misleading outcome available here.

---

## 7. Chart engineering decisions

### 7.1 The library (Q3 decided: add one; Q8 picks the package)

Facts below were read from the npm registry on 2026-09-22, not recalled.

| Candidate | Version | Licence | React 19 peer | Output | Dependency surface | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| **Recharts** | 3.10.1 | MIT | declared (`react ^16.8 \|\| ^17 \|\| ^18 \|\| ^19`) | SVG | 12 direct deps incl. `@reduxjs/toolkit`, `react-redux`, `immer`, `reselect`, `victory-vendor`; ~7.5 MB unpacked; also wants `react-is` as a peer | **Recommended default.** Declarative React API, SVG output, explicit React 19 support, MIT. The redux/immer internals and unpacked size are the real cost |
| Recharts (2.x line) | 2.15.4 | MIT | declared | SVG | 8 direct deps incl. `lodash` and `react-is ^18.3.1` | Lighter than 3.x, still React 19, but the previous major line — take it only if 3.x's redux surface is refused |
| **@nivo/bar + @nivo/core** | 0.99.0 | MIT | declared (`react ^16.14 \|\| ^17 \|\| ^18 \|\| ^19`) | SVG (canvas optional) | Per-chart packages; `@nivo/bar` 343 KB and `@nivo/core` 254 KB unpacked | **Equivalent alternative** if dependency weight dominates: much smaller, same licence class and React support, different composition model and more packages to add |
| @visx | 4.0.0 | MIT | declared (`react ^18 \|\| ^19`) | SVG primitives | ~227 KB per package | Only if tooltips, axes and legends are acceptable as build-it-yourself work — that is close to the no-library effort |
| chart.js / echarts | 4.5.1 / 6.1.0 | MIT / Apache-2.0 | via wrappers | **Canvas** (echarts has an SVG renderer) | Large; a React wrapper is an extra package | **Rejected:** canvas loses print fidelity and the SVG/token/contrast discipline, and canvas output is inaccessible by default |
| react-apexcharts | 2.1.1 | metadata declares `SEE LICENSE IN LICENSE`, **not** MIT | loose (`react >=16.8.0`) | SVG | Wraps `apexcharts >=5.10.1` | **Rejected:** the wrapper does not declare a clean licence, and this project already runs licence reviews (the documents plan flagged mPDF's GPL) |
| victory | 37.3.6 | MIT | loose (`react >=16.6.0`) — does not assert React 19 | SVG | ~2.3 MB unpacked | **Rejected for now:** the peer range does not certify the React version this repo runs |

**Why Recharts is the default:** it is the only candidate that combines a declared React 19 peer range, SVG output, MIT licensing and a declarative React API for all thirteen chart shapes in this plan. The honest cost is its internal Redux/immer state and 7.5 MB unpacked — which is why the lockfile review and `npm run security:dependency-check` are part of the Phase 1 gate rather than an afterthought.

### 7.2 Theming under the design spine

`npm run test:design-spine` fails on a literal hex colour, a literal `font-size` and a literal `border-radius` outside `src/styles/tokens.css`. A library does not exempt the components that use it, so:

- Palette and text sizes are read from the tokens at runtime (a small chart-theme module reading CSS custom properties) and passed as props — never hardcoded in components.
- Condition colours stay the token set (`--disease-healthy/mosaic/rust/smut`); counts use the `--color-brand` family; `--color-warning`/`--color-danger` appear only for genuinely past-target buckets.
- Axis, tick and legend text uses the 16 px floor (`--text-body-sm`); the 12 px machine scale is not used for chart text.

### 7.3 Accessibility and honest states

- Each chart is `role="img"` with an `aria-label` summarising the series, plus a visually-hidden `<table>` of the plotted values. The library supplies the visual; the table supplies both the accessible equivalent and a browser-free test target.
- Zero reports renders "No submitted reports in this period", matching the existing `MonthlyCaseSummary` copy.
- A sparse denominator renders the insufficient-data state rather than a rate (Q4).

### 7.4 One period rule, printed (Q1 decided)

Charts use **PHT (UTC+8)** boundaries and print the period, the boundary rule and the timezone on every chart. The shipped monthly panel stays UTC by Q6, so the divergence between the panel and the charts is now **permanent and deliberate** rather than a transitional risk; the printed rule on each chart is what keeps the two readable side by side.

### 7.5 No client-side aggregation of the register

The list endpoint is capped at 100 rows per page; charts read the aggregate endpoint only, one payload per period change, debounced.

---

## 8. Verification plan (non-interactive only)

| Phase | Commands |
| --- | --- |
| 1 | `npm run security:dependency-check` (lockfile reviewed and committed), `npm run check:api`, `npm run verify:fast` |
| 2 | `npm run check:api`, `npm run api:test:mysql`, `npm run verify:fast` |
| 3 | `npm run check:api`, `npm run verify:fast` |

Tests to add, following existing patterns:

- **Dependency gate (Phase 1):** with the library added, `npm run security:dependency-check` stays green, `package-lock.json` is committed, and `npm run test:design-spine` stays green — the latter proves no literal hex colour, `font-size` or `border-radius` leaked into a component through chart styling.
- **API (Pest/PHPUnit, SQLite):** period bucketing (day/week boundaries, PHT), previous-window selection, filter parity with the export action, empty period, provenance split and duplicate disclosure counts, `unable_to_classify` exclusion and denominator math, and the equality test that proves the monthly summary is unchanged after helper extraction.
- **Web (Vitest + RTL + MSW):** chart renders from a fixture payload; the counts-only state below an eligible denominator of 10 and the rate-above-10 state; accessible table present with the same values; "no submitted reports" empty state; label-discipline assertions (the disclaimer strings are present, and the forbidden words in §5 are absent from chart copy).

Never in this plan: E2E, browser, device or interactive acceptance runs.

---

## 9. Risks and honest gaps

| Risk | Severity | Handling |
| --- | --- | --- |
| Two period semantics on one page — shipped UTC monthly panel versus PHT charts | Medium — correctness perception | Already decided (Q1 PHT, panel UTC by Q6). Every chart prints its period and timezone; the documents plan already prints its own. Unifying the panel is available later if the two readings cause confusion |
| **Chart library dependency surface** — Recharts 3.x brings 12 direct dependencies including Redux Toolkit/immer and ~7.5 MB unpacked | Medium — supply chain, build size | Lockfile reviewed and committed; `npm run security:dependency-check` and `npm audit` in the Phase 1 gate; `@nivo` is the named lighter equivalent (MIT, React 19, SVG) if the surface is refused. Only the chosen library is added — no second chart stack |
| Library cannot be themed through the design spine | Medium — a real gate failure, not a style preference | Theme from runtime token reads, never hardcoded hexes or literal font sizes; `npm run test:design-spine` is part of the Phase 1 gate, so a violation fails the build rather than shipping |
| Aggregate cost as the register grows | Medium | Bounded ranges (reuse the approved 366-day cap), index-backed groupings, one payload per period change (debounced), no per-chart request fan-out |
| Chart copy drifts into forbidden claims (hotspot, incidence, accuracy, leaderboard) | **High — it is the spec's central risk** | A single copy contract beside the chart components plus tests asserting the required disclaimers and the absence of the §5 vocabulary |
| Sparse fields produce a misleading rate (agreement, turnaround, area provenance) | High | Denominator-first layout, explicit insufficient-data state, and a decided counts-only floor below an eligible denominator of 10 (Q4) |
| Demo/seed data misleads reviewers (seeded Smut labels, seeded staff classifications) | Medium | Charts declare the condition list `healthy, mosaic, rust`; any future Smut/RSSI series is gated on the model, not on the presence of rows |
| Two renderers for one series (library in the SPA, server-rendered SVG bars in the document) | Low–Medium | The shared *aggregate* is what keeps the numbers equal, plus the document-contract test already planned by the documents track. Accepted cost of Q3 |
| Scope creep into Mobile | Low | Map 2 stays on the Mobile readiness surface (§4 N5); the Web dashboard never claims readiness or sync state |
| Read-only plan interpreted as approval to build | Low | This task changed no code; Phase 1 needs its own go-ahead |

**What this plan deliberately does not do:** it does not touch the manuscript, does not resolve §26 manuscript alignment debt, does not retrain a model, and does not decide the five-category classifier's rollout. Those are prerequisites for the NEEDS DATA bucket, not Web chart work.

---

## 10. Relationship to the approved documented-reports plan

The approved plan (`data/cg-web-reports-plan-20260921/report.md`, P0–P2) already specifies per-day/per-week SVG bars inside the printed document — that is **C1 rendered print-first**. Two consequences, one of them now decided:

1. **Share one aggregate** so the document and the dashboard cannot disagree about a period's counts. Building C1's bucketing in the API aggregate is therefore useful to both tracks. Note this is the *aggregate* that is shared, not the rendering: Q3's library serves the SPA only, and the document keeps its server-rendered SVG bars.
2. **Sequencing is decided (Q5): documents first, charts ride on its period groundwork.** Charts Phase 1 consumes the documents Phase 0 output (PHT weekly/monthly/custom boundaries and the 366-day cap) rather than re-deriving it. If documents P0 slips, charts Phase 1 waits.

---

## 11. Decisions recorded (2026-09-22), and the one remaining choice

All seven board questions were answered by the captain. Nothing in this section is still open except Q8.

| # | Decision | Effect on this plan |
| --- | --- | --- |
| **Q1** | **PHT (UTC+8)** boundaries, printed on every chart | §7.4. Charts use the same rule as documents. The monthly panel stays UTC (Q6), so the divergence is permanent and printed rather than transitional. No chart or gate changed |
| **Q2** | **Dashboard only** — *not* my recommendation | Phase 1 delivers one dashboard section and nothing in the Monitoring workspace. The shared-component/two-entry-point framing is withdrawn; the register stays a table. No chart or gate changed |
| **Q3** | **Add a chart library** — *not* my recommendation | §6, §7.1. The dependency-free stance is withdrawn. One runtime dependency and a committed lockfile are added to the Phase 1 gate. The approved documents work keeps its server-rendered SVG bars, so the SPA and the document now have separate renderers sharing one aggregate |
| **Q4** | **Counts only until the eligible denominator reaches 10**, then show the rate with the denominator | §6 Phase 3, §8. Phase 3 ships a counts-only state below 10 and a rate above it, with a test for each |
| **Q5** | **Documents first**; charts ride on its period groundwork | §6 (Phase 1 now has an explicit `Depends on` row), §10. Charts Phase 1 consumes documents Phase 0 output instead of re-deriving boundaries |
| **Q6** | **Keep the monthly panel**; remove only the barangay and Possible Condition lists once the charts cover them | §6 Phase 1 gains a panel-cleanup row naming `MonthlyCaseSummary.tsx` and its test. The metric tiles and review-time block stay |
| **Q7** | **Per-period bar** with the measured/not-measured split and the duplicate-and-overlap disclosure line | §6 Phase 2 (C6). Every option carried the mandated labels, so only the presentation was in question |

### Q8 — which library? (the remaining choice)

The captain approved *a* library, not a package, and this project asks before dependency changes. The verified comparison is in §7.1.

| Option | Cost | Benefit |
| --- | --- | --- |
| **Recharts 3.10.1** (recommended) | 12 direct deps incl. `@reduxjs/toolkit`, `react-redux`, `immer`; ~7.5 MB unpacked; MIT; declared React 19 peer | Declarative React API covering all thirteen chart shapes; SVG output; best-documented option |
| **@nivo/bar + @nivo/core 0.99.0** | A separate package per chart type; different composition model | MIT, declared React 19 peer, SVG-first, far smaller per package (`@nivo/bar` 343 KB) |
| **@visx 4.0.0** | Axes, tooltips and legends become our code — close to the no-library effort | MIT, React 19 peer, ~227 KB per package, maximum control |
| **@nivo (or Recharts 2.15.4) if 3.x's redux surface is refused** | Trade-off documented rather than hidden | Keeps the Q3 decision while cutting dependency weight |

If the answer is none of these — i.e. the library decision is reversed — the plan reverts to the hand-authored inline SVG described in the superseded rendering option, and Phase 1's gate loses the lockfile step.
