# Duplicate-link UUID burden — current flow, root cause, and recommended replacement

Date: 2026-09-22 · Scope: investigation only, no code changed · Branch: `fm/cg-web-duplicate-link-ux-20260921`

## Answer up front

**Where is a user supposed to get the UUID? Nowhere in the product.** No screen in the web app ever
renders a report UUID, and the app contains no copy-to-clipboard affordance at all
(`navigator.clipboard` is unused). The only way an office user can obtain a canonical case UUID today
is to open the other case, read the 36-character UUID out of the browser address bar
(`/reports/<uuid>`, `src/app/routes.ts:20`), copy it, come back, and paste it into the modal.

**One clarification on the brief:** there is exactly one UUID field, not two. The duplicate-link modal
has two text inputs — `Canonical case UUID` (`src/pages/CaseReviewPage.tsx:2354-2366`) and
`Link reason (optional)` (`:2368-2382`). Only the first takes a UUID; the reason is free text. The
burden is real but it comes from one unobtainable identifier, not from typing a UUID twice.

**Recommendation:** replace raw UUID entry with a **searchable case picker** (reference code, farmer/farm,
barangay, reporter, date range, condition, status), seeded by the **existing** system-suggested
possible-matches block, with UUID paste demoted to a collapsed "paste instead" fallback. The picker needs
no new endpoint: `GET /api/v1/reports` already searches the exact fields required and its rows already
carry `uuid`, `reference_code`, reporter, barangay, `submitted_at`, `predicted_label`, and `review_status`.

## 1. Current flow, end to end

### 1.1 Entry points and fields

| Item | Reality | Evidence |
| --- | --- | --- |
| Where linking happens | Only `CaseReviewPage`, "More actions" → `Link as possible duplicate` | `src/pages/CaseReviewPage.tsx:1775-1782` |
| Modal | `#duplicate-link-modal`, "Link as possible duplicate" | `:2281-2406` |
| Suggestion block | Rendered above the inputs when the API returns matches | `:2316-2353` |
| Field 1 | `Canonical case UUID`, free-text input, placeholder `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` | `:2354-2366` |
| Field 2 | `Link reason (optional)`, free text, max 320 client / 1000 API | `:2368-2382`; `api/app/Http/Requests/LinkDuplicateReportRequest.php:31-37` |
| Who may link | Office users only (`linkDuplicate` ability) | `api/app/Policies/ReportPolicy.php:78-81` |
| Submit payload | `canonicalReportUuid`, `reason`, `expectedVersion` (current case lock version) | `src/pages/CaseReviewPage.tsx:848-873` |

### 1.2 Where a UUID could come from — exhaustive

1. **Suggested match → "Use as canonical"** (`:2338-2350`). One click sets the UUID *invisibly*; the raw
   UUID string then appears in the text input. This path exists but is narrow: it is gated by
   `FindPossibleRecentMatches` to *same predicted label* + *within 100 m* + *submitted in the last 72
   hours* (`api/app/Actions/Reports/FindPossibleRecentMatches.php:20-70`;
   `api/config/caneguard.php:81-86`), and returns nothing at all when the case has no GPS fix.
2. **Paste from another case's browser URL.** The only general source. Nothing exposes it for copying.
3. Nowhere else: the case review page identifies the case by reference code only
   (`title={report.referenceCode}`, `:1022`), lists use reference codes, and no screen renders a *report*
   UUID (`rg -n "\{[^}]*\.uuid\s*\}" src` yields only React keys, `<option value>` bindings and route
   params). The single UUID the product does show is the signed-in user's own ID, rendered as secondary
   machine text under "User ID" in Settings (`src/pages/SettingsPage.tsx:198-200`, `.machine-text` at
   `src/index.css:7582`), which is the right precedent for how a target UUID should appear in the picker.

That suppression is deliberate, not accidental: the case-history timeline skips canonical-link audits
(`api/app/Actions/Reports/BuildReportCaseHistory.php:84-86`), and the API strips them out of
`audit.metadata_corrections` before the client's "Correction history" list can print
`corrected_value` (`api/app/Http/Resources/ReportResource.php:259-260`, rendered at
`src/pages/CaseReviewPage.tsx:2522-2540`). The canonical link is re-exposed only as reference code
(`canonicalLinkage`). A `duplicate_linkages[].canonical_case_uuid` field is parsed but never consumed
(`src/data/api/schemas/report.schema.ts:592-595`) and is the obvious place a follow-up change could
leak UUIDs into the UI by accident. Taken together: the product keeps UUIDs out of the interface
everywhere except the one field that requires the user to supply one.

