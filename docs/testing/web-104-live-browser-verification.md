# Web #104 live browser verification

This report records the deferred interactive browser verification for T03 and T05 in [Web issue #104](https://github.com/niks0501/caneguard-web/issues/104), covering the client-alignment behavior from Web/API tickets #100 and #102 under parent specification #97.

## Environment and evidence boundary

- Date: 2026-09-15
- Browser: live Chrome 153 through `chrome-devtools-axi` at `http://127.0.0.1:9222`
- Web origin: `http://localhost:5173` (one consistent origin for session cookies and CSRF)
- API: `http://127.0.0.1:8000`
- API health: HTTP 200, `status: ok`, database `ready`, storage `ready`
- Authentication: seeded local reviewer account; no password, token, or cookie is recorded here
- Fixtures used: synthetic V1 submitted report `CG-20260915-8A00E14C`, synthetic historical legacy report `CG-20260915-HIST`, and seeded completed field-validation report `CG-20260831-25BD1311`

All browser actions were performed live and manually through the bridge. No `.ad` flow or replayable verification script was created or run. Automated checks were not used as browser-pass evidence.

## T03 — reviewer classification workflow: PASS

| Tester action | Expected | Actual and evidence |
| --- | --- | --- |
| Sign in as reviewer and open the submitted synthetic report | Reviewer workspace is available | Dashboard showed `Reviewer access`, reviewer identity, and the assigned office. The report opened in `Case Review` with its reference and `Needs review` status. |
| Inspect the report evidence | Model V1 and reporter-observed evidence are visible | The report showed Model V1 (`v1.0-mobilenetv2`), possible condition `Smut` at 91%, reporter mismatch flag, reporter suspected `RSSI`, and the reporter observation text. Expanded technical evidence showed the model class scores. |
| Open the Staff-Classified Condition list on a new review | Exactly the seven active choices are offered | The list showed exactly: Healthy / No Selected Concern; Sugarcane Smut; Sugarcane Mosaic Disease; Sugarcane Rust; RSSI; Mixed or Multiple Visible Concerns; Unable to Classify. Downy mildew was absent. |
| Open a historical record containing the retired condition | Downy mildew remains readable on history but is not offered for a new classification | The historical report displayed `Downy mildew (legacy record; not offered for new review)` as its selected legacy value while retaining only the seven active choices in the list. |
| Select `Sugarcane Rust`, save, and reopen the submitted report | Staff classification persists while AI Possible Condition and reporter observation remain separate and unchanged | The reopened report showed Staff-classified Condition `Sugarcane Rust`; Possible Condition remained `Smut` at 91%; Model V1 evidence and reporter RSSI/observation remained unchanged. The save path returned HTTP 200. |

## T05 — office review/action workflow: PASS

| Tester action | Expected | Actual and evidence |
| --- | --- | --- |
| Open the submitted report in Case Review | Office action controls and guidance are visible | The UI displayed: `Choose the office action below, then use Review notes to record the treatment, pesticide, medicine, technical assistance, or other action used when applicable. If no intervention was used, say so in the notes.` |
| Select `Technical assistance provided`, type representative notes, save, and reopen | Action and notes persist as separate review fields | After reload, the action radio remained `Technical assistance provided` and the current review note remained `Technical assistance provided: test note entered by live reviewer.` The browser-context save request returned HTTP 200 with separate action and notes fields; the persisted API record contained both values independently. |
| Open a report with completed field validation | Highlighted Action Taken evidence remains visible | `CG-20260831-25BD1311` showed `Verified by staff`, `Verification outcome: Verified`, `Case state: Closed`, and highlighted `ACTION TAKEN EVIDENCE`. It displayed the action taken, observation, and finding separately. |
| Compare the completed-validation evidence with review concepts | Verification, case, field-validation, AI, and Staff-Classified concepts remain distinct | The report showed completed field-validation evidence as read-only, with the explicit note that it does not verify or close the case. Its AI Possible Condition (`Rust`, 100%), Staff classification (`Not classified`), verification outcome, and case state were displayed as separate values. |

## Captured evidence

During the session, screenshots were captured locally (ignored QA artifacts):

- `.qa-staging/browser-104-final-candidate.png` — reopened submitted report with persisted classification, action, and notes
- `.qa-staging/browser-104-t05-field-validation.png` — completed field-validation report with Action Taken evidence

The browser snapshots and browser-context HTTP 200 save response were retained in the live verification session. The final persisted values were also checked through the local API/database record without recording credentials or tokens.

## Result

Both deferred scenarios genuinely passed in the live browser: **T03 PASS** and **T05 PASS**.
