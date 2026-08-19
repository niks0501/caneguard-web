# P0D — Web Data Freshness and React Query Cache Consistency

> **Planning baseline (inspected 2026-08-19)**
>
> - `niks0501/caneguard-mobile` `main` @ `3ff11246cbae96b0333f7d2ea6011a05b2a6b8e3`
> - `niks0501/caneguard-web` `main` @ `b4c803db9716a793578c32272ab27dde4f70c590`
>
> Before editing, fetch/pull the current target branch and re-inspect the named files. If either repository head has moved, preserve the intent of this plan but adapt to the new code instead of force-applying old line-level assumptions.


## Objective

Make CaneGuard Web behave as one coherent operational application: local review mutations should immediately refresh all dependent views, while reports arriving from mobile should appear automatically within the configured refresh interval.

This is P0 because stale client cache can make a correct backend look disconnected.

## User story

As MAO/SRA-side personnel, I want newly submitted and newly reviewed reports to appear consistently on the dashboard, submitted reports, validation queue, and map without reloading the whole browser page.

## Current verified code context

### Review mutation

`src/hooks/useReports.ts` currently invalidates:

- report detail;
- report lists;
- dashboard.

It does **not** invalidate the field-validation query family.

### Field-validation keys

`src/hooks/fieldValidationQueries.ts` defines:

```ts
fieldValidationKeys.all
fieldValidationKeys.map(filters)
fieldValidationKeys.queue(filters)
```

### Refresh configuration

`.env.example`:

```env
VITE_REPORT_REFRESH_MS=15000
```

`src/config/env.ts` parses it into:

```ts
env.reportRefreshMs
```

The value exists but is not currently the operational polling policy.

## Design decision

Use two mechanisms because they solve two different freshness problems:

**A. Same-browser mutation:** immediate React Query invalidation.

**B. External/mobile change:** lightweight polling with the already configured 15-second interval.

Do not introduce WebSockets for this P0. Fifteen-to-thirty-second freshness is appropriate for the current field-report workflow and much easier to test and defend.

## Target data-flow

```text
Web reviewer mutation
    -> mutation succeeds
    -> update known detail cache
    -> invalidate all report-dependent query families
    -> active views refetch immediately

Mobile submits report
    -> Laravel persists
    -> no browser mutation exists
    -> operational queries poll after VITE_REPORT_REFRESH_MS
    -> new data appears without page reload
```

## Implementation phases

### Phase 1 — Reproduce both stale behaviors

Before editing, prove:

1. Open map/queue.
2. Review a report from the web.
3. Confirm whether map/queue remains stale.

Then:

1. Keep a report/dashboard/map page open.
2. Submit a report from mobile or backend fixture.
3. Wait longer than `VITE_REPORT_REFRESH_MS`.
4. Confirm it does not currently appear automatically.

Record pre-fix behavior.

### Phase 2 — Centralize report-dependent invalidation

Avoid scattering a growing list of `invalidateQueries()` calls across mutations.

Create a small helper, suggested:

```text
src/hooks/reportInvalidation.ts
```

Example responsibility:

```ts
invalidateReportDependentQueries(queryClient, { reportId? })
```

It should invalidate the query families whose values can change when review state changes:

- report detail when relevant;
- report lists;
- dashboard;
- `fieldValidationKeys.all`.

Future monitoring/report summaries may be added later when those features exist; do not add imaginary keys today.

Keep `queryClient.setQueryData(reportKeys.detail(reportId), report)` for fast immediate detail UI if it already works, then invalidate to reconcile with the server.

### Phase 3 — Wire polling into operational queries

Use `env.reportRefreshMs` on API-backed operational queries.

Recommended policy:

```ts
refetchInterval: env.dataSource === 'api' ? env.reportRefreshMs : false,
refetchIntervalInBackground: false,
refetchOnWindowFocus: true,
```

Apply to data that can change because of external/mobile activity:

- dashboard;
- submitted report lists;
- field-validation map;
- field-validation queue.

Do not necessarily poll:

- static metadata;
- disease label dictionaries;
- local UI state;
- every report detail page unless there is a demonstrated need for collaborative reviewer freshness.

If a query options factory already exists, put the policy there rather than duplicating it at each page.

### Phase 4 — Preserve previous data during refresh

The page should not flash to a loading skeleton every 15 seconds.

Keep existing `placeholderData: keepPreviousData` where appropriate and use query `isFetching`/`isRefetching` only for subtle status.

Do not disable controls unnecessarily during background refresh if current data is usable.

### Phase 5 — Add unobtrusive freshness feedback

Where the current design can accommodate it, show a compact timestamp such as:

