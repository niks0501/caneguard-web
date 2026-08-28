# Report lifecycle dimensions v1

The API stores the expanded case lifecycle beside the legacy `review_status` field.

The dimensions are independent and use these values:

| Field | Values | Meaning |
| --- | --- | --- |
| `case_state` | `open`, `closed` | Whether office handling is still active. |
| `verification_outcome` | `not_determined`, `verified`, `unable_to_verify` | The current authority verification outcome. |
| `field_validation_state` | `unassigned`, `assigned`, `in_progress`, `completed` | Progress of field-validation assignment work. |
| `referral_state` | `not_referred`, `referred`, `expert_response_received` | Progress of an expert referral handoff. |

`verified` does not imply `closed`.

Field-validation completion does not imply verification or closure.

Referral state is an operational handoff state and is not a verification outcome.

## Legacy compatibility mapping

The migration preserves `review_status` and maps existing values as follows:

| Legacy `review_status` | `case_state` | `verification_outcome` | `field_validation_state` | `referral_state` |
| --- | --- | --- | --- | --- |
| `submitted_unverified` | `open` | `not_determined` | `unassigned` | `not_referred` |
| `for_field_validation` | `open` | `not_determined` | `unassigned` | `not_referred` |
| `verified_by_staff` | `closed` | `verified` | `unassigned` | `not_referred` |
| `unable_to_verify` | `closed` | `unable_to_verify` | `unassigned` | `not_referred` |
| `resolved` | `closed` | `not_determined` | `unassigned` | `not_referred` |

A legacy `for_field_validation` row has no fabricated assignee or assignment progress.

A legacy `resolved` row is closed without inventing a verification outcome that the old record did not store.

Unexpected legacy status values are conservatively mapped to a closed case during migration.

## API representation

Reviewer-facing report resources expose the dimensions in a `lifecycle` object.

The existing Mobile authority-status endpoint remains unchanged and continues to return the exact five-value `review_status` snapshot.

The lifecycle migration does not modify report identity, submitted evidence, image references, AI evidence, timestamps, or authority-review evidence.

## Explicit office review v1

`PATCH /api/v1/reports/{report}/review` accepts independent review fields.

The supported lifecycle fields are `case_state` and `verification_outcome`.

The supported office action field is `action_taken`.

`action_taken` is nullable until an office user explicitly records one of these values:

- `advisory_provided`
- `technical_assistance_provided`
- `referred_for_expert_validation`
- `no_further_action_required`

The request may update one or more of these fields without changing omitted fields.

`case_state` must be set explicitly to `closed`; a `verified` outcome does not close a case.

Reviewer and admin authorization is enforced by the API for all office review and correction writes.

The legacy `status` request field remains accepted for older clients.

When independent fields are used, `review.status` is a safe compatibility projection.

Open cases project to `submitted_unverified` or `for_field_validation` when field-validation progress is already present.

Closed cases project to `verified_by_staff`, `unable_to_verify`, or `resolved` according to their verification outcome.

## Evidence integrity and operational corrections

Synchronized AI, image, timestamp, reporter identity, model, and submitted observation evidence cannot be updated or deleted through the report models.

Operational metadata corrections use `metadata_corrections` and a required `correction_reason` in the review request.

The correctable operational fields are location and triage metadata such as barangay, farmer or farm owner, province, municipality, affected area, affected portion, and GPS metadata.

Each correction is stored in `report_audits` with the field, original value, corrected value, actor, server timestamp, and reason.

Reviewer-facing detail resources expose these records under `audit.metadata_corrections`.
