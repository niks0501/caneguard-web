# Mobile report upload contract v2

This document explains the canonical `mobile-report-upload-v2` multipart contract.

The machine-readable source of truth is [`mobile-report-upload-v2.json`](mobile-report-upload-v2.json).

The contract is owned by the Laravel API in this repository and is consumed by the CaneGuard mobile producer.

## Endpoint and authority

The contract applies to `POST /api/v2/mobile/reports` with `multipart/form-data`.

The request must use a Sanctum bearer token with the `report:submit` ability.

Laravel remains the authority for authentication, the field-reporter role, the `Report::create` policy, persistence, and review state.

Unknown multipart fields are ignored for backward compatibility and cannot set server-owned identity, reviewer, authority-classification, review-status, or submission-timestamp fields.

The accepted declared fields, their requiredness, wire encodings, types, bounds, conditions, and enums are defined only in the JSON artifact.

Arrays use Laravel bracket encoding, with `class_scores[healthy]`, `class_scores[mosaic]`, `class_scores[rust]`, and `class_scores[smut]` for the score object, and repeated `symptom_keys[]` or `quality_warnings[]` parts for arrays.

The `quality_warnings` array is optional and defaults to an empty array when omitted.

Nullable text fields accept an empty multipart text part as `null` where the JSON artifact declares that normalization.

The boolean `mismatch_reported` field accepts the JSON-declared boolean, numeric, and string representations.

`reporter_suspected_condition` remains a bounded free-text reporter-observation field. Mobile's RSSI quick choice sends the stable value `RSSI` here; it is preserved as field evidence and is not a Model V1 label or class score. The model contract remains exactly `healthy`, `mosaic`, `rust`, and `smut`.

`captured_at` and `observed_at` use ISO-8601 date-time values with an explicit timezone, and date-only values are outside v2.

## Image boundary

The required `image` part accepts JPEG with either the `.jpg` or `.jpeg` extension, PNG, and WebP.

The API hard maximum is exactly 10 MiB, or `10,485,760` bytes.

The PHP transport must allow at least that image size plus multipart overhead before Laravel validation runs.

The repository's local API command uses a 12 MiB `upload_max_filesize` and a 16 MiB `post_max_size` for this reason.

The API stores the uploaded image MIME type and byte size as server-derived metadata.

`source_width` and `source_height` are client-declared image metadata and remain separately bounded fields.

The API does not accept HEIC, HEIF, AVIF, or GIF as v2 image formats.

## Image roles and legacy compatibility

CaneGuard keeps three image roles distinct throughout the mobile report lifecycle.

- The source scan image is the original camera or gallery asset captured or selected on the device.
- The inference image is the normalized image representation passed to the on-device model.
- The submission image is the upload derivative placed in the multipart `image` part sent to this API.

The API receives only the submission image as `image`; the source scan image and inference image are not additional v2 multipart fields.

Generated mobile submission derivatives target 9 MiB or less, or `9,437,184` bytes, so the producer stays below the API hard maximum while leaving room for multipart transport overhead.

New submissions using unsupported image formats are rejected at the v2 boundary.
The API does not silently convert HEIC, HEIF, AVIF, or GIF uploads.

A legacy local record whose source image uses an unsupported format may be repaired by the mobile producer before submission by generating a JPEG submission derivative.
This repair changes only the transmitted derivative; it does not rewrite the source scan image, change the inference image, or change the report's disease or review semantics.

The mobile producer's accepted submission domain must remain a subset of the artifact domain, and the artifact domain must remain inside the Laravel request domain:

```text
mobile producer domain ⊆ mobile-report-upload-v2 ⊆ Laravel accepted domain
```

The fast trusted contract gate checks this relationship at the artifact, producer, and Laravel consumer boundaries.
It supplements rather than replaces P0F, whose separate role is to prove the complete Mobile -> API -> Web -> API -> Mobile system flow.

## Validation boundary

The Laravel request compiles its validation rules from the JSON artifact through `App\Contracts\MobileReportUploadV2Contract`.

This keeps field names, defaults, normalization, types, ranges, arrays, enums, conditional location rules, image formats, and the image maximum at the same seam as the HTTP boundary.

`api/tests/Feature/MobileReportUploadV2ContractTest.php` reads the artifact and sends HTTP requests at declared boundaries and immediately outside them.

The existing mobile upload feature tests continue to cover idempotency, review preservation, authentication authority, transactional persistence, and cleanup behavior.

## Versioning rules

The v2 contract is intentionally breaking relative to v1: the class-score object is exactly four classes and the accepted model version is the bundled Model V1 version. It preserves the existing field names, wire encodings, persistence fields, and review semantics wherever the new evidence shape permits.

Future v2 widenings may add an optional field while preserving the undeclared-field policy, accept an additional enum value without changing existing meanings, increase a text or numeric maximum, lower a numeric minimum, or add an image format.

Increasing the image maximum is a compatible widening only when existing consumers remain safe with the wider value.

A new major contract version is required for a removed or renamed field, a changed multipart encoding or type, a newly required field, a newly invalid existing value, a tighter text or numeric boundary, a narrower UUID or array domain, or a removed image format.

A new major version is also required for changes to enum meaning, disease classes, conditional location requirements, null and empty-value semantics, server-derived metadata, or persistence semantics.

The v2 artifact's `versioning` object is the machine-readable record of these compatibility rules.

This contract does not change report-review semantics, authentication authority, persistence behavior, map behavior, or synchronization behavior. It is the mobile transport contract for the four Model V1 classes: `healthy`, `mosaic`, `rust`, and `smut`.
