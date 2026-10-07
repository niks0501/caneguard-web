# The "Mine" filter in the CaneGuard web Monitoring workspace

Scout report — task `cg-mine-filter-20261007`
Written: 2026-10-07 (Asia/Manila)
Worktree: `/home/aki/.treehouse/caneguard-web-5e89d4/9/caneguard-web` (disposable, detached HEAD)
Base commit: `6874822` (`Fix field validation queue version projection (#270)`)
Live stack used: Vite dev server `http://localhost:5173`, Laravel API `http://localhost:8000`, MySQL `caneguard` (seeded demo data, 848 reports, 245 field-validation assignments)

**No product code was changed by this task.** The only edits were scratch reproduction tests and an in-worktree removal experiment, both reverted/deleted; the worktree was verified clean (`git status --porcelain` shows no modified tracked files).

---

## 1. Verdict (short)

**Remove the `Mine` quick filter from Monitoring → Field Operations, under a spec amendment; it cannot ever return a non-empty result for any session the web workspace authorizes.**

Evidence in one line: web sessions are restricted by construction to `reviewer`/`admin` (`api/app/Models/User.php:83-101,132-140`), while a field-visit assignee is restricted by construction to `field_reporter` (`api/app/Http/Requests/ReviewReportRequest.php:268-281`, `api/app/Http/Controllers/Api/V1/FieldReporterController.php:19-24`). `Mine` matches the assignment's **assignee** against the signed-in web user (`src/pages/FieldOperationsPage.tsx:101-104`). The two identity sets are disjoint, so the filter is an always-empty control — a permanent false negative dressed as a personal workload view.

It is **not** a seed-data gap and **not** an authentication identity bug: the auth identity is correct, the data is present, and the filter still cannot match. It is a genuine, structurally guaranteed defect of the control as specified.

