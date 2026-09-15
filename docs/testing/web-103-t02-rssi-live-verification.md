# Web #103 live verification — T02 RSSI

This record covers the deferred browser and cross-system verification tracked by [Web issue #103](https://github.com/niks0501/caneguard-web/issues/103), for the T02 RSSI field-observed concern in the client-alignment specification.

## Environment and evidence boundary

- Date: 2026-09-15
- Browser: live Chrome 153 through `chrome-devtools-axi` at `http://127.0.0.1:9222`
- Web origin: `http://localhost:5173`
- API: `http://127.0.0.1:8000`
- API health: HTTP 200, `status: ok`, database `ready`, storage `ready`
- Authentication: seeded local reviewer account; no password, token, or cookie is recorded here
- Fixture: synthetic T02 report `CG-20260915-8A00E14C` with reporter-suspected condition `RSSI`

Browser actions were performed live through the bridge. No `.ad` flow or replayable verification script was created or run. Automated checks are not used as browser-pass evidence.

## Browser Case Review RSSI presentation: PASS

| Tester action | Expected | Actual and evidence |
| --- | --- | --- |
| Sign out of the existing session, then sign in as the seeded reviewer and reopen the T02 report | Reviewer workspace is available and the intended report opens | The login form accepted the reviewer account; after sign-in the report reopened at `/reports/01a0a428-e01c-7340-ba00-23ae8a00e14c`. The live page showed `Review session active`, `Reviewer access`, and `SRA Don Pedro Mill District Office`. |
| Inspect the report's field observation | RSSI is presented as reporter-observed/suspected evidence, not as an AI result | `Case Review` showed `RSSI reported as a field concern`, `SUSPECTED CONDITION: RSSI`, and the submitted observation text. The guided-observation status read `RSSI FIELD CONCERN REPORTED (NOT AI-DETECTED)`. |
| Inspect the Possible Condition and technical evidence | AI evidence remains separate and retains the four-class Model V1 result | The page showed `Possible Condition: Smut` at `91%`. Expanded technical evidence showed only `Healthy`, `Mosaic`, `Rust`, and `Smut` scores (`2%`, `3%`, `4%`, `91%`) plus model version `v1.0-mobilenetv2`; RSSI was not an AI class. |
| Compare the two evidence sources | RSSI must not alter or be confused with AI evidence | The live page explicitly stated: `Reporter-observed evidence only. The current Model V1 does not detect RSSI, and this does not change the Possible Condition.` It also stated that `Staff-Classified Condition is a separate human finding and never changes the original Possible Condition.` |

The bridge snapshot was retained at `.firstmate-scratch/cg-verify-103-browser-rssi-snapshot.txt`. A live DOM evaluation independently returned true for the reviewer session, RSSI concern, not-AI-detected copy, Possible Condition, immutable boundary copy, all four AI classes, and the Model V1 version.

## Mobile → API → Web review cross-system journey: PENDING

| Tester action | Expected | Actual and evidence |
| --- | --- | --- |
| Prepare the shared Android device and Mobile development build | A running Mobile build can author a T02 RSSI report | `adb devices -l` showed the shared Android device as available, and ADB reverse was established for API port 8000. The installed package opened only the Expo launcher; no Mobile Metro/dev server was listening on the host (`ss` showed no 8081/19000-series listener). |
| Exercise a real Mobile RSSI upload through the API and reopen it in Web Case Review | A new Mobile-authored report reaches the API with RSSI preserved and renders separately from the Possible Condition in Web | Not executed because the Mobile dev build could not be brought up from this Web worktree. No cross-system PASS is claimed and no fabricated Mobile/API/Web evidence is recorded. |

This gate remains pending until the device worker provides a running Mobile Metro/dev build. The browser gate is independent and has passed.

## Result

- Browser Case Review RSSI presentation: **PASS**
- Mobile → API → Web review cross-system journey: **PENDING** (Mobile Metro/dev build unavailable)