### 1.3 Exact steps a user performs today (the burden)

Path A — a suggestion is offered (same condition, within 100 m, within 72 h, GPS present):

1. Open the case → scroll to More actions → click `Link as possible duplicate`.
2. Wait for "Checking recent submissions for a possible match...".
3. Click `Use as canonical` on a row.
4. The row is replaced in the input by an opaque 36-character string; there is no reference-code readback
   of the *selection*, so the target is confirmed only by trusting the string that appeared.
5. Optionally type a reason → click `Link as possible duplicate`.

Path B — no suggestion (the common case: older duplicate, different barangay, no GPS, different label,
mock/demo data source):

1. Open the case → More actions → `Link as possible duplicate`.
2. Read "No possible recent matches were found." or "Possible matches could not be loaded."
3. Leave the modal/app and find the other case: open the Reports register, search it, or open it in a
   second tab.
4. Read `/reports/<uuid>` out of the address bar and select 36 hex characters by hand.
5. Return to the case, reopen the modal (closing it while dirty prompts a discard confirmation,
   `:751-753`).
6. Paste into `Canonical case UUID`. No autocomplete, no validation feedback beyond a server round trip,
   no confirmation that the UUID belongs to the intended case.
7. Optional reason → submit. Only *after* the request succeeds does the summary card reveal the target as
   `Canonical case CG-2026-0007` (`:1740-1748`).

Path C — demo/mock data source (`VITE_DATA_SOURCE=mock`): the suggestion list is hard-coded empty
(`src/data/mock/MockReportsRepository.ts:340-348`), so Step 3-6 of Path B are **always** required, in
every demo. This is the most likely way the burden was observed.

### 1.4 What the API accepts as a link target

`POST /api/v1/reports/{report}/duplicate-link` (`api/routes/api.php:128-129`) accepts
`canonical_report_uuid` (required, `uuid`, must exist in `reports.uuid`), `reason` (optional ≤1000), and
`expected_version` (`LinkDuplicateReportRequest.php:18-38`). Server-side rejections
(`api/app/Actions/Reports/LinkDuplicateReport.php:17-85`):

- 422 `canonical_report_uuid` — self-link; target that is *itself* already linked as a duplicate.
- 422 `report` — **the current case has linked duplicates of its own**. The web UI never reads this key:
  it only displays `errors.canonical_report_uuid` (`:815-816`), so this rejection currently surfaces as
  the generic "The duplicate linking service is unavailable." message.
- 403/409 — permission, or the case already linked / stale `expected_version`.

There is no constraint on condition, barangay, or distance, so a whole-register search is a legitimate
target space.

## 2. Root cause, ranked

1. **The system's human identifier (reference code, `CG-2026-0001`) is not the identifier the flow asks
   for.** The UI speaks reference codes; the modal demands the internal UUID.
2. **The suggestion assistant is a narrow heuristic, not a lookup.** Same condition + 100 m + 72 h + GPS
   cannot answer "link this to the case I remember from last month", so users fall through to Path B.
3. **No general search inside the modal**, even though the register search already supports every axis
   the user knows: reference code, farmer/farm, barangay, reporter name, dates, condition, status
   (`api/app/Actions/Reports/ApplyReportFilters.php:30-60`; `api/app/Http/Requests/ReportFilterRules.php`).
4. **Identity is never verified.** A pasted UUID is accepted blind; the target's reference code appears
   only after the link is recorded.
5. **Mock mode always shows zero suggestions**, so demo and training flows can never exercise the assisted
   path.
6. **The rest of the product treats UUIDs as internal.** Two audit surfaces explicitly filter
   canonical-link UUIDs out of the UI (§1.2), so the modal's UUID field is the single place where an
   internal identifier is demanded from a human — the anomaly, not the pattern.

## 3. Options compared

### Option A — searchable case picker (recommended)

Modal keeps the suggestion block, then adds a typeahead over the register: query by reference code,
farmer/farm, barangay, or reporter name, narrowed by condition, barangay, and submitted date range; rows
show reference code + farmer/farm or reporter + barangay + submitted date + condition; selecting a row
sets the link target. Target is confirmed by reference code, never by UUID. UUID paste stays available
behind a "Paste a case UUID instead" disclosure.