One caveat on the disposition: the frozen contract for the redesign that introduced this control lists `Mine` explicitly (`AC-50`, issue #267). Removal is therefore a **spec-gated** change, not a drive-by cleanup. Section 9 gives the exact, measured removal impact and three options.

---

## 2. Where the control lives

There are **two** implementations of a `Mine` filter in the repo. Only one is reachable.

### 2.1 Live: Monitoring → Field Operations (`MonitoringWorkspacePage` view `field-operations`)

| What | Location |
| --- | --- |
| Workspace view host (embeds the page) | `src/pages/MonitoringWorkspacePage.tsx:57` (`{view === "field-operations" ? <FieldOperationsPage embedded /> : null}`) |
| `mineOnly` state | `src/pages/FieldOperationsPage.tsx:56` |
| Current web identity read | `src/pages/FieldOperationsPage.tsx:94-95` (`auth?.user?.name` / `auth?.user?.uuid`) |
| The filter predicate | `src/pages/FieldOperationsPage.tsx:101-104` |
| The button (label `Mine`) | `src/pages/FieldOperationsPage.tsx:227-234` |
| It counts as an active filter / is cleared with the rest | `src/pages/FieldOperationsPage.tsx:153`, `:156` |

The predicate:

```tsx
// src/pages/FieldOperationsPage.tsx:101-104
if (mineOnly) {
  const matchesUser = item.assignee?.uuid === currentUserId
    || (currentUserName && item.assignee?.name.toLowerCase() === currentUserName.toLowerCase());
  if (!matchesUser) return false;
}
```

This is a **client-side filter over the already-loaded complete workload**. It does not touch the server: `useReports({queue: "needs_visit", ...})` and `useFieldValidationQueue({queue: "needs_visit"}, {complete: true})` are called with no `assignment` parameter (`src/pages/FieldOperationsPage.tsx:62-68`). So this is never a pagination problem — the same conclusion holds over all 244 `needs_visit` rows.

### 2.2 Dead: `FieldValidationQueuePanel`

`src/components/fieldValidation/FieldValidationQueuePanel.tsx` has its own `Mine` button (`:150-170`, label at `:163`) and its own predicate (`:115-124`):

```tsx
// src/components/fieldValidation/FieldValidationQueuePanel.tsx:118-123
if (assignmentFilter === "mine") {
  if (!item.assignee) return false;
  if (currentUserId && item.assignee.uuid === currentUserId) return true;
  if (currentUserName && item.assignee.name.toLowerCase() === currentUserName.toLowerCase()) return true;
  return item.assignee.name === "Maria Santos";   // <-- hardcoded demo fallback
}
```

The component is **orphaned**. It is rendered nowhere in the app: repo-wide search for the symbol finds only the component file and its own test — `grep -rn "FieldValidationQueuePanel" --include="*.tsx" --include="*.ts" src/` returns only `FieldValidationQueuePanel.tsx` and `FieldValidationQueuePanel.test.tsx`. Git confirms the orphaning: the immediately preceding commit `3285ca0` (issue #267 / PR https://github.com/niks0501/caneguard-web/pull/269) deleted its only mount point from the Map page:

```
$ git show 3285ca0 -- src/pages/FieldValidationMapPage.tsx | grep -n "^-.*Panel"
45:-import { FieldValidationQueuePanel } from "../components/fieldValidation/FieldValidationQueuePanel";
517:-            {visibleQueueData ? (
518:-              <FieldValidationQueuePanel data={visibleQueueData} />
```

So the Map view had a `Mine` filter until the redesign; the redesign moved a `Mine` button into Field Operations and left the old panel (and its hardcoded fallback) behind as dead code.

### 2.3 Also present but never called from the UI

The server-side `assignment=all|mine|unassigned` filter exists and works, but **no UI caller passes it**:

- Type: `src/domain/fieldValidation.types.ts:28`
- API repository pass-through: `src/data/api/ApiFieldValidationRepository.ts:31`
- Backend validation: `api/app/Http/Requests/FieldValidationQueueRequest.php:35`
- Backend implementation: `api/app/Actions/Reports/QueryFieldValidationQueue.php:43-47` — `mine` means `fieldValidationAssignment.assignee_id === auth()->id()`
- Mock implementation: `src/data/mock/MockFieldValidationRepository.ts:152-157` — `mine` is hardcoded to the mock user
- Callers: none. `grep -rn "assignment" src/ | grep -v fieldValidationAssignment` yields only the type, the pass-through above, and the two client-side panels.

---

## 3. What "mine" means

Both implementations define `Mine` as **"the field-validation assignment's `assignee` is me"** — not creator, not reviewer, not team membership.

Identity chain (API mode):

1. `GET /api/v1/me` → `{uuid, name, role: farmer|field_reporter|reviewer|admin}`; the frontend then rejects anything that is not `reviewer|admin` (`src/auth/auth.api.ts:17`, `:99-100`, `:110-118`).
2. `AuthContext.user.uuid/name` is the only identity the filter compares against (`src/pages/FieldOperationsPage.tsx:94-95`).
3. Queue/report rows carry `fieldValidationAssignment.assignee.{uuid,name}` (`api/app/Http/Resources/ReportListResource.php:104-107`; frontend mapping `src/domain/fieldOperations.ts:70-71,101-102`).
4. Server-side `assignment=mine` independently means `assignee_id = auth id` (`api/app/Actions/Reports/QueryFieldValidationQueue.php:44-46`) — same semantic, so the dead server path would also be empty for a web session but non-empty for a field reporter.

`Registered assignee` is a **field inspector identity**. The contract's own vocabulary: "assigned inspector or Unassigned" (issue #267).

Note also that the Register view's per-person filter is worded `Reviewer` but has the *same* assignee semantic: `src/pages/SubmittedReportsPage.tsx:410-422` maps its `Reviewer` select to `urlState.filters.reviewer`, which the API resolves to `fieldValidationAssignment.assignee.uuid` (`api/app/Actions/Reports/ApplyReportFilters.php:105-110`, `src/data/api/ApiReportsRepository.ts:62`). That is a separate terminology defect, but it matters here because it shows the Register **already** offers "show me visits for inspector X" to every user, so removing `Mine` from Field Operations loses no capability.

---

## 4. Why the result is always empty (the proof)

### 4.1 The two role sets are disjoint by construction

```php
// api/app/Models/User.php:83-101
public static function officeRoles(): array { return [self::ROLE_REVIEWER, self::ROLE_ADMIN]; }
public static function webRoles(): array { return [...self::officeRoles()]; }   // reviewer, admin
// api/app/Models/User.php:132-140
public function isWebUser(): bool { return in_array($this->role, self::webRoles(), true); }
public function hasWebAccess(): bool { return $this->is_active && $this->hasVerifiedEmail() && $this->isWebUser(); }
```

```php
// api/app/Http/Requests/ReviewReportRequest.php:268-281 (assignment path)
User::query()
    ->where('uuid', $this->input('field_validation_assignee_uuid'))
    ->where('role', User::ROLE_FIELD_REPORTER)          // <-- must be a field reporter
    ->whereNotNull('email_verified_at')
    ->whereIn('id', DistrictMembership::...->select('user_id'))
    ->exists()
// else error: 'The selected assignee must be a field reporter.'
```

```php
// api/app/Http/Controllers/Api/V1/FieldReporterController.php:19-24 (the inspector picker)
User::query()->where('role', User::ROLE_FIELD_REPORTER)->whereNotNull('email_verified_at')->...
```

Frontend gate, identical restriction:

```tsx
// src/auth/RequireWebRole.tsx
return user && (user.role === "reviewer" || user.role === "admin") && user.is_active !== false
  ? <Outlet /> : <Navigate replace to={routes.login} ... />;
```

`webRoles = {reviewer, admin}`, `assignee = {field_reporter}` — intersection empty. A field reporter cannot sign into the web workspace at all (`src/auth/auth.api.ts:99-100` throws `WebRoleError`), so the one identity class that can own assignments can never click this button.

### 4.2 The live database confirms it

Seeded local API database (`php artisan tinker`, read-only):

```
users:
1 | Arnel Mercado    | field_reporter | active=true | 01a1165d-c555-71d1-8b4f-21dd4bef04b5
2 | Liza Mae Navarro | reviewer       | active=true | 01a1165d-c61a-71be-a441-0f48e68a6caa
3 | Crisanto de Vera | admin          | active=true | 01a1165d-c6d8-73b6-93a4-cc9e511f734c

assignments by assignee: 1 => 245          (all 245 assignments belong to the single field reporter)
field_validation_assignments columns: id,uuid,report_id,assignee_id,assigned_by_id,target_visit_date,activated_at,created_at,updated_at
```

`assignee_id` takes exactly one value in the whole database: the field reporter. So the `Mine` predicate's `assignee.uuid === currentUserId` can never be true for any of the three users' web sessions (and only user 2 and 3 have web sessions).

### 4.3 The backend queue scope, exercised with both possible web sessions

Run against the running local stack, using the real action class and the real reviewer/admin identities:

```
$ cd api && php artisan tinker --execute='...'   # see Appendix B for the full snippet
Liza Mae Navarro (reviewer, id 2) => all=244 mine=0 unassigned=122
Crisanto de Vera (admin,  id 3) => all=244 mine=0 unassigned=122
   first-page assignees: {"UNASSIGNED":50,"Arnel Mercado":50}
```

For every queue the page can show:

```
needs_visit:  all=244  mine=0
follow_up_due: all=45  mine=0
upcoming:     all=77   mine=0
web sessions possible: ["Crisanto de Vera","Liza Mae Navarro"]
eligible assignees:    ["Arnel Mercado"]
```

The `unassigned=122` control proves the scoping works and is not silently returning nothing — the filter is fine; the *identity* can never match.

### 4.4 Deterministic UI reproduction

`src/pages/scoutMineFilter.repro.test.tsx` (scratch, deleted after use — full source in Appendix A) renders `FieldOperationsPage` exactly like the existing suite does, but with **production-shaped** inputs: auth user = a reviewer, workload assignees = a field reporter.

```
$ npx vitest run src/pages/scoutMineFilter.repro.test.tsx
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

Asserted outcomes:
- `All` renders the assigned workload (`CG-P1`, `CG-P2` visible).
- Clicking `Mine` renders `No visits match the current filters` and `CG-P1` is gone — i.e. **empty, with assigned work sitting right there under `All`**.
- The `Upcoming` section displays `Arnel Mercado` as the assignee while the session user is a reviewer.

This is the exact symptom reported: click `Mine`, get nothing, purpose unclear.

---

## 5. Why nobody noticed: the mock data source disagrees with production

The mock data source **does** produce non-empty `Mine` results, because it invents an assignment to the mock web user:

- Mock web user: `Maria Santos`, uuid `00000000-0000-4000-8000-000000000100` (`src/auth/AuthProvider.tsx:24-30`, `:41`).
- Mock report assignment: `assignee: {uuid: "00000000-0000-4000-8000-000000000100", name: "Maria Santos"}` (`src/data/mock/mockReports.ts:73-78`).
- Mock queue `mine`: hardcoded to that same uuid/name (`src/data/mock/MockFieldValidationRepository.ts:152-157`).

Verified (`src/data/mock/scoutMineFilter.repro.test.ts`):

```
$ npx vitest run src/data/mock/scoutMineFilter.repro.test.ts --reporter=verbose
mock needs_visit all=2 mine=1
mockReports with an assignment: 1
mock reports?reviewer=<mock user uuid> total=1
```

So in `VITE_DATA_SOURCE=mock` the control looks correct and useful. `.env.local` sets `VITE_DATA_SOURCE=api`, but `.env.example` documents `mock` as a supported mode, and this is exactly the divergence that lets an unusable filter pass design and unit review. The mock identity `Maria Santos` does not exist in the API database at all, so mock and api describe **different products** for this control.

The dead panel is the same story: it does not even consult the session first — it falls through to `return item.assignee.name === "Maria Santos"`, so `Mine` in that component means "Maria Santos's visits" regardless of who is signed in. Its test renders the panel with **no** `AuthContext` provider (`src/components/fieldValidation/FieldValidationQueuePanel.test.tsx:35-40`), so the assertion `// Filter to Mine (matches Maria Santos)` at `:85-88` passes *only* because of that hardcoded name.

The live page's own test has the mirror-image problem: it renders with an auth user whose uuid is the same as the fixture assignee's uuid, so the impossible case is assumed away:

```tsx
// src/pages/FieldOperationsPage.test.tsx:29
const inspectorOne = { uuid: "inspector-1", name: "Inspector One" };
// :48-70  ... every assigned fixture row uses inspectorOne ...
// :92-99
<AuthContext.Provider value={{ user: { uuid: "inspector-1", name: "Inspector One" } } as never}>
```

The one test that clicks `Mine` (`src/pages/FieldOperationsPage.test.tsx:283-297`) does not assert that `Mine` yields rows; it clicks `Mine` and then also types a nonsense search to reach the filter-empty state. It therefore cannot fail on the real defect — it only fails if the *button disappears* (see §9).

The protected issue-267 contract test does not cover `Mine` at all: `src/pages/MonitoringMapFieldOperations.contract.test.tsx` asserts AC-01, AC-41 and AC-34 only — `grep -n "Mine" src/pages/MonitoringMapFieldOperations.contract.test.tsx` → no matches.

And PR https://github.com/niks0501/caneguard-web/pull/269 states under **Residual risks / gaps**: "No browser/E2E verification was run for this change." The control shipped with its AC named but unverified, against mock-shaped data.

---

## 6. Who relies on it

**Product code: nobody.**

- No component, hook, or route consumes `mineOnly`; it is local `useState` inside `FieldOperationsPage` (`:56`).
- No server behavior depends on it: the page never sends `assignment` (`:62-68`), and the server's own `assignment=mine` has no caller (§2.3).
- No docs, tickets, or validation scripts mention it: `grep -rn "Mine\|mineOnly" --include="*.mjs" --include="*.md" --include="*.json" --include="*.css" .` (excluding node_modules/dist/graphify-out) → **no output**. `scripts/validate-design-spine.mjs` references the shared `.queue-filter-btn` class (`src/index.css:7517`) but not this control, so the design-spine gate is unaffected either way.

**Spec/contract: yes — `AC-50`, which is the one real obstacle to deletion.**

Issue #267 ("[FROZEN SPEC] Monitoring Map and Field Operations Redesign Feature Contract", state: closed, created 2026-10-07) says, verbatim:

> Useful quick filters include: **All / Overdue / Unassigned / Mine / Barangay / Visit Date**

> - [ ] AC-50 Field Operations supports All, Overdue, Unassigned, **Mine**, Barangay, and Visit Date filtering **or equivalent approved controls**.

And PR https://github.com/niks0501/caneguard-web/pull/269 lists in its change summary: "quick filters (All/Overdue/Unassigned/Mine/Barangay/Visit Date)". The same contract also states: "Any newly discovered ambiguity that can change observable behavior ... must return to specification review before implementation proceeds." `Mine` is named but **never defined** anywhere in the contract, and the contract's inputs list "authorized inspector identity" — never "current user" as an assignee. That silence is where the defect entered.

The wireframe images embedded in issue #267 could not be retrieved for this report: both `https://github.com/user-attachments/assets/...` URLs return `404 Not Found` to an unauthenticated fetch (9-byte body, `Not Found`). The contract text is the authoritative reference used here.

---

## 7. Reproduce the empty result — cause classification

| Candidate cause from the brief | Verdict | Evidence |
| --- | --- | --- |
| No matching rows for the current user | **Yes, and always** | 245/245 assignments → the single field reporter; web users are reviewer/admin (§4.1-4.3) |
| Seed/demo data gap | **No** | The table is fully populated (245 assignments, 848 reports). No seed could fill `Mine`, because the seeder cannot assign to a reviewer/admin — validation forbids it (§4.1) |
| Auth identity mismatch | **Partly, but not the cause** | Auth plumbing is correct: `/me` returns the reviewer's uuid and it is used verbatim. The mismatch is *role-set disjointness*, not a wrong id. Separately, the **mock** identity (`Maria Santos`) does not exist in the API DB — that is a fixture divergence, not prod auth |
| Genuine defect | **Yes** | The control is structurally incapable of a non-empty result for any authorized session; the empty state then reads as "you are filtered out" rather than "this lens cannot exist for you" |

Reproduction recipe (works after teardown; needs the local stack running):

```bash
# 1. Backend scope, with the real reviewer/admin identities
cd api && php artisan tinker --execute='<Appendix B snippet>'
#    expect: reviewer all=244 mine=0, admin all=244 mine=0, unassigned=122

# 2. Frontend predicate, production-shaped data
#    re-create src/pages/scoutMineFilter.repro.test.tsx from Appendix A
npx vitest run src/pages/scoutMineFilter.repro.test.tsx
#    expect: "Mine is empty for a reviewer even though assigned work exists" passes

# 3. Existing behaviour baseline (unchanged, and still passing today)
npx vitest run src/pages/FieldOperationsPage.test.tsx src/components/fieldValidation/FieldValidationQueuePanel.test.tsx
#    Test Files 2 passed (2) / Tests 18 passed (18)
```

---

## 8. Is there an under-appreciated use case? (yes — but not this semantic)

The *idea* of a personal lens on Field Operations is defensible; the *implemented* semantic is the problem. Two per-web-user dimensions are populated in the live database and are, today, not surfaced by any `Mine`-like control:

**a) "Visits I planned" — `fieldValidationAssignment.assigned_by_id`** (immediately actionable, and the strongest candidate if the product wants a personal lens):

```
assigned_by_id distribution:
2 (Liza Mae Navarro, reviewer) => 240
3 (Crisanto de Vera, admin)    => 5
```

This is already in the API payload (`api/app/Http/Resources/ReportListResource.php:108-111`, `FieldValidationAssignmentResource.php:18`) and already mapped on the web side (`src/data/api/mappers/report.mapper.ts:256`; `FieldWorkloadItem` does not yet carry it, but the mapper does). A `Mine = visits I assigned` lens would show 240 rows to the reviewer in this dataset — non-empty, per-user, and directly relevant to a reviewer's dispatch work.

**b) "Cases I reviewed" — `reports.reviewer_id`**: 696 rows for the reviewer, 20 for the admin, 132 null. Real, but it is a *Register* lens (case review history), not a Field Operations lens, and no list filter or payload field exposes it today (`reviewer` in `ApplyReportFilters` means the assignee, §3). This would be new capability, not a re-pointing.

