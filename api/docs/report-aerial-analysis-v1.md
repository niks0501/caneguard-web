# Report aerial analysis v1

Experimental, office-only supporting evidence on a case. An office user adds one
aerial photo; the server segments it with the Aerial V3 SegFormer-B1 model
(ONNX Runtime, one synchronous call) and stores canopy shares plus a class mask.

## Gate

`CANEGUARD_AERIAL_ANALYSIS_ENABLED` (`caneguard.aerial.enabled`) defaults to
`false`. While it is off every route below returns `404` and
`GET /api/v1/reports/{report}` carries no `aerial_analyses` key. The key is
never on list, map, mobile, export or PDF payloads. Enabling it is an operator
step: stage `model.onnx`, create the Python environment and set
`CANEGUARD_AERIAL_PYTHON` and `CANEGUARD_AERIAL_MODEL_PATH`.

## Authorization

All routes sit in the `office.access` group and run `review` on the report.
Field reporters and mobile tokens get `403`.

## Routes

| Route | Result |
| --- | --- |
| `POST /api/v1/reports/{report}/aerial-analyses` | `201` with the analysis. Multipart field `image`: jpg, jpeg, png or webp, at most 20 MiB and 10,000 px per side. Throttled to 6 per minute. |
| `GET /api/v1/reports/{report}/aerial-analyses/{analysis}/image` | The stored photo, private cache, `nosniff`. |
| `GET /api/v1/reports/{report}/aerial-analyses/{analysis}/mask` | 8-bit PNG class mask, same orientation as the displayed photo. |
| `DELETE /api/v1/reports/{report}/aerial-analyses/{analysis}` | `204`. Soft removal: the row is hidden and the files are kept. |

Errors: `404` flag off, unknown or removed analysis; `422` bad file; `429`
another check is running (single-run lock); `503` the check could not run. A
`503` stores nothing and deletes both files.

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
the SHA-256 of the staged `model.onnx`; the process fails unless it matches the
pinned value in `aerial-inference/model.onnx.sha256`.

## Never combined

An aerial share is a percent of a photo, not of a field or boundary. The photo's
ground footprint is unknown. It is therefore never multiplied by, divided by, or
written into the GPS boundary area, damage area, `loss_rate_percent`,
`affected_portion_percent`, severity, verification outcome, reports, exports,
PDFs, the dashboard, the map or notifications. No combined or hectare figure is
stored or returned.

## Accuracy

Validation IoU of the trained checkpoint: normal canopy 0.918, visibly abnormal
canopy 0.499. The abnormal region is a coarse indicator. The model uses argmax
over its three trained classes with no calibrated threshold. Whole photos are
resized to 512x512; there is no tiling. See
`aerial-inference/model-assets/v3/README.md`.
