# Scan Record and Field Report contract v1

This is the cross-client record and ownership specification for CaneGuard. Mobile follows this contract; the API in this repository is the authority for synchronized Field Reports. The existing versioned wire artifacts remain authoritative for their exact payloads, validation, and compatibility rules: [upload v2](mobile-report-upload-v2.json), [report lifecycle v1](report-lifecycle-v1.json), and [mobile status v3](mobile-report-status-v3.md). This document does not change those endpoints or make local state a server review decision.

## Records and authority

| Record or stage | Owner and meaning |
| --- | --- |
| Scan Record | Mobile owns the local completed scan, its managed image and AI evidence. It is not a Field Report or an SRA diagnosis. A scan can exist without a report. |
| Field Report draft | Mobile and its authenticated field reporter own local authoring and incomplete data. A draft is local only and is not an office submission. A report references an existing completed scan; mobile stores at most one Field Report per scan. |
| Finalized, awaiting sync | Mobile owns the local submission and retry queue until the API accepts it. A local submission time or a pending upload is not proof of server receipt. |
| Synchronized Field Report | The backend persists the authoritative report and its server-derived identity, receipt time, district, and lifecycle. Mobile retains a local copy and may display server snapshots; it must not overwrite server review state with cached local values. |
| Review and follow-up | SRA reviewers own review decisions, classification, disposition and follow-ups, with administrator authority where existing policies permit. Assigned field reporters may provide field-validation evidence, not make the authority decision. The backend enforces permissions and persists those decisions and events. |

AI predictions and reporter observations are evidence only; they are not authority classifications. Office metadata corrections are reviewer actions, not a transfer of authority to the phone. Status feeds are scoped to the submitting reporter; see [status v2](mobile-report-status-v2.md) and [v3](mobile-report-status-v3.md).

## Identity and relationships

* Mobile creates a stable UUID for each local Scan Record and a separate stable UUID for each new Field Report. Local migration/legacy records can reuse the scan ID as the report ID; equality is not a basis for treating the records as the same object.
* On upload, the Field Report ID is `client_uuid`; the Scan Record ID is `scan_record_client_uuid` when supplied. The latter is optional at the v2 wire boundary and is linkage, not a server-created Scan Record. Local report-to-scan linkage is required.
* The server assigns its own report `uuid` and human-readable `reference_code`; mobile stores the returned remote ID and correlates status by `client_uuid` and server UUID. Neither the reference code nor a local image URI is a substitute for an ID.
* `(authenticated reporter, client_uuid)` is the retry identity. A retry returns the original report without replacing evidence or resetting review. After rejection, a corrected submission needs a new UUID; a retry cannot reopen the decision. Authentication, not a client-claimed identity or role, determines the server reporter and district.

## Required data at each boundary

A completed local Scan Record stores `id`, managed image URI, image source (`camera` or `gallery`), predicted label, confidence, checklist consistency, model version, preprocessing/inference/total timings, and creation/update timestamps. Confidence is in [0,1]; timings are nonnegative. Class scores, symptoms and quality warnings are related evidence collections; image dimensions, severity and barangay can be nullable in local storage. The image must remain available for submission.

A local draft requires its own `id`, linked `scanRecordId`, authoring and sync states, observation and creation/update timestamps, and submitter context. Draft fields such as farmer name, barangay and location may be incomplete. The inspected mobile implementation defaults province and municipality to Batangas and Nasugbu. Its finalization validation additionally requires a field-reporter identity, farmer/owner name, barangay, observation time, usable scan image, positive image dimensions, supported result and complete model scores, plus coordinates and provenance. It requires GPS accuracy for GPS and no GPS accuracy for manual map. These local checks must not be mistaken for the API's minimum wire requirements.