Neither of these is "Mine = my field visits". There is no dataset and no plausible seed in which a reviewer/admin is an inspector. So there is **no important, easily underestimated use case for the filter as implemented** — the defensible use case requires *changing what the control means*, which is exactly what §9 asks firstmate/the captain to rule on.

---

## 9. Recommendation, options, and measured removal impact

### Recommended: Option A — remove `Mine`, gated by a spec amendment

Delete the button and the predicate; amend `AC-50` in the frozen contract to drop `Mine` with the stated reason (no authorized web session can own a field-validation assignment). Rationale:

- The control can never be non-empty, so it cannot inform any decision; it only produces a misleading empty state on a workload page that is otherwise honest about scope and completeness.
- It is not a capability: the Register's `Reviewer` select already lists visits per inspector for every user (§3), and the Field Operations `Assigned` metric + `Unassigned` filter cover the aggregate view.
- Removal is small, local, and has no backend, persistence, authorization, or design-spine coupling.

**Measured removal impact** (performed as a scratch experiment, then reverted; nothing left in the worktree):

- Touched surface: `src/pages/FieldOperationsPage.tsx` only — `mineOnly` state (`:56`), the predicate (`:101-104`), the button (`:227-234`), plus `:153`/`:156` and the now-unused `auth`/`currentUserName`/`currentUserId` (`:50`, `:94-95`, dependency array `:113`). The page then needs no `AuthContext` import.
- Tests: exactly **1 of 18** fails — `src/pages/FieldOperationsPage.test.tsx:293` (`distinguishes an empty active workload from filter-empty results`), which reaches its filter-empty state by clicking `Mine`. The fix is to reach that state with a search term or the Barangay filter instead, preserving the assertion's intent. Full run of the two affected files without the change: `2 passed / 18 passed`. After removal: `1 failed | 13 passed` (that one test), `FieldValidationQueuePanel.test.tsx` unaffected.
- `npx tsc --noEmit -p tsconfig.app.json`: **pass** (a complete removal also drops the two `auth`-derived locals; after dropping them, `eslint` reports 1 error `'auth' is assigned a value but never used` → delete the last `useContext(AuthContext)` usage too, then lint is clean).
- `npm run test:design-spine`: **pass** (`9 pass / 0 fail`); no named selector or token depends on `Mine`.
- No server change, no migration, no seeded data change. `assignment=all|mine|unassigned` remains available to any future caller.