```text
Last updated 7:24 PM
```

Use React Query's `dataUpdatedAt` rather than creating another server field.

This is useful but secondary. Do not let timestamp UI block the P0 fix.

### Phase 6 — Avoid request storms

Operational polling at 15 seconds is acceptable, but:

- do not add independent `setInterval` loops outside React Query;
- do not poll mock data;
- do not enable background-tab polling;
- preserve deduplication through stable query keys;
- avoid invalidating the same query repeatedly in one mutation callback.

If many queries become active simultaneously, React Query still manages them independently; keep the scope limited to operational views.

## Likely files to modify

Existing:

- `src/hooks/useReports.ts`
- `src/hooks/reportQueries.ts`
- `src/hooks/fieldValidationQueries.ts`
- `src/hooks/useDashboard.ts` or its query-options file
- related tests:
  - `src/hooks/useReports.test.tsx`
  - field-validation query/page tests
  - dashboard query tests

Possible new:

- `src/hooks/reportInvalidation.ts`
- unit test for the invalidation helper

No backend change should be necessary.

## Testing strategy

### Invalidation tests

After a successful review mutation, assert invalidation/refetch eligibility for:

- detail;
- list;
- dashboard;
- field-validation root.

Do not merely assert that `invalidateQueries` was called four times. Prefer asserting the meaningful query keys or observing dependent query refetches where practical.

### Polling tests

Use fake timers or the query test utilities already used in the repo.

Prove:

- API data refetches after `env.reportRefreshMs`;
- background polling configuration is disabled as designed;
- mock mode does not poll if that is the chosen rule;
- current data remains visible while refetching;
- refetch failures keep cached data and expose a non-destructive warning where the UI already supports that pattern.

### Integration-level web test

Simulate repository data changing between first and second fetch. Advance the timer and verify that the UI renders the new report/count without remounting the page.

## Commands

Narrow during implementation:

```bash
npm test -- useReports
npm test -- FieldValidationMapPage
```

Use the actual Vitest selector syntax accepted by the repo.

Full:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run check:web
```

Backend is not expected to change, but before P0F run:

```bash
npm run check:api
```

## Manual verification

1. Open dashboard and map in the browser.
2. Submit one valid report from mobile.
3. Do not manually refresh.
4. Confirm the report/count appears within the configured interval plus normal network latency.
5. Review the report.
6. Return to map/queue.
7. Confirm review state updates promptly without hard reload.
8. Leave the map open through another polling cycle and confirm P0C viewport does not keep snapping back.

## Acceptance criteria

- [ ] Review success invalidates all current report-dependent query families.
- [ ] Field-validation map/queue no longer remain stale after review.
- [ ] `VITE_REPORT_REFRESH_MS` is actually used for API-backed operational polling.
- [ ] A mobile-submitted report appears on open web operational views without full page reload.
- [ ] Existing cached data remains visible during background refetch.
- [ ] Refetch failures do not erase previously loaded data.
- [ ] Polling does not continue in inactive/background tabs if the chosen React Query option disables it.
- [ ] No WebSocket or custom timer infrastructure is introduced.
- [ ] Web lint, typecheck, tests, and build pass.

## Suggested commit shape

```text
fix(query): invalidate field-validation data after review
feat(query): poll operational report data using configured interval
test(query): cover review invalidation and external refresh
```

## Senior execution rules

Treat this as a stabilization task, not a redesign. The agent should first prove the problem on the current branch, then make the smallest coherent production change that fixes the root cause, then add regression coverage. Do not silently change product scope, disease classes, report semantics, authentication roles, or database meaning.

Before editing:

1. Confirm the worktree is clean and note the current commit.
2. Read repository-local instructions such as `PROJECT_CONTEXT.md`, `AGENTS.md`, README development notes, and existing test conventions if present.
3. Run the narrow baseline tests for the affected area before changing code.
4. Inspect the production code and its existing tests together. Do not trust an existing mock if it contradicts the producer on the other repository.
5. Keep changes atomic. Do not mix unrelated UI polish or refactors into a P0 stabilization commit.
6. Prefer existing dependencies and patterns. Add a dependency only if the task cannot be solved safely with the current stack.
7. Never commit credentials, MapTiler keys, tokens, local IP addresses, `.env.local`, database dumps, or real participant/farmer data.
8. If implementation reveals that the verified finding no longer exists, stop and document the evidence instead of manufacturing a change.

At completion, provide a short handoff containing: files changed, behavior changed, tests run, test results, manual verification still required, and any residual risk.


## Definition of done

A successful review immediately reconciles all affected web views, and external report changes become visible automatically within the configured polling interval without hard-reloading the application.