For a v2 upload, the required multipart fields are `client_uuid`, `image`, `image_source_type`, `predicted_label`, `confidence`, `class_scores`, `symptom_keys`, `checklist_consistency`, `barangay`, `model_version`, `preprocess_ms`, `inference_ms`, `total_ms`, and `captured_at`. Conditional requirements and all bounds, encodings and optional fields are specified by [upload v2](mobile-report-upload-v2.json). In particular, API v2 permits optional farmer name and dimensions; `gps` requires a coordinate pair and accuracy, `manual_map` requires a pair, and `unavailable` requires a reason and prohibits coordinates. The inspected mobile checkout is stricter and does not yet produce `unavailable`; API acceptance does not prove mobile can submit it. The server derives `submitted_at`, even if an older mobile producer sends a local timestamp.

## Permitted transitions

These are separate dimensions, not a single linear status. A transition does not imply a transition in another dimension unless explicitly stated. Same-state saves/retries are not new decisions.

### Mobile authoring and delivery

| From | To | Trigger / guard |
| --- | --- | --- |
| none | `draft` / `local_only` | Create against an existing completed scan. |
| `draft` | `finalized` | Reporter finalizes after local submission validation; atomically queue as `pending`. Finalized reports are not editable drafts. |
| `ready_for_submission` | — | Reserved in the local schema; the inspected finalization path accepts only `draft`. Do not infer upload or review from this state. |
| `pending` or `failed` | `syncing` | Finalized report, owned by the signed-in submitter, selected for upload. |
| `syncing` | `synced` | API success; save remote report ID and sync time. |
| `pending` or `syncing` | `failed` | Upload attempt fails; retain error for retry. |
| `failed` | `pending` | Retry queued; a failed item can also be attempted directly. |
| `syncing` | `pending` | Recover a stale interrupted attempt. |

`local_only`, `pending`, `syncing`, `synced`, and `failed` are delivery states, not SRA review states. A draft cannot be uploaded. A retry after a lost response uses the same `client_uuid` and does not duplicate or reset the server report.

### Server case handling

A newly accepted report begins `open`, `not_determined`, `unassigned`, `not_referred`, with legacy `review_status=submitted_unverified`. The following maps authority and allowed operations; request validation, district access and optimistic `expected_version` still apply.

| Dimension | Permitted transitions and authority |
| --- | --- |
| `case_state` | Reviewer/admin may set `open` ↔ `closed` as a disposition. Verification alone does not close a case. |
| `verification_outcome` | Reviewer/admin may set `not_determined`, `verified`, or `unable_to_verify`, including revising an outcome. Verified requires a staff classification; unable to verify requires notes. |
| `field_validation_state` | Reviewer/admin assigns an eligible reporter on an open case (`unassigned` → `assigned`); assignment workflow manages progress (`assigned` → `completed`, or via `in_progress`) and permits changes/removal only before completion. The assigned reporter completes evidence. Completion neither verifies nor closes; completed evidence cannot be reassigned or removed. |
| `referral_state` | Historical values are `not_referred`, `referred`, and `expert_response_received`. The in-system expert workflow is retired: the review endpoint rejects referral mutations; do not initiate a new transition through it. |

Assignment requires an eligible assignee and an open case; an assignment decision must remain `not_determined`. Follow-up actions and advisory selection are reviewer/admin actions subject to their own validation (for example, guidance must be validated). See [field-validation assignment](mobile-field-validation-assignment-v1.md) and [completion](mobile-field-validation-completion-v1.md) for the separate workflow.

`review_status` is a compatibility projection, not an independently mobile-editable state machine. Older consumers may see `submitted_unverified`, `for_field_validation`, `verified_by_staff`, `unable_to_verify`, or `resolved`. Use the independent dimensions and their guards for new behavior; do not infer a linear progression or treat field completion as verification. Historical projections are specified in [report lifecycle v1](report-lifecycle-v1.json).

## Evidence and compatibility

The local record details above were checked against mobile `src/database/schema.ts`, `fieldReportRepository.ts`, `fieldReportValidation.ts`, `fieldReportSyncRepository.ts`, and `reportMultipartMapper.ts` at mobile revision `fa3de6b`; API behavior is specified by the linked artifacts and the web API's report and review implementations. Mobile and API may evolve independently: the upload artifact defines the accepted wire domain, not a guarantee that every mobile version produces every accepted shape. Changes to IDs, ownership, state meaning, or required wire fields require the versioning review in the linked contracts.