Optional follow-up in the same change (separate cleanup, not required): delete the orphaned `src/components/fieldValidation/FieldValidationQueuePanel.tsx` + its test (dead since `3285ca0`, and its `Mine` carries a hardcoded `"Maria Santos"` fallback), and drop the now-unused frontend `assignment` type/pass-through if no caller is planned.

### Option B — redefine `Mine` instead of removing it

Only if the product wants a personal lens on Field Operations: re-point `Mine` to `fieldValidationAssignment.assigned_by_id === me` ("visits I planned"), which is populated (240/5 rows locally) and already present in the payload. This **changes what the control means**, so it also needs a spec ruling; it additionally wants a payload field for `assigned_by` on `FieldWorkloadItem` and a decision about whether the mock source should mirror it. Bigger than Option A, and it invents a semantics the frozen contract never defined.

### Option C — hide the control when the session cannot be an assignee

Cheapest visible mitigation (the button simply never renders on web). It has the same user-visible outcome as removal but leaves dead code and hides the fact that the intended lens does not exist. Not recommended on its own.

### If the captain wants it kept

Then it must at minimum stop claiming to be a personal lens: rename/relabel it to the dimension it can actually match, or show it disabled with an explicit reason. Leaving an always-empty `Mine` on a page whose empty state says "No visits match the current filters" is the result the captain already reported.

