# Manual Acceptance — True Wi-Fi Offline and Recovery Test

> **Planning baseline (inspected 2026-08-19)**
>
> - `niks0501/caneguard-mobile` `main` @ `3ff11246cbae96b0333f7d2ea6011a05b2a6b8e3`
> - `niks0501/caneguard-web` `main` @ `b4c803db9716a793578c32272ab27dde4f70c590`
>
> Before editing, fetch/pull the current target branch and re-inspect the named files. If either repository head has moved, preserve the intent of this plan but adapt to the new code instead of force-applying old line-level assumptions.


## Purpose

This document covers the **real Android Wi-Fi OFF/ON acceptance scenarios that must not be automated through Maestro while the phone is controlled using wireless ADB**.

Turning Wi-Fi off will disconnect wireless ADB. That is expected. During these steps, judge the app by what you can see and do directly on the phone. After Wi-Fi is restored, wireless debugging may reconnect automatically or may need to be reconnected/re-paired depending on Android/host behavior.

This document is part of the P0E/P0F acceptance gate.

## What this test proves

It proves that CaneGuard can:

- remain usable when the phone truly has no Wi-Fi network;
- save/finalize an offline field report according to the current app rules;
- preserve the report through app closure/reopen;
- avoid data loss while offline;
- resume synchronization after connectivity returns;
- avoid duplicate remote reports;
- correctly show the final synchronized state.

This is stronger than merely stopping Laravel because it tests the real device's network-loss path.

## Important safety rules

Use only test/synthetic data. Do not use a real farmer's personal information.

Before turning Wi-Fi off:

- stop any running Maestro flow;
- assume wireless ADB will disconnect;
- do not depend on `adb logcat` during the disconnected period unless you temporarily use USB ADB;
- make sure you know the test account password before going offline if the app may need it later;
- keep mobile data disabled for this test, otherwise the phone may still have internet after Wi-Fi is turned off.

If the phone has cellular/mobile data enabled, disable **mobile data first** while Wi-Fi is still on. The goal is a real no-network state.

## Preconditions

- [ ] P0A–P0E implementation is installed in the development build.
- [ ] Laravel and web are running normally.
- [ ] A field-reporter test account can sign in.
- [ ] The phone is already signed in before the offline stage.
- [ ] At least one safe synthetic sugarcane test image is available locally on the phone.
- [ ] A browser with CaneGuard Web is available for later verification.
- [ ] You have recorded the mobile and web commit SHAs.
- [ ] Any old test reports that could confuse the result are identified/cleared according to normal test procedures.
- [ ] Mobile data is OFF.
- [ ] Wi-Fi is initially ON.
- [ ] App shows network/server available before starting.

## Evidence to capture

You may take phone screenshots manually. Capture at least:

1. report saved/finalized while offline;
2. pending/queued state while offline;
3. same report still present after app reopen;
4. synchronized state after Wi-Fi returns;
5. matching report on CaneGuard Web;
6. matching reference/client identity if visible through safe developer/test evidence.

Do not screenshot tokens, passwords, or private `.env` values.

---

# Test M1 — Create/finalize offline, restart app, recover automatically

## Step 1 — Confirm healthy starting state

On the phone:

1. Open CaneGuard.
2. Confirm you are signed in with the dedicated test field-reporter account.
3. Confirm the app indicates normal network/API availability.
4. If there are unrelated pending reports, record them or clear them using the normal test-data procedure so they do not confuse the result.

**Expected:** app is connected and stable.

Result: `PASS / FAIL`

Notes:

```text

```

## Step 2 — Turn Wi-Fi OFF

1. Stop Maestro if it is running.
2. Confirm mobile data is OFF.
3. Open Android Quick Settings.
4. Turn Wi-Fi OFF.
5. Return to CaneGuard.

Do not worry when wireless ADB disconnects.

**Expected:**

- CaneGuard remains open/usable;
- it eventually reflects an offline/network-unavailable state;
- existing local records remain available.

Result: `PASS / FAIL`

## Step 3 — Create the field report while truly offline

Using the normal user flow:

1. Capture/select the synthetic sugarcane image.
2. Complete the current scan/detection flow.
3. Create a field report.
4. Fill the required test values.
5. Capture/use location according to what is possible under the current offline design. If the current finalized-report rules require a location that cannot be obtained in this environment, obtain GPS before Wi-Fi is disabled in a repeat run or use the currently supported offline-capable GPS path. Do **not** fabricate coordinates.
6. Finalize the report.

**Expected:**

- no data is lost;
- the report is finalized locally;
- it is shown as pending/waiting for synchronization rather than falsely "synced";
- app does not require internet merely to retain the finalized report.

Record an identifier/reference visible locally:

```text
Local report/client identifier:
```

Result: `PASS / FAIL`

## Step 4 — Prove persistence across app restart

While Wi-Fi remains OFF:

1. Fully close CaneGuard from recent apps.
2. Reopen CaneGuard.
3. Navigate to the saved report/records area.

**Expected:**

- the report still exists;
- entered field details remain;
- image evidence remains available if the app normally displays it;
- sync state is still pending/offline;
- no duplicate local report was created.

Result: `PASS / FAIL`

## Step 5 — Restore Wi-Fi

1. Open Quick Settings.
2. Turn Wi-Fi ON.
3. Wait for the phone to reconnect to the same normal network.
4. Return to CaneGuard.
5. Do **not** immediately tap Retry unless the product explicitly requires it; first allow the automatic recovery window defined by P0E.
6. Observe the queue/status.

