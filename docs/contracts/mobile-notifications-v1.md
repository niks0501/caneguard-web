# Mobile notification feed contract

The `mobile-notifications-v1` contract is the owner-scoped REST feed for durable attention items on Mobile.

The API returns the authenticated field reporter's notifications only.
The `sync.before` checkpoint and cursor links describe one complete snapshot boundary.
The client replaces its local snapshot only after every page validates successfully.

Mobile does not connect to Reverb or any WebSocket service.
Refresh is lifecycle-driven by the Mobile application and failed refreshes leave the last successful local snapshot visible.

Follow-up due items are derived when a notification feed is read.
The derivation requires a target visit date, a date before the API's current date, and incomplete field validation.
No service-level deadline is invented for assignments without a target date.

## Read-state actions

The feed is retrieval-oriented, so Mobile acknowledges items through two owner-scoped mutations on the same contract generation:

| Method | Path | Result |
|---|---|---|
| `PATCH` | `/api/v1/mobile/notifications/{notification}/read` | `{ data: <notification>, meta: { unread_count } }` |
| `POST` | `/api/v1/mobile/notifications/read-all` | `{ data: [], meta: { marked_count, unread_count } }` |

Both require the field-reporter role, the `mobile.token` middleware, and the `notification:read` ability.
Each item is loaded through the authenticated user's notifications relation, so another account's notification can never be read or acknowledged, and a cross-owner identifier answers `404`.
Marking an already-read item is idempotent and preserves the first `read_at` timestamp.
Acknowledging a notification never blocks opening its destination on Mobile: a failed mutation leaves the item unread and surfaces a recoverable message.