- Reuses `GET /api/v1/reports` (`search`, `barangay`, `disease`, `date_from`, `date_to`, `status`,
  `per_page`) — no new endpoint needed.
- List rows already contain `uuid` + `reference_code` + reporter + barangay + `submitted_at` +
  `predicted_label` + `review_status` + `version` (`api/app/Http/Resources/ReportListResource.php:14-20`),
  and the client already maps them into domain reports (`mapReportListItem`, `src/data/api/mappers/report.mapper.ts:170`).
- Eligibility matches the picker's source: the register list already excludes reports that are linked as
  duplicates (`api/app/Actions/Reports/QueryReports.php:26`), which is exactly the "not already linked"
  rule the link action enforces — so everything the picker offers is linkable in that respect.
- Cost: one new combobox component, modal rewiring, new tests, mock-data work.

### Option B — inline copy-UUID affordances + recent-reports shortcut

Add a "copy UUID" control on case detail and register rows, plus a short "recent cases" list inside the
modal that copies/selects a UUID.

- Cheapest to build (a button and a list), and it does answer "where do I get the UUID".
- But it keeps the whole burden: leave the case, copy 36 characters, return, paste, and still no identity
  verification. It also fixes nothing for the four axes the user actually reasons with
  (reporter, barangay, date, status) — a flat "recent cases" list of the newest rows is a poor duplicate
  finder precisely because duplicates are often older or from another barangay.
- It institutionalises the internal identifier as a user-facing one, which is the root cause in §2.1.

### Winner: Option A

Reasons: it removes the identifier mismatch instead of making it tolerable; it is the only option that
lets a user link a case they have not already got open; it reuses an existing, permission-gated,
already-searched endpoint and existing list payload; and it makes the assisted path (suggestions) and the
manual path (search) the same interaction — select a case — so training and copy-paste habits transfer.
Option B survives as the *secondary* path only, in its cheapest form: the collapsed UUID-paste fallback
inside the picker, for support conversations and off-system references.

No Lavish board was published: the comparison resolves to a single winner, and the remaining items in §5
are implementation defaults rather than competing designs. If the captain wants to arbitrate the search
scope by hand, the three calls in §5.3 are the ones to review.

## 4. Recommended flow

1. Open the case → More actions → `Link as possible duplicate`.
2. Modal shows, in order: suggested likely duplicates (existing endpoint, unchanged heuristics) → picker
   → optional reason → submit.
3. Picker: type reference code, farmer/farm, barangay, or reporter; optional condition/barangay/date
   filters; ~8 rows with reference code, barangay, submitted date, condition.
4. Select a row; the target appears as a chip reading e.g. `CG-2026-0007 · Barangay Mabini · 12 Aug 2026`.
   The UUID is available only as secondary machine text (existing `.machine-text` style, as used for
   "User ID" in `src/pages/SettingsPage.tsx:198-200`, `.machine-text` at `src/index.css:7582`), never as the
   primary label.
5. Optional reason → `Link as possible duplicate`. Post-link summary keeps naming the canonical case by
   reference code (already the case at `:1740-1748`).
6. Fallback: a `Paste a case UUID instead` disclosure keeps the current input for support/off-system
   references, with the same self-link and not-found validation.

**What disappears:** leaving the case, reading the URL, 36-character copy/paste, blind submission, and
the "which case did I just link?" question. Suggestions still cover the near-identical GPS case; search
covers everything else.

## 5. Implementation scope for the follow-up build

### 5.1 Frontend (main work)

1. New `ReportPicker` combobox component (a11y: `role="combobox"`, listbox rows, arrow/enter/escape,
   `aria-activedescendant`, loading/empty/error states, no mouse-only affordances).
2. Modal rewiring in `src/pages/CaseReviewPage.tsx:2281-2406`: keep the suggestion block
   (`:2316-2353`), replace the raw input at `:2354-2366` with the picker, move the UUID input into a
   collapsed fallback, keep the reason field and submit payload (`:848-873`) unchanged.
3. Track the selected target's *label* alongside `canonicalReportUuid` so the chip can be rendered and
   reset when the reason changes (mirror the existing `duplicateLinkDirty` reset logic at `:736-753`).
4. Exclude the case under review from picker results client-side (it is unlinked, so the register returns
   it) and keep returning the existing self-link validation message.
