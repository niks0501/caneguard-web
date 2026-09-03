---
name: akidev-tool-routing
description: Route unfamiliar, cross-cutting, debugging, runtime, and verification work to the smallest selected AkiDev capability; use shared CLIs without installing workstation tools.
---

<!-- Managed by AkiDev integration: akidev-tool-routing -->
# AkiDev tool routing

This laravel-react project declares these AkiDev integrations/capabilities: `context7`.
Read `.akidev/config` as the source of truth.
Availability alone does not mandate use, and it never overrides an explicit request or authoritative project/global instruction.
When a trigger applies, follow that capability's documented transport or fallback rather than suppressing it because the integration is optional.

## Choose the smallest sufficient path

1. Start with direct source inspection, existing tests, and normal static checks.
2. Use a selected structural-analysis capability only for unfamiliar or cross-cutting impact questions; do not run Graphify on every task.
3. Use mobile runtime capabilities only after explicit user intent to inspect, reproduce, verify, or interact with a device, emulator, or running app.
4. For mobile verification policy, read `akidev-mobile-verification` once and follow its intent gate, operating modes, freshness, and evidence rules.
5. Use the project npm commands and shared agent-device CLI for the deterministic final gate.

## Shared prerequisite policy

Use `agent-device`, `adb`, and other selected shared commands from the active shell `PATH`.
If a prerequisite is missing, report it and use a safe static fallback where possible.
AkiDev does not install, upgrade, repair, wrap, or register workstation tools from the project.

## Android emulator preflight

For explicit React Native + Expo Android verification from WSL2, the developer starts and manages the Windows-hosted Android Studio emulator before development.
That emulator is the default Android verification device for agents running in WSL2.
Use the existing localhost ADB connection rather than changing host or ADB networking.
Before any Android device or E2E operation, run `adb devices -l`, discover the ready device at runtime, and prefer the emulator over a physical device.
If no usable emulator is listed, report a verification blocker instead of launching, recreating, wiping, reconfiguring, or repairing an AVD.
Do not reconfigure or repair ADB networking.
Do not set `ADB_SERVER_SOCKET`, start a second ADB server, or run `adb kill-server` in the healthy-connection path.
Use a physical device only when the task explicitly requires physical-device behavior.

## Explicit mobile intent and ownership

`akidev-mobile-runtime`, `akidev-mobile-verification`, `akidev-e2e-verification`, `agent-device`, and device-oriented ADB are explicit-user-intent capabilities.
Only one agent or worktree may actively control a given physical device or emulator.
The shared Windows-hosted emulator is mutable state, so route active device work through the designated serialized verification lane.