---

## 10. Verification actually run

| Check | Command | Result |
| --- | --- | --- |
| Backend queue scope with real reviewer/admin identities | `cd api && php artisan tinker --execute='<Appendix B>'` | `all=244 mine=0 unassigned=122` for both web roles; `follow_up_due 45/0`, `upcoming 77/0` |
| Assignment → assignee distribution | `php artisan tinker` (read-only) | 245/245 assignments → user 1 (`field_reporter`); `assigned_by_id` 240 reviewer / 5 admin; `reviewer_id` 696 reviewer / 20 admin / 132 null |
| Frontend predicate, production-shaped session | `npx vitest run src/pages/scoutMineFilter.repro.test.tsx` | 3/3 pass — `Mine` empty while `All` shows the assigned rows |
| Mock divergence | `npx vitest run src/data/mock/scoutMineFilter.repro.test.ts --reporter=verbose` | `mock needs_visit all=2 mine=1` |
| Existing suites (baseline) | `npx vitest run src/pages/FieldOperationsPage.test.tsx src/components/fieldValidation/FieldValidationQueuePanel.test.tsx` | 2 files / 18 tests pass |
| Removal impact | scratch edit + `npx vitest run src/pages/FieldOperationsPage.test.tsx` | 1 failure only, at `FieldOperationsPage.test.tsx:293` (reverted) |
| Types after removal | `npx tsc --noEmit -p tsconfig.app.json` | pass |
| Lint after removal | `npx eslint src/pages/FieldOperationsPage.tsx` | 1 warning (unnecessary `useMemo` deps), 0 errors; becomes a single `no-unused-vars` error for `auth` if the auth read is left behind — i.e. remove it too |
| Design spine after removal | `npm run test:design-spine` | pass (9/9) |
| Worktree cleanliness | `git status --porcelain` | no modified tracked files (scratch files removed) |

