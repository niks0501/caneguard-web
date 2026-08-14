---
name: akidev-tool-routing
description: Route unfamiliar, cross-cutting, debugging, runtime, and verification work to the smallest sufficient AkiDev capability; use selected shared CLIs without installing workstation tools.
---

<!-- Managed by AkiDev integration: akidev-tool-routing -->
# AkiDev tool routing

This laravel-react project declares these AkiDev integrations/capabilities: `none`. Read `.akidev/config` as the source of truth. Availability is not a mandate to use a tool.

## Choose the smallest sufficient path

1. Start with direct source inspection, search, existing tests, and normal static checks for local or obvious work.
2. Use a selected structural-analysis capability only for unfamiliar, cross-cutting, or impact-analysis questions; do not run it on every task.
3. Use mobile runtime/device capabilities only when the user explicitly asks to inspect, reproduce, verify, or interact with a device/emulator or running app. Difficulty alone is not permission.
4. Use interactive mobile MCP or the `mobile-mcp` child only for explicitly requested UI/runtime inspection, selector/hierarchy debugging, screenshots, or flow diagnosis.
5. Use project npm E2E commands and the shared Maestro CLI for deterministic evidence only after the user explicitly asks for E2E/device verification. Acceptance criteria or task difficulty alone never activate device/E2E tooling.

Do not run Graphify on every task, touch a device for code-only work, start MCP because a bug is difficult, or run full E2E after every small edit. Escalate only when simpler evidence leaves material uncertainty.

## Shared prerequisite policy

When a selected capability is needed, use command names from the active shell `PATH` (`graphify`, `agent-device`, `adb`, and `maestro`). If a command is missing, report the machine/user-scoped prerequisite and use a safe static fallback where possible. Never install, upgrade, repair, or register shared workstation tools from the project.

## Explicit mobile intent gate and device ownership

`akidev-mobile-runtime`, `akidev-e2e-verification`, `agent-device`, device-oriented ADB, Maestro MCP, and `mobile-mcp` are explicit-user-intent capabilities. A request such as “verify this on my phone”, “see what happens on the emulator”, or “run E2E” permits the matching capability; a code-only request does not. Only one agent/worktree may actively control a given physical device or emulator at a time. Route active device work through the designated serialized verification lane.
