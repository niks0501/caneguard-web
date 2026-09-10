# Web map and queue regression evidence

This document records the executable Web/API evidence for the resolved field-validation map behavior.

It covers data-aware map framing and map/queue independence without reopening the production map implementation.

## Behaviors covered

### Map framing

`ValidationMap` frames one located report with a local center and frames multiple located reports with `fitBounds`.

The regression test asserts that the bounds include every available report coordinate, use padding, and enforce the existing maximum zoom.

Background data refreshes do not reframe the user's map, while a changed filter context may frame the new result set.

The API map response uses GeoJSON point coordinates in `[longitude, latitude]` order and reports `total_count`, `located_count`, and `unlocated_count` separately. Located features are bounded by the requested `limit` (default `1000`, maximum `1000`); the response also returns `limit`, `returned_count`, and `truncated`. When `truncated` is true, clients must narrow filters or request a different bounded slice rather than assuming all located reports were returned.

### Queue refresh independence

`FieldValidationMapPage` owns separate map and queue queries.

When a queue refresh fails after cached queue data exists, the page keeps the loaded map, located-observation table, and queue visible and shows the existing refresh warning.

A queue request that fails before any queue data exists still leaves usable map data visible with an area-specific retry state.

The regression test is named `keeps cached map data and the queue usable when the queue refresh fails`.

### API map and queue contract

`api/tests/Feature/ReportMapAndQueueTest.php` verifies the authenticated map and queue endpoints together.

The API coverage includes GeoJSON coordinates, located and unlocated metadata, observed-date filtering, queue ordering, shared filters, authorization, and validation boundaries.

## Run the evidence

From the repository root, run the focused Web regression tests:

```bash
npm test -- --run src/components/fieldValidation/ValidationMap.test.tsx src/pages/FieldValidationMapPage.test.tsx
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
npm run contract:config
npm run contract:test
npm run contract:consumer
```

The complete producer gate additionally requires the exact mobile checkout described in [the upload contract gate](mobile-report-upload-contract-gate.md).

The mobile producer's executable multi-batch synchronization evidence, including the existing 50-report automatic-run safety maximum, belongs to the companion mobile pull request.

These Web/API checks do not change the 50-report safety maximum, disease classes, inference behavior, report-review semantics, or cloud-storage scope.

P0F remains the separate full-system Mobile -> API -> Web -> API -> Mobile acceptance gate.