**Gaps / residual risks**

- No browser/E2E pass was run: the local demo account passwords in `api/.env`/config no longer match the seeded password hashes, so an HTTP session could not be established (`POST /login` → `422 {"code":"INVALID_CREDENTIALS"}`). The reproduction therefore used the real backend action class + real DB rows + a deterministic component test instead of a live click. This is stronger than a screenshot for the *cause*, but a live click-through remains unverified.
- The issue #267 wireframe images were unreachable (404 unauthenticated), so "the approved wireframe shows a Mine chip" is inferred from the contract text, not observed.
- If the deployment's real database contains historic assignments to reviewer/admin accounts (e.g. rows created before the `field_reporter` validation existed), `Mine` could be non-empty for those accounts. The local seeded DB contains none, and the current code path cannot create any. Worth a one-line production check before deleting: `select u.role, count(*) from field_validation_assignments a join users u on u.id = a.assignee_id group by u.role;`

---

## 11. Captain-hold inventory (semantic inventory for the completion gate)

The investigation is delivered, but one genuine captain-owned choice remains because the disposition touches a frozen contract. This is the whole inventory — no other question in this report requires the captain; every other conclusion is evidence-backed fact.

**Held question (1): does `Mine` get removed from Monitoring → Field Operations, or does the spec redefine what it means?** The captain's original ask ("report a keep-or-remove recommendation") is answered at §9; what remains is the *ruling*, because `AC-50` of the closed frozen contract issue #267 explicitly lists `Mine` as a required quick filter, and that contract requires new ambiguity to "return to specification review".

Options carried in the hold reason:

- **A (recommended)** — remove `Mine`; amend `AC-50` to drop it, recording that no authorized web session can own a field-validation assignment. Impact measured in §9: 1 of 18 tests (`src/pages/FieldOperationsPage.test.tsx:293`), no backend, no data, no design-spine coupling.
- **B** — redefine `Mine` to `fieldValidationAssignment.assigned_by_id === me` ("visits I assigned": 240 reviewer / 5 admin rows in the live DB, already in the API payload). Changes the control's meaning; needs a payload field on `FieldWorkloadItem` plus mock parity.
- **C** — hide the control when the session cannot be an assignee (same visible outcome as A, leaves dead code). Not recommended.

Origin/gate: this scout task (`cg-mine-filter-20261007`). The gate to pass is `complete <origin-id> <held-task-id>`, not `--none`, because a keyed status decision is open for this call (below). The semantic inventory above is what the `hold` reason should quote verbatim; no script should have to infer it from this report's prose.

Status channel opened for this call: `needs-decision [key=mine-filter-disposition]`.

---

## Appendix A — scratch reproduction tests (deleted, recreate to re-verify)

### A.1 `src/pages/scoutMineFilter.repro.test.tsx`

