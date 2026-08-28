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
