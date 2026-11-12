# Mobile field-validation completion contract v1

The machine-readable source of truth is [`mobile-field-validation-completion-v1.json`](mobile-field-validation-completion-v1.json).

The contract applies to `POST /api/v1/mobile/assignments/{assignment}/completion`.

The endpoint requires an authenticated `field_reporter` bearer token with the `assignment:complete` ability. Laravel re-checks the current `assignment:complete` capability from active field-reporter membership before writing; the minted token ability alone is not current authority. A surviving session whose membership or capability is revoked receives HTTP 403 with `CAPABILITY_REVOKED`, without bearer-token deletion.

The authenticated reporter must own the assignment. If the visit was reassigned, the old assignee receives HTTP 403 with `ASSIGNMENT_REASSIGNED`; a reassignment race under the write lock returns HTTP 409 with the same code.

Other refusals carry their own `code`: `CASE_CLOSED` (409, case no longer open), `COMPLETED_ELSEWHERE` (409, the case is already marked completed), with `CONFLICT` kept for a different completion on the same assignment and `VISIT_REMOVED` (404, the office removed the visit). See `report-lifecycle-v1`.

The request requires fresh field observation, field finding evidence, action taken, visit time, and a recorded GPS attempt. Newer Mobile builds may also send the optional `follow_up_outcome` value: `improved`, `unchanged`, `worsened`, or `unable_to_determine`.

GPS coordinates are optional because insufficient GPS must not block a valid completion.

A fresh field photo is optional, but the Mobile workflow strongly encourages capturing one.

The API marks the assignment `completed` only after it has stored the completion evidence.

Completion leaves the case open and preserves its existing verification outcome.

The completion client UUID makes retries idempotent for the assigned case.