```tsx
/**
 * SCOUT scratch reproduction: the Monitoring -> Field Operations "Mine" filter
 * against a realistic production session (web reviewer) and realistic
 * production workload (field-reporter assignees).
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../auth/auth.context";
import type { FieldValidationQueueItem } from "../domain/fieldValidation.types";
import type { ReportLifecycle } from "../domain/report.types";
import { addScheduleDays } from "../domain/monitoringSchedule";
import { manilaDateAt } from "../domain/reportingTime";
import { useFieldReporters } from "../hooks/useFieldReporters";
import { useReports, useUpdateReportReview } from "../hooks/useReports";
import { useFieldValidationQueue } from "../hooks/useFieldValidation";
import { FieldOperationsPage } from "./FieldOperationsPage";

vi.mock("../hooks/useFieldReporters", () => ({ useFieldReporters: vi.fn() }));
vi.mock("../hooks/useReports", () => ({ useReports: vi.fn(), useUpdateReportReview: vi.fn() }));
vi.mock("../hooks/useFieldValidation", () => ({ useFieldValidationQueue: vi.fn() }));

const officeDate = manilaDateAt();
const day = (offset: number) => addScheduleDays(officeDate, offset);

const lifecycle = (
  fieldValidationState: ReportLifecycle["fieldValidationState"],
  caseState: ReportLifecycle["caseState"] = "open",
): ReportLifecycle => ({
  caseState, verificationOutcome: "not_determined", fieldValidationState, referralState: "not_referred",
});

// Production shape: the only eligible assignee role is field_reporter.
const fieldReporter = { uuid: "01a1165d-c555-71d1-8b4f-21dd4bef04b5", name: "Arnel Mercado" };
// Production shape: the signed-in web user is a reviewer.
const reviewer = { uuid: "01a1165d-c61a-71be-a441-0f48e68a6caa", name: "Liza Mae Navarro" };

function queueItem(overrides: Partial<FieldValidationQueueItem> & { uuid: string }): FieldValidationQueueItem {
  return {
    referenceCode: `CG-${overrides.uuid}`, barangay: "Balaytigui", province: "Batangas", municipality: "Nasugbu",
    observedAt: "2026-08-13T10:20:30.000Z", submittedAt: "2026-08-13T11:00:00.000Z",
    predictedDisease: "rust", confidence: 0.84, reviewStatus: "for_field_validation",
    lifecycle: lifecycle("assigned"), targetVisitDate: null, assignee: null,
    finalLatitude: 14.126, finalLongitude: 120.6039, locationSource: "gps", gpsAccuracy: 8.5,
    affectedAreaHectares: 2.5, affectedPortionPercent: 18, reviewVersion: 7, ...overrides,
  };
}

const productionWorkload: FieldValidationQueueItem[] = [
  queueItem({ uuid: "P1", targetVisitDate: day(-3), assignee: fieldReporter, lifecycle: lifecycle("assigned") }),
  queueItem({ uuid: "P2", targetVisitDate: day(1), assignee: fieldReporter, lifecycle: lifecycle("assigned") }),
  queueItem({ uuid: "P3", targetVisitDate: day(2), assignee: null, lifecycle: lifecycle("unassigned") }),
];

function result<T>(data: T, overrides: Record<string, unknown> = {}) {
  return { data, error: null, isError: false, isFetching: false, isPending: false, isRefetchError: false, refetch: vi.fn(), ...overrides } as never;
}

function renderPage(authUser: { uuid: string; name: string }) {
  return render(
    <AuthContext.Provider value={{ user: authUser } as never}>
      <MemoryRouter initialEntries={["/monitoring?view=field-operations"]}>
        <FieldOperationsPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

beforeEach(() => {
  vi.mocked(useReports).mockReturnValue(result({ reports: [], meta: { total: 0 } }));
  vi.mocked(useFieldValidationQueue).mockReturnValue(result({
    queue: "needs_visit", count: productionWorkload.length, total: productionWorkload.length, oldest: null, items: productionWorkload,
  }));
  vi.mocked(useFieldReporters).mockReturnValue(result([fieldReporter]));
  vi.mocked(useUpdateReportReview).mockReturnValue(result(undefined, { mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false }));
});

describe("SCOUT: Mine filter under a production-shaped session", () => {
  it("All shows the assigned workload", () => {
    renderPage(reviewer);
    expect(screen.getAllByText("CG-P1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("CG-P2").length).toBeGreaterThan(0);
  });

  it("Mine is empty for a reviewer even though assigned work exists", async () => {
    const user = userEvent.setup();
    renderPage(reviewer);
    await user.click(screen.getByRole("button", { name: "Mine" }));
    expect(screen.getByRole("heading", { name: "No visits match the current filters" })).toBeInTheDocument();
    expect(screen.queryByText("CG-P1")).not.toBeInTheDocument();
  });

  it("renders the assignee while the session role is reviewer", () => {
    renderPage(reviewer);
    const section = screen.getByRole("heading", { name: "Upcoming" }).closest("section") as HTMLElement;
    expect(within(section).getAllByRole("article").some((a) => a.textContent?.includes("Arnel Mercado"))).toBe(true);
  });
});
```

### A.2 `src/data/mock/scoutMineFilter.repro.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { MockFieldValidationRepository } from "./MockFieldValidationRepository";
import { mockReports } from "./mockReports";
import { MockReportsRepository } from "./MockReportsRepository";

const MOCK_WEB_USER_UUID = "00000000-0000-4000-8000-000000000100"; // AuthProvider mockUser (Maria Santos)
const MOCK_WEB_USER_NAME = "Maria Santos";

