# Report aerial analysis v1

Experimental, office-only supporting evidence on a case. An office user adds one
aerial photo; the server segments it with the Aerial V3 SegFormer-B1 model
(ONNX Runtime, one synchronous call) and stores canopy shares plus a class mask.

## Gate

The check is live only when two conditions hold. `CANEGUARD_AERIAL_ANALYSIS_ENABLED`
(`caneguard.aerial.enabled`, the install gate) defaults to `false` and must be
`true`. An Admin must also switch the check on in Admin Settings, which is stored
in `feature_switches` and defaults to off. While either condition is unmet every
route below returns `404`, `GET /api/v1/reports/{report}` carries no
`aerial_analyses` key, and `GET /api/v1/mobile/assignments` carries no
`aerial_check` key. Aerial metrics are never on report list, map, export, PDF,
or farmer payloads. For production staging and enablement, follow the
[aerial deployment runbook](../../docs/production-deployment.md#aerial-analysis-needs-python-and-the-model-staged-first).

An active verified Admin reads and writes the switch through
`GET` and `PUT /api/v1/admin/aerial-analysis`, the only aerial routes that stay
reachable while the check is off. Both answer
`{"data":{"installed":bool,"enabled":bool,"model_version":string,"retention_days":int,"counts":{"active":int,"removed":int},"readiness":{"model_configured":bool,"storage_writable":bool,"timeout_seconds":int}}}`.
`PUT` takes `{"enabled":bool}` and returns the same shape; it answers `409`
while the install gate is off, so the switch can only be changed on a server
that is already installed.

## Case-page use

When the check is off, the Aerial tab is hidden from Case Review. When the
check is live, the Aerial tab opens the workbench directly (supporting file
browse and drag-and-drop). The reviewer can switch between all uploaded aerial
checks, inspect the overlay with an on-canvas split handle (disabled in Photo
only mode), and compare Ground vs. Photo figures kept strictly separate.
Uploads, removals, and restores are refused with `423` while another reviewer
holds an active review claim on the case; viewing existing images and masks
stays allowed. Upload and removal events appear in `case_history` while the
check is live. Soft-removed rows and their private files are retained for
`CANEGUARD_AERIAL_REMOVED_RETENTION_DAYS` (default `30` days) and pruned daily
by `caneguard:prune-removed-aerial-analyses`.

## Authorization

All routes sit in the `office.access` group and run `review` on the report.
Field reporters and mobile tokens get `403`.

## Routes

| Route | Result |
| --- | --- |
| `POST /api/v1/reports/{report}/aerial-analyses` | `201` with the analysis. Multipart field `image`: jpg, jpeg, png or webp, at most 20 MiB and 10,000 px per side. Throttled to 6 per minute. |
| `GET /api/v1/reports/{report}/aerial-analyses/{analysis}/image` | The stored photo, `Cache-Control: private, no-cache`, `nosniff`. |
| `GET /api/v1/reports/{report}/aerial-analyses/{analysis}/mask` | 8-bit PNG class mask, same orientation as the displayed photo. |
| `DELETE /api/v1/reports/{report}/aerial-analyses/{analysis}` | `200` with `{"data":{"removal_id":"…"}}`. Soft removal: the row is hidden, the files are kept and a new removal identity is minted. |
| `POST /api/v1/reports/{report}/aerial-analyses/{analysis}/restore` | `200` with the analysis. Body `{"removal_id":"<uuid>"}` must name the current removal; undoing an already undone removal is returned unchanged. |

### Mobile Field Validation brief routes

When the aerial switch is enabled and an assigned case has an active aerial check,
`GET /api/v1/mobile/assignments` includes an optional `aerial_check` summary with
bounded JPEG derivatives (max 1600 px long side, well under the 10 MiB mobile
offline media cap) and includes it in `sync.version`. The two routes below live in
the `mobile.token` + `inspector.access` group (`abilities:assignment:read`) and
enforce assignee ownership and district access (`403` for non-assignees, reviewers,
farmers, or cross-district callers; `404` when the switch is off or no active check
exists):

| Route | Result |
| --- | --- |
| `GET /api/v1/mobile/assignments/{assignment}/aerial-preview` | Bounded JPEG aerial photo (≤ 1600 px), `Cache-Control: private, no-cache`, `nosniff`. |
| `GET /api/v1/mobile/assignments/{assignment}/aerial-overlay` | Bounded JPEG aerial photo with class-2 problem areas tinted (`#ae8a1b`), `Cache-Control: private, no-cache`, `nosniff`. |
| `POST /api/v1/mobile/assignments/{assignment}/aerial-analyses` | `201` with `data.analysis` (`uuid`, `client_uuid`, `assignment_uuid`) and `data.aerial_check` brief. Multipart fields: `client_uuid` (UUID) + `image` (jpg/jpeg/png/webp ≤ 20 MiB, ≤ 10,000 px). Protected by `intake.replay:aerial` (safe idempotent resend on dropped reply), `abilities:assignment:complete`, assignee/district ownership (`403`), open case (`409 CASE_CLOSED`), `409 AERIAL_DISABLED` when switched off, and `429 AERIAL_BUSY` (`Retry-After: 10`) / throttle (`6/min`). |

Errors: `404` the check off (including when it is switched off while an upload
is running, which saves nothing), unknown analysis, or a removed analysis on any
route but restore; `409` the well-formed restore identity no longer names the
analysis's current removal; `422` a missing or malformed removal identity, or a
bad file; `423` another reviewer holds the case review claim; `429` another
check is running (`code: "AERIAL_BUSY"`, `Retry-After: 10`) or the upload rate
limit was reached; `503` the check could not run. On failure the server attempts
to delete the image and mask; cleanup failures are logged and can leave orphaned
files.

## Analysis object

```json
{
  "uuid": "…",
  "image_url": "/api/v1/reports/…/aerial-analyses/…/image",
  "mask_url": "/api/v1/reports/…/aerial-analyses/…/mask",
  "image_width": 4000, "image_height": 3000,
  "mask_width": 2048, "mask_height": 1536,
  "enough_canopy": true,
  "normal_canopy_percent": 82.0,
  "abnormal_canopy_percent": 18.0,
  "canopy_coverage_percent": 71.0,
  "model_version": "aerial-v3",
  "uploaded_by": { "uuid": "…", "name": "…" },
  "created_at": "2026-11-11T04:11:03.000000Z"
}
```

Mask values: `0` background, `1` normal_looking_canopy,
`2` visibly_abnormal_canopy. The photo's EXIF orientation is applied before
segmentation, so the mask aligns with how browsers display the photo.

`normal_canopy_percent` and `abnormal_canopy_percent` are shares of the
**visible canopy** in the photo and add to 100. `canopy_coverage_percent` is the
share of the photo that is canopy. When coverage is below
`caneguard.aerial.min_canopy_coverage_percent` (10) the two shares are `null`
and `enough_canopy` is `false`. The stored row also keeps the model version and
the SHA-256 of the staged `model.onnx`; the process fails unless it matches
`CANEGUARD_AERIAL_WEIGHTS_SHA256`, or the value in
`aerial-inference/model.onnx.sha256` when that setting is blank.

## Never combined

An aerial share is a percent of a photo, not of a field or boundary. The photo's
ground footprint is unknown. It is therefore never multiplied by, divided by, or
written into the GPS boundary area, damage area, `loss_rate_percent`,
`affected_portion_percent`, severity, verification outcome, reports, exports,
PDFs, the dashboard, the map or notifications. No combined or hectare figure is
stored or returned.

## Accuracy

The abnormal region is a coarse indicator. Validation IoU values are recorded in
`aerial-inference/model-assets/v3/caneguard_v3_metadata.json`. The model uses
argmax over its three trained classes with no calibrated threshold. For image
preprocessing and model limitations, see `aerial-inference/model-assets/v3/README.md`.
