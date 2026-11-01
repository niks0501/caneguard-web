# CaneGuard Mobile: Quiet Field interface plan

Scout report for `cg-mobile-ux-calm-20261101`. Written 2026-11-01 against commit `996abb5` (detached HEAD, clean worktree).

## Conclusion

CaneGuard's interface is loud for four reasons:

1. **It treats normal field conditions as alarms.** Offline, "Waiting to send" and a draft report all use the warning colour, in an app built to work offline.
2. **It has no quiet voice left.** Nine status hues and 111 bold overrides mean nothing stands out.
3. **Its most important sentences are its smallest.** Scan cautions, the disclaimer and refresh failures are set in 12px captions.
4. **It boxes and repeats everything.** There are 96 hand-rolled borders, Home tiles that duplicate tabs, and a result screen that explains the same three options three times.

**Recommendation, accepted by the captain:** adopt the five directions below, as one design system called Quiet Field, in the build order given. Start with Phase 0 (legibility repairs), which is worth shipping regardless of the design choices.

Everything here is interface only, with one deliberate exception the captain chose: Paper becomes the default appearance. The captain answered all six product choices in review, each matching the recommendation; see [Captain's decisions](#captains-decisions). Nothing was changed in the repository.

The interactive board carries these same directions as phone mockups, a field simulator and per-question queue controls.

## What I did

- Read the checkout: theme tokens, all shared `src/components/ui` components, and the Home, Today, Activity, Scan, Image preview, Guided observations, Analysis result, Record details, Field report, Field survey, Field validation, Field guide, Settings and Login screens.
- Started from Graphify as `AGENTS.md` requires (`graphify query` on shared status and card components), then read source directly.
- Wrote a read-only static audit script. It counted noise patterns across 95 production `.tsx` files and computed WCAG contrast from the real token values.
- Resolved every `file:line` reference in this report by script against the checkout. Line numbers are relative to `src/`.
- Ran the typecheck.
- Built the Lavish board and checked it in Chrome at 1280px, 1000px and 390px wide.

**Design source for the board:** priority step 2 of `lavish-axi design`, the subject project's own design system. The "Today" phones use real `src/constants/theme.ts` values, Feather icons, true dp sizes and verbatim strings. DaisyUI was not used because the project has its own tokens. Playbooks opened: `plan`, `comparison`, `input`, `table`.

**Commands and results**

| Command | Result |
| --- | --- |
| `./node_modules/.bin/tsc --noEmit -p tsconfig.json` | Exit 0, no errors |
| `graphify query "which shared UI components render status, pills, cards and screen headers across screens"` | 260 nodes found, 66 shown (truncated) |
| Static audit, `python3 -I audit.py <checkout>` | Counts and contrast below |
| `lavish-axi design` and `lavish-axi playbook plan\|comparison\|input\|table` | Read before writing HTML |
| Browser checks with `chrome-devtools-axi` | No console errors; no horizontal page overflow at 390px; state, sun, filter and selection controls exercised |

**Departures from the brief**

- `npx -y lavish-axi` was denied by the auto-mode classifier as external code. I used the already-installed `lavish-axi` binary at `~/.volta/bin/lavish-axi` instead.
- Queueing through the real Lavish bridge can only be exercised by a live reviewer. Outside Lavish, the Queue control correctly reports that it isn't connected.
- Lint and jest did not run, because no source changed.

**Not verified:** nothing ran on a device, as the brief directs. No screen was rendered from the app itself. The phones are hand-built HTML using real tokens, so they approximate the app rather than capture it.

## Measured noise

Across 95 production `.tsx` files:

| Metric | Count |
| --- | --- |
| `borderWidth` declarations | 96 |
| `<Card>` uses | 12 |
| `Typography.caption` (12px) uses | 115 |
| `fontWeight: '800'` overrides | 68 |
| `fontWeight: '700'` overrides | 43 |
| Tinted status backgrounds | 54 |
| `<AppButton>` uses | 120 (22 in `field-report.tsx`) |
| Hex literals outside `theme.ts` | 3, all in the photo viewer (`app/field-guide/[entryId]/photo.tsx:26, :99, :145`) |

Worst files: `field-report.tsx` (3,260 lines, 22 buttons, 18 icons, 11 borders), `analysis-result.tsx` (10 borders, 7 tinted backgrounds), `(tabs)/scan.tsx` (6 borders).

Computed contrast, light theme unless stated:

| Pair | Ratio | Note |
| --- | --- | --- |
| Disabled primary button, label on fill at 55% | **1.12:1** | Dark theme: 1.42:1. Busy labels sit here |
| Active-tab marker on white | 2.27:1 | Non-text; below the 3:1 UI-component target |
| Rust pill | 3.56:1 | 12px bold text; passes only the guard's 3:1 |
| Mosaic pill | 3.99:1 | Same |
| Muted text on `surfaceMuted` | 4.28:1 | Below 4.5:1; used by disclosure hints, sync summary, empty states |
| Muted text on white | 4.83:1 | Passes, at 12px in many places |

## Key findings

1. **Busy buttons are nearly invisible.** `components/ui/AppButton.tsx:48` sets a sage fill, `:78` sets a grey label, and `:125` fades both to 55%. "Analyzing…", "Saving scan...", "Finalizing Report…" and the instruction "Choose an observation" (`app/symptom-checklist.tsx:223`) are all affected. This is the clearest defect in the audit.
2. **Offline is painted as a warning.** `app/(tabs)/home.tsx:61`, `components/ui/SyncStatusRow.tsx:46`, `components/ui/RecordCard.tsx:172` and the permanent amber draft card at `app/field-report.tsx:1109` all use warning colour for normal states.
3. **Send state is stated three times on Home.** The connection badge, the attention row and the sync row all report it. They also use two wordings: "waiting to send" in `syncStatusCopy.ts` and "waiting to be uploaded" at `features/activity/domain/needsAttention.ts:138`, despite the single-source rule in `AGENTS.md`.
4. **The most important sentences are the smallest.** `app/analysis-result.tsx:657-658`, `app/(tabs)/today.tsx:172`, `components/ui/SyncStatusRow.tsx:107`.
5. **The result repeats itself.** The same three choices are explained at `app/analysis-result.tsx:319`, `:354` and `:414`. Quality warnings render at both `:346` and `:560`. In the worst case, seven bordered boxes follow the photo.
6. **Disease colour can read as a verdict.** Purple, orange and amber pills imply certainty that the mandatory wording denies. Each record also states the condition twice (`components/ui/RecordCard.tsx:121`, and 190 for the label).
7. **The disclaimer appears where no result exists.** Before any photo (`app/(tabs)/scan.tsx:462`) and on the Home guide link (`app/(tabs)/home.tsx:225`).
8. **Navigation is duplicated.** Three of four Home tiles repeat tabs (`app/(tabs)/home.tsx:73-100`). Today's visits is reachable from five places. Scan is a tab with a close button (`app/(tabs)/scan.tsx:245`).
9. **The app already holds its own calm model.** The Field guide screens are photo-led with a quiet rhythm.
10. **The change is cheaper than it looks.** Colour is well tokenised. Only the map tests use `toHaveStyle`, and they don't assert colour. 12 test files mention "Possible Condition", so that wording stays.

`components/ui/Status.tsx` has no production imports; only its test uses it.

## Inventory by screen

Severity reflects field use. Directions: 0 is the repair phase, 1 to 5 as below.

| Screen or part | What gets in the way | Noise type | Sev. | Dir. | Evidence |
| --- | --- | --- | --- | --- | --- |
| AppButton | Disabled label 1.12:1 light, 1.42:1 dark | Accessibility, feedback | High | 0 | `components/ui/AppButton.tsx:48, :78, :125` |
| Theme | Nine status hues; pills guarded at only 3:1 | Colour, contrast | High | 0, 1, 2 | `constants/theme.ts:48-57`, `constants/__tests__/designGuards.test.ts:48` |
| Typography | Body weight 500, overridden to 700–800 in 111 places; 115 captions | Typography, hierarchy | High | 2 | `constants/theme.ts:117-119` |
| Bottom nav | Long "Today's visits" label; thin 2.27:1 active line; red unread count | Navigation, contrast | Medium | 1, 2 | `components/ui/BottomNav.tsx:39, :80, :86` |
| Pill, Status, Card | Tint plus full-colour border; unused Status; 12 Cards vs 96 borders | Clutter, spacing | Medium | 1 | `components/ui/Pill.tsx:68` |
| DisclosureSection | Hidden detail looks as heavy as content | Clutter | Low | 1 | `components/ui/DisclosureSection.tsx:30` |
| Home | 190dp hero; send state three times; duplicate tiles; Start Scan second in its list | Clutter, navigation, hierarchy | High | 1, 3 | `app/(tabs)/home.tsx:73-100, :199, :225, :228, :316` |
| Today's visits | Reference code leads, not place; redundant tag; three detail rows; failures in 12px | Hierarchy, typography | High | 2, 3 | `features/activity/components/AssignmentCard.tsx:59, :82`, `app/(tabs)/today.tsx:172` |
| Activity | Entry repeats a tab; separate search button; long subtitle; up to seven lines per record | Clutter, hierarchy | Medium | 2, 3 | `features/activity/components/ActivityScreen.tsx:267, :292, :410` |
| Scan | Close on a tab; early disclaimer; nested card; check icon in warning tint | Clutter, colour, feedback | High | 1, 5 | `app/(tabs)/scan.tsx:245, :287, :436, :462` |
| Image preview | Eight buttons in the file; Cancel beside Start New Scan; pipeline chatter | Clutter, feedback | Medium | 5 | `app/image-preview.tsx:350, :487, :496` |
| Guided observations | Two Cancel paths; instruction inside a disabled button | Colour, feedback | Medium | 0, 5 | `app/symptom-checklist.tsx:223` |
| Analysis result | Up to seven boxes after the photo; repeats; 12px cautions; undocked actions | Clutter, typography, hierarchy, feedback | High | 4 | `app/analysis-result.tsx:319, :346, :354, :414, :560, :657` |
| Record details | Delete sits above context; boxed disclaimer | Hierarchy, colour | Medium | 1, 2 | `app/record-details.tsx:302, :405` |
| Field report | Permanent amber card; step shown twice; two Cancel paths | Clutter, colour, spacing | High | 2, 5 | `app/field-report.tsx:1067, :1109, :1270, :1588` |
| Field survey | Up to three filled primaries; six-decimal coordinates; 230dp map; Close repeats back | Hierarchy, clutter | High | 5 | `app/field-survey.tsx:406-408, :419, :429-430` |
| Field validation | Rules packed into one small paragraph; no docked action | Typography, hierarchy | Medium | 4, 5 | `app/field-validation.tsx:303` |
| Field guide | Model to follow; small trims only | Clutter | Low | 1 | `app/field-guide/index.tsx:83, :89` |
| Settings | Uppercase labels; "App Name" row adds nothing | Typography, clutter | Low | 1 | `app/settings.tsx:203, :373` |
| Login | Amber notice before sign-in; medallion, rule and shadow compete with the form | Colour, clutter | Medium | 1, 2 | `app/login.tsx:131, :235` |
| Toast | Routine success in a tinted, bordered box far from the thumb | Feedback | Low | 2 | `components/ui/Toast.tsx:81` |
| Office updates pill | Repeats the tab's unread badge | Clutter, navigation | Low | 3 | `features/notifications/components/OfficeUpdatesPill.tsx:75` |

## The five directions

### 1. Silent When Fine

Delete green and blue as status colours. If nothing is wrong, the app says so in plain ink, and colour means only "look here".

- **Simplify:** nine status hues become two. Whisper is ink text for normal states (offline, waiting to send, drafts, sent). Note is amber for something worth a look (overdue visit, low score, mismatch, weak photo). Stop is red for what only the inspector can fix (could not send, sign in again, draft failed to save). At most one coloured block per screen.
- **Before → after:** Home's amber Offline badge and amber sync row become one ink line: "Working offline." A draft report's amber card becomes a word in the header.
- **Usability win:** red and amber become rare enough to trust at a glance.
- **Cost:** unsent counts must always stay visible, or silence reads as doubt. Needs a shared `Notice` component and a voice map beside `getSyncPresentation`.

### 2. Paper & Ink

Calm for field use is not soft and pale. Secondary text gets darker, the background gets warmer, and the disease rainbow goes.

- **Simplify:** warm paper background, flat rows and hairlines. Two weights (400, 500). A 14px floor for anything read, with 12px kept for tab labels. Three radii rather than six. Drop the duplicate pill on records.
- **Proposed tokens:** `background #F8F5EE`; `textSecondary #4A5650`; Note `#8A4A06` on `#F7EBD3`; Stop `#9B2F2F` on `#F6E3DE`; hairline `#DDD8C9`. Text and primary are unchanged.
- **Before → after:** a record goes from up to seven lines with a tag and pill to a photo, "Possible Condition", the condition, place and date, and a one-word state.
- **Usability win:** secondary text goes from 4.83:1 to 7.04:1. Note and Stop pass at 5.80:1 and 5.97:1 on their tints. Removing hue also removes the false verdict.
- **Cost:** long lists lose colour scanning. All screens shift at once. Dark mode needs its own pass.

### 3. The Morning Note

Home stops being a dashboard and becomes one sentence, set in the phone's own serif, with one button that changes with the day.

- **Simplify:** remove the hero, connection badge and sync row, whose message moves into the sentence. Remove tiles that repeat tabs. Next visits become plain rows led by place. Measure a plot and Field guide become quiet links.
- **Before → after:** "Two visits today. One is overdue." above Open next visit, in place of a card, tiles, a sync row and four disease pills. Other states: "All clear.", "Working offline.", "2 reports could not send."
- **Usability win:** Start Scan sits about 650dp down today when work is waiting (an estimate from token heights on a 360×800 screen). The primary action moves to one fixed thumb position.
- **Cost:** new strings per state in `copy.ts` and `syncStatusCopy.ts`. `home.test.tsx` pins the tiles. Uses `Fonts.serif`, so no new font. Keeps the work-first order documented at `features/activity/components/HomeAttentionCard.tsx:28`.

### 4. One Voice

The result reads like a short note from a careful colleague: photo, what it might be, one caution, then what to do.

- **Simplify:** merge low-score, mismatch and photo warnings into one Note. Delete the third restatement of the options. Dock Report to Office. Remove the second Cancel.
- **Before → after:** seven boxes after the photo become one caution and one docked action. Details sit behind "Why this result?".
- **Usability win:** the next step is always in reach, and cautions get read at 15px rather than 12px.
- **Cost:** "Possible Condition" and the disclaimer stay verbatim because client acceptance covers them (`docs/CLIENT-ALIGNMENT-ACCEPTANCE.md:33`). Several `accessibilityRole="alert"` regions must merge carefully.

### 5. The Thumb Line

Every task screen gets one docked primary action in the same place, reachable one-handed. On the survey, the map becomes the screen.

- **Simplify:** a shared `ActionDock` for scan, preview, report, validation and survey. One Cancel per flow, the header X. One step indicator in the report. Survey coordinates move behind "Points".
- **Before → after:** the survey's long scroll with a 230dp map becomes a roughly 500dp map with floating controls and a docked summary.
- **Usability win:** the next step never moves, and the survey goes from three filled primary buttons to one.
- **Cost:** the most layout work, in a 3,260-line file. Dock behaviour above the keyboard needs on-device checks.

## Build order

Each phase can ship and stop.

| Phase | Scope | Size | Main files |
| --- | --- | --- | --- |
| 0. Legibility repairs | Busy buttons keep full ink and a spinner; darker `textSecondary`; fix rust and mosaic contrast | Small | `components/ui/AppButton.tsx`, `constants/theme.ts` |
| 1. Paper & Ink | Tokens, type, radii, then shared parts; remove unused `Status.tsx` | Medium | `theme.ts`, `Card`, `Pill`, `DisclosureSection`, `BrandedScreenHeader`, `BottomNav`, `Toast` |
| 2. Silent When Fine | `Notice`, voice map, sync and draft surfaces; align upload wording | Medium | `RecordCard`, `SyncStatusRow`, `needsAttention.ts`, `syncStatusCopy.ts` |
| 3. Morning Note and lists | New Home; place-first cards; remove duplicate Today entries | Medium | `(tabs)/home.tsx`, `AssignmentCard`, `RecordCard`, `ActivityScreen` |
| 4. One Voice, Thumb Line | `ActionDock`; result first, field report last | Large | `analysis-result.tsx`, `(tabs)/scan.tsx`, `image-preview.tsx`, `field-validation.tsx`, `field-survey.tsx`, `field-report.tsx` |

**Worth shipping now:** Phase 0 needs no design decision, and the disabled-button fix is a real accessibility defect. It could be promoted on its own.

**Verification per phase:** `npm run lint`, `npm run typecheck`, targeted jest. Phases 3 and 4 also need on-device checks once the phone path returns.

**Kept as is:** all behaviour, sync logic, data, routes and API contracts; "Possible Condition" and the disclaimer wording on result surfaces; testIDs and live regions unless a decision removes the element; `copy.ts`, `syncStatusCopy.ts`, `SheetScreen`, `DisclosureSection`, `ClampedText`, `HelpHint`; brand green and logo.

## Risks and gaps

- **No device evidence.** Findings rest on code reading, computed contrast and token-height estimates. Measurements like 650dp are estimates.
- **Sunlight is reasoned, not measured.** The board's sun control is a simple veil model. Under strong glare both palettes converge (about 1.84:1 against 1.91:1 at 70%), so larger text does more than colour. Warm paper and the dark-mode claim need an outdoor test with inspectors before Phase 1 ships.
- **Only light mode is mocked.** Dark mode keeps its current palette until the Phase 1 pass.
- **Retraining cost.** Inspectors may rely on current colours and the current Home.
- **Silence can erode trust** if sent and unsent states become hard to find. Counts must stay visible.
- **Sample copy.** Morning Note sentences are proposals and need owner review. The repo has no i18n layer, so any Filipino or Tagalog wording is a separate decision.
- **Fragile point.** Merging `alert` regions in One Voice must not reduce what screen readers announce.

**Test authority:** any test changes are proposals, including raising the disease-pill guard from 3:1 to 4.5:1 at `constants/__tests__/designGuards.test.ts:48`. The captain or the named delegate aki-secondmate must promote them. The implementer must not edit a proof test to make it pass.

## Captain's decisions

All six were answered on the board in review round 1 (2026-11-01). Captured as `lavish-dcf339cbdbf02761.1.result`, complete with 6 of 6 items. Every answer matched the recommendation. No notes were added.

| Key | Captain's answer | Effect on the plan |
| --- | --- | --- |
| `quiet-directions` | Silent When Fine, Paper & Ink, The Morning Note, One Voice, The Thumb Line | All phases are in scope |
| `quiet-home` | Morning Note | Phase 3 builds the sentence-and-button Home; new strings go in `copy.ts` and `syncStatusCopy.ts` |
| `quiet-disease-color` | Remove the colours | Phase 1 removes pill hues; lists lead with photo and label |
| `quiet-tabs` | Keep four tabs, rename to "Visits" | Phase 3 renames the tab and removes the Home tile and Activity card; no routes move |
| `quiet-appearance` | Paper by default, dark as a choice | Phase 1 changes the fallback at `providers/ThemePreferenceProvider.tsx:35`; a saved dark choice is kept. This is the one deliberate behaviour change |
| `quiet-disclaimer` | One quiet line on every result surface | Phase 2 keeps the exact wording on result, record and report surfaces and removes it from Scan and Home |

**Open record for firstmate:** captain-held task `cg-mobile-ux-picks-20261101` is still open. It needs closing through `fm-captain-hold.sh answer`, using the answers above, because a scout may not write the backlog. I ran `complete --none` believing the inventory was empty, before I found this row. The gate reported that registered task as the inventory and `verify` passed, so the attestation stands on firstmate's registration, not on an empty inventory.

**Still to confirm when building:** the Morning Note strings need owner review, and an outdoor test should precede the Phase 1 release, as listed under Risks.

## Board

- Review ended 2026-11-01: the captain answered all six in round 1, then pressed End with no further comments (round 2). The board is retired, so its local URL no longer applies.
- Artifact: `.lavish/cg-calm-board.html` in this disposable worktree. It does not survive teardown, so this report stands alone.
- The board adds a field simulator (Home under four conditions with a sun control), live colour, box and tap-target counts, a filterable inventory, and the six queue controls.
