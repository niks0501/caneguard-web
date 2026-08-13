# Testing

Tests should prove behavior, not mirror implementation.

- Add or update tests when behavior, branching, validation, data transformation, error handling, state transitions, public contracts, or bug fixes change.
- Prefer the lowest test level that provides strong confidence.
- Use integration tests when framework wiring, persistence, HTTP, filesystem, queues, or external boundaries are central to the behavior.
- Use E2E tests for critical user workflows or behavior that cannot be adequately proven below the UI boundary.
- Bug fixes should ideally include a regression test that fails before the fix and passes after it.
- Keep tests deterministic.
- Avoid arbitrary sleeps when event/state synchronization is available.
- Do not weaken tests to make a change pass.
- Treat flaky tests as defects or documented gaps, not as automatic retries forever.
- Do not claim broad coverage merely because the suite is green.
