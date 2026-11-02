# Mobile report upload contract v3

`mobile-report-upload-v3` is `mobile-report-upload-v2` plus one optional field: `field_survey_client_uuid`, the link from a report to the walked-field measure the phone uploaded through [`POST /api/v1/mobile/field-surveys`](../../api/docs/mobile-field-surveys-v1.md).

The machine-readable source of truth is [`mobile-report-upload-v3.json`](mobile-report-upload-v3.json). Every other field, bound, encoding, location rule, image rule and authority rule is identical to [v2](mobile-report-upload-v2.md). The v2 endpoint, artifact and behaviour are unchanged.

## Endpoint

`POST /api/v3/mobile/reports`, `multipart/form-data`, Sanctum bearer token with the `report:submit` ability. Success is `201`; an idempotent retry is `200`.

## Added field

| Name | Wire | Type | Required | Nullable | Notes |
| --- | --- | --- | --- | --- | --- |
| `field_survey_client_uuid` | text part | UUID | no | yes | The `client_uuid` the phone used for the field survey. Omitted, or an empty text part, is stored as `null`. |

- The uuid is the link. The server does not require the survey to exist yet, so the survey and the report may be uploaded in either order, and it does not check the survey's owner at upload time.
- The link is stored with the report as client-owned immutable evidence. It does not create an office affected-field link and carries no loss rate.
- It does not change what counts as a confirmed location: `location_source`, coordinates and the unavailable-location rules are as in v2.
- An invalid (non-UUID) value is rejected with `422` on `field_survey_client_uuid`.

## Idempotency

Idempotency is keyed on the reporter and `client_uuid`, exactly as in v2. A retry returns the original report (`200`) and writes nothing, including a different or missing `field_survey_client_uuid`; the first accepted link stands. A corrected submission needs a new `client_uuid`.

## Response

The response is the v2 upload resource with one addition, `data.identity.field_survey_client_uuid` (UUID string or `null`).

## Example

Multipart parts (all v2 required parts as before):

```text
client_uuid=3f1c2a4e-8b7d-4e55-9a10-6c2d5b9e7f01
field_survey_client_uuid=90b2b84c-92c3-4cd6-b50f-cb0933e1a3aa
image=<leaf.jpg>
image_source_type=camera
predicted_label=smut
confidence=0.97
class_scores[healthy]=0.01
class_scores[mosaic]=0.01
class_scores[rust]=0.01
class_scores[smut]=0.97
symptom_keys[]=smut
checklist_consistency=consistent
barangay=Mabini
model_version=v1.0-mobilenetv2
preprocess_ms=12.5
inference_ms=95.75
total_ms=122.25
captured_at=2026-09-13T10:00:00.000Z
```

Response excerpt:

```json
{
  "data": {
    "identity": {
      "uuid": "0192f0f4-5d0e-7a3c-8c2e-1d1d4e2f6a10",
      "reference_code": "CG-20260913-6C2D5B9E",
      "client_uuid": "3f1c2a4e-8b7d-4e55-9a10-6c2d5b9e7f01",
      "scan_record_client_uuid": null,
      "field_survey_client_uuid": "90b2b84c-92c3-4cd6-b50f-cb0933e1a3aa"
    }
  }
}
```

## Versioning

Future v3 widenings follow the rules in the artifact's `versioning` object. The mobile producer gate (`ci/mobile-report-upload-gate.json`) still pins v2 until the mobile lane publishes a v3 producer.