**Expected:**

- network becomes available;
- CaneGuard API becomes reachable;
- the pending report starts/retries automatically through the designed P0E path;
- report eventually becomes synced;
- no report details are lost.

Allow enough time for the implemented retry cooldown plus normal request time. Record the actual observed time.

```text
Wi-Fi restored at:
Sync completed at:
Approximate recovery time:
```

Result: `PASS / FAIL`

## Step 6 — Verify on the web

On the development computer:

1. Open CaneGuard Web.
2. Do not hard-refresh initially if the page was already open.
3. Wait up to the configured polling interval plus reasonable latency.
4. Find the test report.

**Expected:**

- exactly one matching remote report exists;
- field values match the phone;
- location is present only if a real valid coordinate pair was captured;
- report appears in map/queue according to current workflow.

Result: `PASS / FAIL`

## Step 7 — Check duplicate protection

If you can safely trigger a normal retry/refresh after the record already shows synced, do so once through the normal UI.

**Expected:** no second remote report is created for the same client report.

Do not manipulate UUIDs manually.

Result: `PASS / FAIL`

---

# Test M2 — Multiple queued reports survive a true offline period

This test validates queue behavior under real no-network conditions without trying to time a Wi-Fi cut during a single fast upload.

## Step 1 — Prepare offline state

1. Confirm mobile data OFF.
2. Stop Maestro.
3. Turn Wi-Fi OFF.

## Step 2 — Create multiple finalized test reports

Create at least **3** valid synthetic reports while offline using the normal flow.

Why 3 here instead of 11/25: the 11/25 drain limit is better covered deterministically by automated repository/service tests. This manual test only proves that a real offline device retains multiple user-created records.

Record each local identifier:

```text
1.
2.
3.
```

**Expected:** all three are locally present and waiting to sync.

Result: `PASS / FAIL`

## Step 3 — Restart the app offline

Close and reopen CaneGuard.

**Expected:** all three remain present and unsynced.

Result: `PASS / FAIL`

## Step 4 — Restore Wi-Fi and observe

Turn Wi-Fi ON and return to the app.

**Expected:**

- queue begins recovery;
- all three eventually sync;
- one failure does not silently erase another;
- each local record receives its remote/synced state;
- no duplicate remote records appear.

Result: `PASS / FAIL`

## Step 5 — Verify web count

Find all three on CaneGuard Web.

Expected remote count for these three client reports: `3`

Observed: `___`

Result: `PASS / FAIL`

---

# Optional Test M3 — Network loss during an active multi-report queue

Only run this if you want stronger manual evidence. It is intentionally **not** the primary gate because timing a radio cut during one fast upload can be nondeterministic.

1. Start with several pending reports while Wi-Fi ON.
2. Trigger normal Sync.
3. As soon as queue activity begins, turn Wi-Fi OFF manually.
4. Wait and inspect the phone directly.
5. Confirm reports remain in local `pending`/retryable failed states; none disappear.
6. Close/reopen app while still offline.
7. Restore Wi-Fi.
8. Confirm remaining reports recover and no duplicates appear.

If the upload finished before Wi-Fi was switched off, mark the run `INCONCLUSIVE` rather than `FAIL` and do not repeatedly force timing-sensitive behavior.

---

# Final manual acceptance criteria

The manual true-offline gate passes only if:

- [ ] Wireless ADB disconnection is treated as expected test-environment behavior, not an app failure.
- [ ] With Wi-Fi OFF and mobile data OFF, CaneGuard remains usable for the supported local workflow.
- [ ] A finalized offline report is preserved locally.
- [ ] The report survives app closure/reopen while still offline.
- [ ] The report does not falsely show as remotely synced while there is no network.
- [ ] After Wi-Fi returns, the report automatically retries/synchronizes within the designed recovery window.
- [ ] Exactly one matching remote report exists.
- [ ] Multiple manually created offline reports survive and later sync.
- [ ] No local report disappears during recovery.
- [ ] If an actual location was captured, the web displays the same location rather than a fabricated fallback.
- [ ] P0D web polling shows the new report without requiring a hard reload during the verification step.
- [ ] Evidence is captured without credentials or real farmer personal data.

## Pass/fail summary

| Test | Result | Notes |
|---|---|---|
| M1 Offline create/finalize |  |  |
| M1 Offline app restart persistence |  |  |
| M1 Wi-Fi recovery auto-sync |  |  |
| M1 Exactly one web report |  |  |
| M2 Multiple offline reports retained |  |  |
| M2 Multiple reports recover |  |  |
| M3 Active-queue Wi-Fi loss (optional) |  |  |

## Cleanup

After testing:

1. Confirm Wi-Fi is ON.
2. Reconnect wireless debugging if necessary.
3. Run `adb devices` and re-establish `adb reverse tcp:8000 tcp:8000` if that is the chosen dev route.
4. Remove/archive synthetic test reports only through the project's normal test-data procedure.
5. Restore any temporary local test configuration.
6. Record the final result in the P0F acceptance evidence.

## Final sign-off

```text
Tester:
Date/time:
Android device:
Android version:
Mobile commit:
Web commit:
Connection mode before Wi-Fi-off:
M1 result:
M2 result:
M3 result (optional):
Overall manual offline acceptance: PASS / FAIL
Notes:
```
