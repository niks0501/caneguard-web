## Agent Safety and State Markers

- State vocabulary and transition tables live in `docs/development/state-machines.md`; read the row before changing or automating a flow.
- Read state from `data-state` / `data-error-kind` (closed vocabulary in `src/components/ui/States.tsx`), never from copy. Add new states there, not as free text.
- Never auto-confirm: Confirm Review when it closes a case, weekly Approve and Send, duplicate link, metadata correction. The confirm modal is the human gate.
- Safe retries only: idempotent reads, `POST /reports/{id}/open`, mobile upload replays with the same `client_uuid`, weekly send with the same idempotency key. On any other 409, re-read the version and stop for a human.
- Optimistic writes send `lock_version`; every sibling case writer bumps it, so a writer must take its version from the live record or pin it deliberately, never from a stale snapshot.
- Error handling keys on `ApiError.code` and `status`, never on `message`. For mobile completion refusals, see [`report-lifecycle-v1`](../../contracts/report-lifecycle-v1.json).
