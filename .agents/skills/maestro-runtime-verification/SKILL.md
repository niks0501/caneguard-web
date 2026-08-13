---
name: maestro-runtime-verification
description: Gate Maestro React Native/Expo E2E on native-runtime freshness so stale development builds are deferred instead of producing misleading failures.
---

# Maestro Runtime Verification

Use when Maestro is available or mobile E2E is being considered for a React Native/Expo change.

## Core rule

Maestro is not automatically the first verification step after implementation.

Before running Maestro, establish whether the currently installed app runtime can actually execute the changed behavior. A stale development build can produce failures that look like application regressions even when the installed native runtime simply lacks newly required native code or configuration.

## Verification order

Prefer this order when relevant:

1. static/type/lint checks;
2. focused unit tests;
3. backend/API/database integration tests;
4. related JS/React Native tests;
5. native-runtime freshness assessment;
6. Maestro E2E only when the runtime is usable;
7. manual/device follow-up when needed.

Do not skip earlier, cheaper evidence just because Maestro is installed.

## Native-runtime freshness assessment

Treat the installed development build as potentially stale when the implementation changes native characteristics, including:

- adding, removing, or upgrading a dependency with native Android/iOS code;
- adding or changing Expo config plugins;
- changing Android/iOS permissions or other native app configuration;
- changing files under `android/` or `ios/`;
- upgrading Expo SDK, React Native, or native module versions;
- changing package/bundle identifiers, schemes, deep-link/native intent configuration, or other build-time native settings.

Do not infer staleness from "package changed" alone. JS-only packages, backend dependencies, API/server changes, database changes, and ordinary TypeScript/JavaScript edits do not by themselves require a new mobile build.

Inspect the actual diff and dependency metadata. If uncertain whether a dependency affects the native runtime, consult official dependency/framework documentation rather than guessing.

## Decision

### Runtime usable

Run Maestro only when:

- the relevant app is installed on the target emulator/device;
- the installed development build contains the native capabilities required by the current code;
- Metro, backend services, and other prerequisites for the flow are available;
- the flow is meaningful for E2E verification.

Prefer the project-local wrapper when present:

```bash
./.akidev/bin/maestro test .maestro
```

Use a narrower project-defined flow when available.

### Runtime stale, unknown, or rebuild required

Do not run Maestro as if it were valid feature evidence.

Instead:

- finish all meaningful non-device verification first;
- report `PASS_WITH_GAPS` or `INCOMPLETE` according to the remaining risk;
- state that Maestro is deferred because runtime freshness is stale or unverified;
- identify the native-affecting change that triggered the gate;
- state that a fresh development build must be built and installed before Maestro can provide valid E2E evidence.

Do not automatically run EAS build/submit or another costly/external build operation unless the user explicitly authorizes it and repository instructions allow it.

## Misleading-failure protection

If Maestro fails and runtime freshness was not established first, do not immediately classify the feature as broken.

First distinguish among:

- real application regression;
- stale or incompatible development build;
- disconnected or unavailable device;
- Metro/backend/service unavailable;
- invalid Maestro flow or selector;
- environment/tooling failure.

Never repeatedly rerun Maestro without changing the condition that caused the failure.

## Reporting

For Maestro-related verification, report:

- whether native-affecting changes were detected;
- runtime status: `USABLE`, `STALE`, or `UNKNOWN`;
- Maestro command and result if it actually ran;
- earlier checks that passed or failed;
- the exact remaining device/build gap.

Never claim Maestro passed when it was skipped, unavailable, deferred, or run against a runtime known to be stale.
