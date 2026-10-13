# Web map and queue regression evidence

This document records the executable Web/API evidence for the resolved field-validation map behavior.

It covers the development basemap fallback, data-aware framing, server-owned location groups, every-report popups, and map/queue refresh independence.

## Behaviors covered

### Development basemap fallback

Without a MapTiler key, development uses a provider-free style so map layers remain interactive; non-development builds keep the explicit unavailable state. The style references no hosted resources, and genuine basemap load failures still show `Map unavailable`.

`localBasemap.test.ts` and `ValidationMap.test.tsx` cover the fallback selection, no-key production behavior, and provider-error state.

### Map framing

`ValidationMap` frames one located report with a local center and frames multiple located reports with `fitBounds`.

The regression test asserts that the bounds include every available report coordinate, use padding, and enforce the existing maximum zoom.

Background data refreshes do not reframe the user's map, while a changed filter context may frame the new result set.

The API map response uses GeoJSON point coordinates in `[longitude, latitude]` order and reports `total_count`, `located_count`, and `unlocated_count` separately. Located features are bounded by the requested `limit` (default `1000`, maximum `1000`); the response also returns `limit`, `returned_count`, and `truncated`. When `truncated` is true, clients must narrow filters or request a different bounded slice rather than assuming all located reports were returned.

### Server-owned same-location groups

The server computes transitive proximity groups inside the **already authorized, filtered, bounded returned slice**. `caneguard.map.location_group_radius_meters` defaults to 25 and is tunable via `CANEGUARD_MAP_LOCATION_GROUP_RADIUS_METERS`. Earth-centered metre buckets compare only adjacent buckets, avoiding projection distortion at poles and the date line; final distances use spherical surface metres. Union roots and marker anchors use the lowest visible report ID.

Each feature retains its own evidence geometry and carries `location_group_key`, `location_group_size`, and `location_group_coordinates` (the anchor's real coordinate). Keys and counts never include hidden, filtered-out, or truncated members. Grouping is response-local, not a durable case linkage or duplicate merge; membership can change with filters and newly received reports.

The validation source plots each report at its **server-provided** group anchor and clusters through the map's maximum zoom (22, source maximum 24). MapLibre's Promise-based expansion API zooms separable clusters; an inseparable/max-zoom cluster expands radially in deterministic group-key/UUID order, with display offsets only. Popups list every returned member with an individual report link, review state, and Manila observed time. Lists scroll instead of silently dropping members. Truncated responses explicitly say “Within the returned map slice.”

The dashboard GPS layer consumes the same groups as counted markers and lists every member. The located-observations table preserves original coordinates and individual keyboard-accessible links, with the server group count. Refetches cannot retain now-inaccessible popup members.

Tests: `GroupReportLocationsTest` covers transitive grouping, order, 25 m boundaries, configurable radius, bucket boundaries, poles and date line. `ReportMapAndQueueTest` covers visibility/filter/slice isolation, unchanged evidence geometry, and separate queue rows. Component tests cover high-zoom deterministic expansion, all links, truncation wording, dashboard counted groups, and refetch removal.

### Queue refresh independence

`FieldValidationMapPage` owns separate map and queue queries. `NewCaseSubmitted` includes the `field-validation` domain, invalidating both immediately; a replay emits no submission event. Payload/API and query-invalidation tests cover that boundary.

When a queue refresh fails after cached queue data exists, the page keeps the loaded map, located-observation table, and queue visible and shows the existing refresh warning.

A queue request that fails before any queue data exists still leaves usable map data visible with an area-specific retry state.

The regression test is named `keeps cached map data and the queue usable when the queue refresh fails`.

### API map and queue contract

`api/tests/Feature/ReportMapAndQueueTest.php` verifies the authenticated map and queue endpoints together.

The API coverage includes GeoJSON coordinates, located and unlocated metadata, observed-date filtering, queue ordering, shared filters, authorization, and validation boundaries.

## Run the evidence

From the repository root, run the focused Web regression tests:

```bash
npm test -- --run src/components/fieldValidation/localBasemap.test.ts src/components/fieldValidation/ValidationMap.test.tsx src/pages/FieldValidationMapPage.test.tsx
```

Run the focused API map and queue contract tests:

```bash
cd api
php artisan test --filter=ReportMapAndQueueTest
cd ..
```

Run the Web/API upload-contract checks that protect the mobile submission boundary:

```bash
npm run contract:artifact
npm run contract:v2:artifact
npm run contract:config
npm run contract:test
npm run contract:consumer
```

The complete producer gate additionally requires the exact mobile checkout described in [the upload contract gate](mobile-report-upload-contract-gate.md).

The mobile producer's executable multi-batch synchronization evidence, including the existing 50-report automatic-run safety maximum, belongs to the companion mobile pull request.

These Web/API checks do not change the 50-report safety maximum, disease classes, inference behavior, report-review semantics, or cloud-storage scope.

P0F remains the separate full-system Mobile -> API -> Web -> API -> Mobile acceptance gate.
