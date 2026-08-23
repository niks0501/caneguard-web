# Mobile report upload contract v1

This document explains the canonical `mobile-report-upload-v1` multipart contract.

The machine-readable source of truth is [`mobile-report-upload-v1.json`](mobile-report-upload-v1.json).

The contract is owned by the Laravel API in this repository and is consumed by the CaneGuard mobile producer.

## Endpoint and authority

The contract applies to `POST /api/v1/mobile/reports` with `multipart/form-data`.

The request must use a Sanctum bearer token with the `report:submit` ability.

Laravel remains the authority for authentication, the field-reporter role, the `Report::create` policy, persistence, and review state.

Unknown multipart fields are ignored for backward compatibility and cannot set server-owned identity, reviewer, authority-classification, review-status, or submission-timestamp fields.

The accepted declared fields, their requiredness, wire encodings, types, bounds, conditions, and enums are defined only in the JSON artifact.

Arrays use Laravel bracket encoding, with `class_scores[healthy]`, `class_scores[mosaic]`, and `class_scores[rust]` for the score object, and repeated `symptom_keys[]` or `quality_warnings[]` parts for arrays.

The `quality_warnings` array is optional and defaults to an empty array when omitted.

Nullable text fields accept an empty multipart text part as `null` where the JSON artifact declares that normalization.

The boolean `mismatch_reported` field accepts the JSON-declared boolean, numeric, and string representations.

`captured_at` and `observed_at` use ISO-8601 date-time values with an explicit timezone, and date-only values are outside v1.

## Image boundary

The required `image` part accepts JPEG with either the `.jpg` or `.jpeg` extension, PNG, and WebP.

The API hard maximum is exactly 10 MiB, or `10,485,760` bytes.

The PHP transport must allow at least that image size plus multipart overhead before Laravel validation runs.

The repository's local API command uses a 12 MiB `upload_max_filesize` and a 16 MiB `post_max_size` for this reason.

The API stores the uploaded image MIME type and byte size as server-derived metadata.

`source_width` and `source_height` are client-declared image metadata and remain separately bounded fields.

The API does not accept HEIC, HEIF, AVIF, or GIF as v1 image formats.

## Validation boundary

The Laravel request compiles its validation rules from the JSON artifact through `App\Contracts\MobileReportUploadContract`.

This keeps field names, defaults, normalization, types, ranges, arrays, enums, conditional location rules, image formats, and the image maximum at the same seam as the HTTP boundary.

`api/tests/Feature/MobileReportUploadContractTest.php` reads the artifact and sends HTTP requests at declared boundaries and immediately outside them.

The existing mobile upload feature tests continue to cover idempotency, review preservation, authentication authority, transactional persistence, and cleanup behavior.

## Versioning rules

A backward-compatible widening remains in v1 when it preserves every existing field name, wire encoding, accepted meaning, persistence meaning, and previously valid payload.

Examples of v1 widening include adding an optional field while preserving the undeclared-field policy, accepting an additional enum value without changing existing meanings, increasing a text or numeric maximum, lowering a numeric minimum, or adding an image format.

Increasing the image maximum is a v1 widening only when existing v1 consumers remain safe with the wider value.

A new major contract version is required for a removed or renamed field, a changed multipart encoding or type, a newly required field, a newly invalid existing value, a tighter text or numeric boundary, a narrower UUID or array domain, or a removed image format.

A new major version is also required for changes to enum meaning, disease classes, conditional location requirements, null and empty-value semantics, server-derived metadata, or persistence semantics.

The v1 artifact's `versioning` object is the machine-readable record of these compatibility rules.

This contract does not change report-review semantics, disease classes, authentication authority, persistence behavior, map behavior, or synchronization behavior.