5. Surface the server's `errors.report` message (`:815-816` currently reads only
   `canonical_report_uuid`) — required so the "case has linked duplicates" rejection is understandable.
6. Styles beside the existing duplicate-link block (`src/index.css:5233-5311`, responsive rules at
   `:5858-5865`).

### 5.2 Optional small backend addition

Expose link-eligibility on list rows (e.g. `has_linked_duplicates` or the canonical linkage summary) in
`ReportListResource`, so the picker can show the two ineligible shapes (target already linked; current
case has duplicates) before submit instead of via a 422. Not required for the first pass: the register
already excludes linked reports, and item 5.1.5 covers the remaining case.

### 5.3 Decisions to confirm (recommended defaults in bold)

1. **Search scope: whole register, all roles that may link** vs barangay-first. Default: whole register,
   because duplicates cross barangay boundaries and the API already scopes by permission.
2. **Keep suggestion heuristics unchanged (strict 100 m / 72 h / same label)** vs widening them. Default:
   keep strict and let search cover the rest — widening the assistant risks false "likely duplicate"
   claims, and this change is about removing data entry, not about matching quality.
3. **Mock/demo data:** make `MockReportsRepository.getPossibleRecentMatches` return at least one seeded
   match so the assisted path is demonstrable. Default: yes.

### 5.4 Tests to add or update

- `src/pages/CaseReviewPage.test.tsx` — "keeps possible matching advisory and explicit linkage
  separate" (`:547-594`, selecting a suggestion at `:580`) and "requires a canonical case before explicit
  linkage" (`:596+`) both assert on `getByLabelText("Canonical case UUID")`; they must move to the picker
  interaction. The modal-open/closed lifecycle assertions at `:1282-1290` live in the same file.
- `src/pages/CaseReviewPage.declutter.test.tsx` — no modal assertions; it mocks the duplicate-link hooks
  (`:13-29, 80-81, 197-198`), so it keeps passing but adds no picker coverage.
- New picker tests: typing narrows results; selecting sets the target and renders the reference-code chip;
  the current case is not selectable; a pasted UUID still links; a server `errors.report` message renders;
  empty/error states keep the reason field usable.
- Mock repository tests, if `getPossibleRecentMatches` gains a seeded match.

### 5.5 Verification for the follow-up build

`npm run typecheck`, `npm run lint`, `npm run test -- --run` (targeted `CaseReviewPage` suites first),
`npm run build`, and `npm run api:test` if the list resource changes. Visual confirmation of the picker in
the browser stays with the captain, per the task's out-of-scope note.

## 6. Evidence index

- UI: `src/pages/CaseReviewPage.tsx:1740-1748, 1775-1782, 2281-2406, 848-873, 815-816, 736-753, 1022, 2522-2540`
- Client data: `src/app/routes.ts:20`; `src/data/api/mappers/report.mapper.ts:170`;
  `src/data/mock/MockReportsRepository.ts:340-348`; `src/domain/report.types.ts:264-277, 490-509`
- Search contract: `api/app/Http/Requests/ListReportsRequest.php`; `ReportFilterRules.php`;
  `api/app/Actions/Reports/ApplyReportFilters.php:30-60`; `api/app/Actions/Reports/QueryReports.php:26`
- Link path: `api/routes/api.php:124-131`;
  `api/app/Http/Controllers/Api/V1/LinkDuplicateReportController.php`;
  `api/app/Http/Requests/LinkDuplicateReportRequest.php`; `api/app/Actions/Reports/LinkDuplicateReport.php`;
  `api/app/Actions/Reports/GuardDuplicateLinkLifecycle.php`
- Suggestions: `api/app/Http/Controllers/Api/V1/ReportPossibleMatchesController.php`;
  `api/app/Actions/Reports/FindPossibleRecentMatches.php`; `api/app/Http/Resources/PossibleRecentMatchResource.php`;
  `api/config/caneguard.php:81-86`; `api/tests/Feature/DuplicateAssistanceTest.php`
- Policy: `api/app/Policies/ReportPolicy.php:37-40, 78-81`
- Identifier suppression: `api/app/Actions/Reports/BuildReportCaseHistory.php:84-86`;
  `api/app/Http/Resources/ReportResource.php:259-273, 274-280`;
  `src/data/api/schemas/report.schema.ts:592-595`
