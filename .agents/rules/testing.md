# Testing

Tests should prove behavior, not mirror implementation.

- Add or update a test only when a named user-visible or cross-boundary contract changed and no existing test covers it; state the claim in the test name. Use behavior, branching, validation, data transformation, error handling, state transitions, public contracts, and bug fixes as a checklist for identifying the claim, not as independent triggers.
- A test that can only fail when this diff changes is not behavior evidence.
- Deleting or rewriting a test whose claim no longer exists is maintenance, not hiding a failure.
- Do not create brittle tests that assert internal implementation details unnecessarily.
- Never add a test whose only evidence is that it opens, reads, greps, parses, or snapshots implementation source code and finds or omits particular strings, tokens, lines, commands, function names, prompt phrases, regex matches, AST shapes, or incidental snapshots. Matching text can be dead or commented out, and behavior-preserving refactors can change it without changing behavior.
- Instead, execute a public or executable interface and assert observable behavior, state, output, side effects, and failure modes. For machine-consumed declarative artifacts, invoke the real consumer when feasible or parse a typed or normalized semantic model and assert meaning; a raw substring or regex is still the anti-pattern.
- Reading a file is legitimate when it is itself generated public output, a serialized protocol, persisted state, an intentional snapshot, or another explicitly owned text or byte contract. Name that contract, and do not use its contents as a proxy that unrelated code works. A natural-language prompt or instruction is not proven effective because its source contains a sentence.
- Follow the strict ladder and stopping rules in the shared verification skill, preferring the lowest test level that provides strong evidence.
- Run targeted tests before fast verification, then run only affected integration/Feature or API/contract checks before considering the E2E decision gate.
- E2E is exceptional rather than automatic extra confidence; use it only when the verification skill's gate permits it.
- Keep a justified deterministic Mode B E2E/replay flow within the two-attempt ceiling, and classify biometrics, gallery pickers, permissions, and comparable native blockers as manual/native verification required instead of retry loops.
- The deterministic flow ceiling does not cap individual interactive Mode A actions; diagnose, fix, and continue from the current session instead of restarting after every failure.
- Ordinary tests must mock or abstract biometrics, image pickers, permissions, secure storage, notifications, and similar native APIs.
- Prefer deterministic ADB/emulator mechanisms over repeated dialog fighting when native verification is justified.
- Use integration tests when framework wiring, persistence, HTTP, filesystem, queues, or external boundaries are central to the behavior.
- Bug fixes should ideally include a regression test that fails before the fix and passes after it.
- Keep tests deterministic.
- Avoid arbitrary sleeps when event/state synchronization is available.
- Do not weaken a passing test to make a change pass.
- Treat flaky tests as defects or documented gaps, not as automatic retries forever.
- Do not claim broad coverage merely because the suite is green.
