# Mobile field-validation completion contract v1

The machine-readable source of truth is [`mobile-field-validation-completion-v1.json`](mobile-field-validation-completion-v1.json).

The contract applies to `POST /api/v1/mobile/assignments/{assignment}/completion`.

The endpoint requires an authenticated `field_reporter` bearer token with the `assignment:complete` ability.

The authenticated reporter must own the assignment.

The request requires fresh field observation, field finding evidence, action taken, visit time, and a recorded GPS attempt.

GPS coordinates are optional because insufficient GPS must not block a valid completion.

A fresh field photo is optional, but the Mobile workflow strongly encourages capturing one.

The API marks the assignment `completed` only after it has stored the completion evidence.

Completion leaves the case open and preserves its existing verification outcome.

The completion client UUID makes retries idempotent for the assigned case.
