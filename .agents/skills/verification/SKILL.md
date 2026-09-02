---
name: verification
description: Choose and execute evidence appropriate to the changed behavior without confusing unavailable checks with passes.
---

# Verification

Use when deciding how to prove a change works.

## Principles

- Verification should match changed behavior and risk.
- Start with the narrowest meaningful evidence.
- Broaden only when justified.
- Never invent commands.
- Never install missing tooling automatically.
- Never claim a skipped/unavailable check passed.

## Evidence ladder

Choose as relevant:
1. static/syntax/type checks;
2. focused unit test;
3. integration/request/database test;
4. related suite;
5. build;
6. E2E;
7. browser/device/manual workflow verification.

For bug fixes, prefer a regression test.

For UI changes, automated tests may not prove visual/interaction quality; add manual/browser/device evidence when needed.

For React Native/Expo device verification, load `akidev-mobile-verification` before treating device or E2E results as valid evidence. Assess native-runtime freshness first so a stale development build is deferred instead of being mistaken for a feature failure.

## Report

For each command/check:
- command;
- result;
- what it proves;
- important gap.

Use `PASS`, `PASS_WITH_GAPS`, `FAIL`, or `INCOMPLETE`.
