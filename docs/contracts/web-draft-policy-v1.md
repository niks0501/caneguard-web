# Web draft and offline-write policy v1

This contract records the boundary selected for the CaneGuard Web office
workspace. It is deliberately narrow: the Web is an online office tool, not an
offline client.

## Current policy: online-only writes with protected in-memory drafts

- Every Web write is a live, authenticated request. A review, handoff note,
  visit assignment, boundary link or account change is confirmed only after the
  server acknowledges it.
- There is no Web outbox, no queued mutation and no automatic replay. Nothing a
  reviewer typed is sent later on their behalf, and an outage never produces a
  "Review confirmed" or an "approval requested" state.
- A draft lives in the open tab's component state only. It survives navigation
  refusal, a failed save, an expired conflict and a connectivity loss, but a
  page reload or a closed tab discards it. This is intentional on shared office
  computers.
- Leaving a dirty review, handoff note, visit editor or boundary-rate draft is
  blocked behind one explicit Stay / Discard decision, and the browser's unload
  warning stays active while the draft is dirty.
- Official weekly preparation, approval and sending are online-only. They are
  never queued offline or retried silently.
- After an outage clears, the reviewer is asked to check the latest evidence
  before confirming the preserved draft; the draft is then submitted against the
  version the reviewer actually reviewed.

## What this policy does not authorize

- Persistent private drafts in browser storage, IndexedDB or a service worker.
- A Web offline mutation queue or background sync.
- Replaying an approval or delivery request.

Those remain a separate capability requiring its own decision and security
review.

## Invariants any future persisted draft must satisfy

If persistent draft recovery is approved later, it must:

- be scoped to one account and never restored to another user or a signed-out
  browser;
- expire within an explicitly approved lifetime and be cleared on logout,
  account disablement, role change or session revocation;
- contain no credentials, tokens, session identifiers or cached private
  evidence blobs (photos, polygons, personal identifiers);
- re-check the current report version and ask the reviewer to confirm against
  the latest evidence before any write;
- never produce a queued approval, send, reassignment or completed field
  evidence, and never write without an authenticated round trip.