describe("SCOUT: mock data source Mine semantics", () => {
  it("mock queue assignment=mine returns the mock web user's rows", async () => {
    const all = await new MockFieldValidationRepository().getQueue({ queue: "needs_visit" });
    const mine = await new MockFieldValidationRepository().getQueue({ queue: "needs_visit", assignment: "mine" });
    console.log(`mock needs_visit all=${all.items.length} mine=${mine.items.length}`);
    expect(all.items.length).toBeGreaterThan(0);
    expect(mine.items.length).toBeGreaterThan(0);
  });

  it("mock reports carry the mock web user as the only field validation assignee", () => {
    const assigned = mockReports.filter((report) => report.fieldValidationAssignment);
    console.log(`mockReports with an assignment: ${assigned.length}`);
    expect(assigned.every((r) => r.fieldValidationAssignment?.assignee.name === MOCK_WEB_USER_NAME)).toBe(true);
  });

  it("mock register reviewer filter equals the field-validation assignee", async () => {
    const mine = await new MockReportsRepository().listReports({ queue: "needs_visit", reviewer: MOCK_WEB_USER_UUID });
    console.log(`mock reports?reviewer=<mock user uuid> total=${mine.meta.total}`);
    expect(mine.meta.total).toBeGreaterThan(0);
  });
});
```

---

## Appendix B — backend verification snippets (read-only)

```php
// php artisan tinker --execute='...'   (cd api)
use App\Models\User; use App\Actions\Reports\QueryFieldValidationQueue;
$q = app(QueryFieldValidationQueue::class);
function asUser($u, $q) {
  auth()->login($u);
  app("request")->setUserResolver(fn () => $u);      // the action reads request()->user() for the district scope
  $all  = $q->handle(["queue" => "needs_visit", "limit" => 100]);
  $mine = $q->handle(["queue" => "needs_visit", "limit" => 100, "assignment" => "mine"]);
  $un   = $q->handle(["queue" => "needs_visit", "limit" => 100, "assignment" => "unassigned"]);
  echo $u->name." (".$u->role.", id ".$u->id.") => all=".$all["total"]." mine=".$mine["total"]." unassigned=".$un["total"].PHP_EOL;
}
asUser(User::where("role", "reviewer")->first(), $q);
asUser(User::where("role", "admin")->first(), $q);
foreach (["needs_visit", "follow_up_due", "upcoming"] as $queue) { /* all vs mine per queue */ }
```

```php
// assignment -> assignee distribution
foreach (FieldValidationAssignment::query()->selectRaw("assignee_id, count(*) c")->groupBy("assignee_id")->get() as $r) { ... }
foreach (FieldValidationAssignment::query()->selectRaw("assigned_by_id, count(*) c")->groupBy("assigned_by_id")->get() as $r) { ... }
foreach (Report::query()->selectRaw("reviewer_id, count(*) c")->groupBy("reviewer_id")->get() as $r) { ... }
```

Note on `visibleTo`: `Report::query()->visibleTo(request()->user())` (`api/app/Actions/Reports/QueryFieldValidationQueue.php:19`) returns nothing when the request has no authenticated user (`DistrictAccess::scope` → `whereRaw('1 = 0')`), so a tinker run that only calls `auth()->login()` reports `all=0`. Setting the request user resolver is required, as above.

---

## Appendix C — key file:line index

| Concern | Reference |
| --- | --- |
| Field Operations `Mine` state | `src/pages/FieldOperationsPage.tsx:56` |
| Session identity used for the match | `src/pages/FieldOperationsPage.tsx:94-95` |
| `Mine` predicate | `src/pages/FieldOperationsPage.tsx:101-104` |
| `Mine` button | `src/pages/FieldOperationsPage.tsx:227-234` |
| Complete-workload reads (no `assignment` param) | `src/pages/FieldOperationsPage.tsx:62-68` |
| Field Operations mounted in Monitoring workspace | `src/pages/MonitoringWorkspacePage.tsx:57` |
| Dead panel `Mine` predicate (hardcoded fallback) | `src/components/fieldValidation/FieldValidationQueuePanel.tsx:118-123` |
| Dead panel `Mine` button | `src/components/fieldValidation/FieldValidationQueuePanel.tsx:157-165` |
| Assignment filter type (no UI caller) | `src/domain/fieldValidation.types.ts:28` |
| Assignment filter pass-through | `src/data/api/ApiFieldValidationRepository.ts:31` |
| Mock `mine` (hardcoded uuid/name) | `src/data/mock/MockFieldValidationRepository.ts:152-157` |
| Mock web user (`Maria Santos`, `...0100`) | `src/auth/AuthProvider.tsx:24-30`, `:41` |
| Mock assignment to the mock web user | `src/data/mock/mockReports.ts:73-78` |
| Web role enum + `WebRoleError` | `src/auth/auth.api.ts:17`, `:99-100`, `:110-118` |
| Web route guard | `src/auth/RequireWebRole.tsx` |
| `officeRoles` / `webRoles` (reviewer, admin) | `api/app/Models/User.php:83-101`, `:132-140` |
| Assignee must be a field reporter | `api/app/Http/Requests/ReviewReportRequest.php:268-281` |
| Inspector picker = field reporters only | `api/app/Http/Controllers/Api/V1/FieldReporterController.php:19-24` |
| Server `assignment=mine` = `assignee_id = auth id` | `api/app/Actions/Reports/QueryFieldValidationQueue.php:43-47` |
| `reviewer` filter actually means assignee | `api/app/Actions/Reports/ApplyReportFilters.php:105-110` |
| Register "Reviewer" select (per-inspector filter) | `src/pages/SubmittedReportsPage.tsx:410-422` |
| `assignee` in queue payload | `api/app/Http/Resources/ReportListResource.php:104-111`; `src/domain/fieldOperations.ts:70-71,101-102` |
| Existing Mine-clicking test (the one removal breaks) | `src/pages/FieldOperationsPage.test.tsx:283-297` |
| Panel test relying on the hardcoded name | `src/components/fieldValidation/FieldValidationQueuePanel.test.tsx:35-40`, `:64-91` |
| Issue-267 protected contract test (no `Mine` coverage) | `src/pages/MonitoringMapFieldOperations.contract.test.tsx:34-58` |
| Commit that introduced the live `Mine` and orphaned the panel | `3285ca0` — https://github.com/niks0501/caneguard-web/pull/269 |
