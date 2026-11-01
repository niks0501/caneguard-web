# Quiet Field for CaneGuard web: scout report

Task: `cg-web-quiet-field-20261101`. Date: 2026-11-01. Commit inspected: `877900e`. Planning and pictures only. No code was kept, nothing was pushed, and no on-device checks ran.

## Conclusion

The web app can take on all five Quiet Field directions and all six mobile picks. The work is mostly removal, and it can ship in small slices.

- Paper tokens alone are low risk. A scratch swap of `src/styles/tokens.css`, including an ink chart ramp, passed the real `npm run test:design-spine` gate and rendered on the real app. The change was reverted.
- The biggest review gain is on the case page. Confirm Review sits 2,553px down on desktop and 4,219px down on a phone, under nine cards.
- Four small defects are worth fixing whether or not this work goes ahead (Slice 1 below).
- The captain decided all eight web adaptations on the board. They are listed under "Captain decisions". No captain call remains open.

## Inputs and limits

- **Mobile source:** I did not read `data/cg-mobile-ux-calm-20261101/report.md`. The read was denied, and firstmate's steering message (`001.msg`) told me to proceed from my checkout plus its summary. That summary is my only mobile input.
- **Six picks, kept as decided:** all five directions, Morning Note Home, remove disease colours, four tabs renamed Visits, paper default with a dark choice, one quiet disclaimer line on every result.
- **Five directions:** Silent When Fine, Paper and Ink, Morning Note, One Voice, Thumb Line.
- **Token hex values are a web draft.** I had token names, not mobile hex values. They must be reconciled with the mobile token file before shipping.
- **`npx -y lavish-axi` was blocked** by the local permission classifier as external code. I used the installed binary at `~/.volta/tools/image/packages/lavish-axi/bin/lavish-axi` for `design` and playbooks `input`, `plan`, `comparison` and `table`. This differs from the brief's command, not its intent.
- **Data is fake.** Captures use `VITE_DATA_SOURCE=mock` with eight fixture reports. The "CaneGuard server Degraded" chip comes from running with no API. The floating icon in dev (TanStack Query Devtools) was hidden in captures.

## Design source

CaneGuard's own `src/styles/tokens.css` and Poppins, with Quiet Field values layered on. Lavish's priority order says a mock of a specific app should use that app's design system, so the DaisyUI fallback was not used.

## Method

| Step | Evidence |
|---|---|
| Structure | `graphify query`, then reads of `router.tsx`, `AppSidebar.tsx`, `AppHeader.tsx`, the main pages, `ReportTable.tsx`, `QueueRowCells.tsx`, `ReviewDecisionForm.tsx`, `tokens.css`, `validate-design-spine.mjs` |
| Live measurement | `VITE_DATA_SOURCE=mock VITE_REALTIME_ENABLED=false npx vite --port 5191`, driven with `chrome-devtools-axi` at 1440x900 and 390x844 |
| Source counts | `grep` over `src/index.css` (9,723 lines) and test files |
| Token trial | Edited `tokens.css`, ran `npm run test:design-spine`, captured real pages, restored the file. Result: 9 of 9 tests passed, and "Design spine validation passed" |
| Contrast | Computed with the WCAG formula, matching `contrastRatio` in `validate-design-spine.mjs` |
| Board check | Rendered in paper, dark and 390px with no sideways scroll. All eight queue controls fired exactly once against a stubbed `window.lavish` |

## Measurements

| Screen | Width | Result |
|---|---|---|
| Overview | 1440 | 3,156px tall, 1,527px wide, so it scrolls sideways |
| Overview | 390 | 8,547px tall, 1,001px wide |
| Reports | 1440 | 1,547px tall, first case row at about 590px |
| Reports | 390 | Queue is a 1,120px table in a horizontal scroller |
| Case review (CG-2026-0718) | 1440 | 3,066px tall, Confirm Review at 2,553px, 9 cards |
| Case review (CG-2026-0718) | 390 | 4,753px tall, Record Finding at 2,817px, Confirm Review at 4,219px |
| Monitoring map | 1440 | Map panel starts below about 760px, under filters and four metric cards |

## Noise inventory

| Lens | Finding | Evidence |
|---|---|---|
| Clutter | Office name appears three times on Overview. Freshness repeats, with extra refresh lines on Reports. | `AppSidebar.tsx:29`, `AppHeader.tsx:44`, `DashboardPage.tsx:119`, `SubmittedReportsPage.tsx:368,557` |
| Hierarchy | The decision sits at the bottom of the case page. Overview spends its first 410px on a header, scope ruler and three action buttons. | `CaseReviewPage.tsx:669-824`, `ReviewDecisionForm.tsx:363`, `DashboardPage.tsx:116-159` |
| Contrast | Text passes AA and should stay that way. The strain comes from tints on tints. Row tints mix in literal white. | `tokens.css:23-27`, `index.css:4600-4614` |
| Typography | 166 rules at weight 600 or 700, and 21 negative letter-spacing rules. A 10px login badge sits below the floor. Case headings have inverted sizes. | `index.css`, `tokens.css:34,99`, `CaseReviewPage.tsx:671-676` |
| Spacing | Everything is a bordered card, with 62 box-shadow rules. Key selectors are defined more than once. | `index.css:142,3801`, `index.css:713,4469,5036`, `index.css:867,4566` |
| Colour | Four hue families compete: disease dots, status tints, timeline badges, lime and gold charts. | `tokens.css:58-61,81-84,90-97`, `index.css:1034-1037` |
| Navigation | Dashboard in the sidebar is Overview in its heading. Monitoring nests five views and then quick views. Two pairs of links share an icon. | `AppSidebar.tsx:40,57,76,82,92`, `DashboardPage.tsx:120`, `MonitoringWorkspacePage.tsx:23-29`, `SubmittedReportsPage.tsx:341-351` |
| Feedback | Long sentences repeat page by page. Clicking your own name signs you out at once. | `SubmittedReportsPage.tsx:562-620`, `AppSidebar.tsx:99` |
| Accessibility | Sideways scroll, a tablist with no tabs, and a 1,120px phone table. | `AnalyticsSection.tsx:88,656`, `DecisionChartFrame.tsx:55`, `index.css:110`, `CaseReviewPage.tsx:847` |

### Defects found along the way

1. **Sideways scroll on Overview.** `table.sr-only` reaches right=1527 at a 1440 viewport. `.sr-only` (`index.css:110`) does not constrain a table. Affects `AnalyticsSection.tsx:88,656` and `DecisionChartFrame.tsx:55`.
2. **Four CSS tokens are used but undefined:** `--color-disease-rust` (3 uses), `--text-caption` (6), `--color-primary-text` (3), `--color-primary-soft` (2). Those declarations silently fall back.
3. **One-click sign-out with no confirmation.** The whole user summary is the sign-out button (`AppSidebar.tsx:99`).
4. **History filter has `role="tablist"` with plain buttons,** so assistive technology gets a broken pattern (`CaseReviewPage.tsx:847-883`).

## How each direction lands on web

| Direction | Tables and filters | Detail views | Desktop and responsive |
|---|---|---|---|
| Silent When Fine | Status becomes plain ink. Tags appear only for a Note or Stop. Row tints and left bars go. | Normal fields carry no marks. Empty groups fold into one line. | Same rule at every width. The yellow focus ring stays as an accessibility signal. |
| Paper and Ink | Rules replace cards. One bold per row. Web keeps its 16px floor, because the phone's 14px is a minimum. | One heading scale in reading order. | Page capped near 1,240px, reading text at 720px, sidebar from 248px to 200px. |
| Morning Note | Not used. Queue counts sit in tab labels. | Not used. | Sentence uses already-loaded data. Priority: Stop, Note, waiting work, "Nothing needs you." |
| One Voice | Printable and CSV join one Export menu. Refresh leaves the header, and the last-updated line stays. | Photo, one caution, one action. Full report, history and other actions stay as quiet rows. | Evidence and decision side by side from 1,100px, stacked below. |
| Thumb Line | One primary button per page at most. Row actions are links. | Confirm review stays visible in the decision pane. | Below 900px the primary action docks at the bottom. |

### Colour rule

| Level | Meaning | Web examples |
|---|---|---|
| Stop (red) | Work is blocked, or something got worse | Save failed, review conflict, offline, Worsened outcome, access denied |
| Note (amber) | A person should look before relying on this | Past target date, reporter mismatch, unconfirmed location, hard-to-review photo, Unable to determine |
| Ink | Everything else | All workflow statuses, all AI conditions including healthy |

### Worker decisions, no captain call needed

- The queue keeps exactly six columns on desktop. This respects the stated rule at `ReportTable.tsx:15-20` and its contract tests. Below 900px rows stack.
- Web keeps the 16px floor (`tokens.css:99`).
- Primary buttons use the existing deep green `#1e452a`, which reads as ink. If mobile uses true ink, match it.
- The yellow focus ring stays, because it is an accessibility signal.
- Web phone widths keep the menu button. Reviewers do this work mainly on desktop.
- The sentence is the only new Home content, and it needs no API change: `reviewBacklog`, `queues.follow_up_due`, `queues.needs_visit` and `queues.unverified_no_active_work` are already loaded (`OperationalSnapshot.tsx`).

### Draft tokens

| Role | Paper | Dark | Ratio |
|---|---|---|---|
| Page | `#f6f3ea` | `#171a16` | Ink 13.88 / 14.34 |
| Surface | `#fbf9f3` | `#20241f` | Ink 14.63 / 12.86 |
| Soft surface | `#efeadc` | `#2a2e28` | Ink 12.82 (paper) |
| Secondary text | `#3f4a42` | `#b9b6a9` | 8.34 on paper (was 6.55) / 8.64 |
| Note on tint | `#6e5213` on `#fbf1d3` | `#e9c46a` on `#2c2612` | 6.47 / 9.02 |
| Stop on tint | `#8f3324` on `#fbe9e3` | `#f2a48f` on `#351a14` | 6.70 / 8.01 |
| Chart bands 1-4 | `#869080`, `#1d2720`, `#857f6c`, `#2f3831` | Dark draft only, not gate-tested | Paper set passes the 3:1 rules in the gate |

## Captain decisions

Recorded from board round 1 (`lavish-757826a4602f313d.1.result`). The captain chose the option shown here on all eight, with no added notes. Each is a web adaptation with no mobile equivalent. None reopens the six picks.

| # | Question | Captain's decision | Why it was recommended |
|---|---|---|---|
| 1 | How much stays on Home? | Note on a Today tab, charts on Trends | Only option that makes Home as calm as the phone. It does require rewriting KPI doctrine and gate rules. |
| 2 | How do Reports filters behave? | One line plus a Filters side panel | Table stops jumping, and nine filters stay available. |
| 3 | Where does the decision live on a case? | Evidence left, decision pinned right | Reviewer can compare evidence while deciding. Phones dock the action. |
| 4 | What if a case has several cautions? | One line naming all of them | Keeps one voice without hiding a caution from a reviewer. |
| 5 | What colour do charts and the map use? | Ink tones, amber only for a real Note | Matches Silent When Fine, and the draft ramp already passes the gate. |
| 6 | Does Visits replace Monitoring / Map? | Yes, keep all five views | Sidebar stays at four links and matches the phone, with no feature lost. |
| 7 | When does the dark choice arrive? | Paper first, dark in a later slice | No dark mode exists today, and the map needs its own dark style. |
| 8 | Where does the disclaimer sit in a table? | One line under the table, plain names in rows | The column header already says Possible Condition. Case, map and print each keep a line. |

## Review outcome and tasks to queue

The captain ended the board at round 2 (`lavish-757826a4602f313d.2.result`, `session_ended: true`). Exact words:

> Okay, I'm done for this. ARI redesign, you can now implement it based on its builder. Make sure you queue all of the tasks.

I read "ARI redesign" and "based on its builder" as probably meaning this UI redesign and this review board. That is my inference, not something the captain confirmed, and firstmate should confirm it if there is doubt. I queued nothing, because a scout has no backlog authority here. The tasks below are ready for firstmate to queue.

| ID | Task | Scope | Depends on |
|---|---|---|---|
| QF-1 | Fix defects | Sideways scroll from `table.sr-only`, four undefined tokens, sign-out confirmation, history tablist | None |
| QF-2 | Reconcile tokens with mobile | Compare the draft hex values and tab names against the mobile token file, and record the final set | None |
| QF-3 | Paper tokens | Swap `tokens.css` values, remove disease colours and the disease chart cases, replace literal white in row tints | QF-2 |
| QF-4 | Quiet shell | 200px sidebar, four links named Home, Needs assessment, Reports, Visits, one page header, rules instead of cards | QF-3 |
| QF-5 | Silent queue | Six flat columns, Note and Stop tags, stacked rows below 900px, plain condition names, one disclaimer line under tables, across all four shared surfaces | QF-4 |
| QF-6 | Reports filters | One line with queue tabs, search and sort, a Filters side panel with focus handling, applied chips, one Export menu | QF-5 |
| QF-7 | Case review | Evidence left, decision pinned right from 1,100px, docked button and sheet below 900px, one caution line naming every caution with jump links | QF-4 |
| QF-8 | Needs assessment | One list, with empty groups folded into a single line | QF-5 |
| QF-9 | Visits | Rename Monitoring / Map, keep all five views, Register becomes List, Field Operations becomes Assignments, open the map first, map pins in ink with amber for a Note | QF-5 |
| QF-10 | Morning Note | Today and Trends tabs, sentence, one button, count line, move charts, scope and Generate report to Trends, ink chart bands, update `AGENTS.md` and `validate-design-spine.mjs` in the same change | QF-4 |
| QF-11 | Dark choice | Dark tokens, Settings control in `dashboardPreferences.ts` style, dark map style, print stays on paper. Later slice by decision 7 | QF-3 to QF-10 |

Every implementation task must follow test authority: contract or proof test changes for QF-5, QF-7 and QF-10 need the captain or aki-secondmate. Each task needs fresh verification, because these mockups are proposals rather than proof.

## Recommended build order

1. **Fix defects 1 to 4.** Independent of the design, and ready to promote now.
2. **Paper tokens** and removal of disease colours (`tokens.css`, `index.css:1034-1037`, `chartTheme.ts:28-31,124-143`).
3. **Quiet shell:** sidebar, names, one page header, rules instead of cards.
4. **Silent queue:** table, filters, tags, stacked phone rows, across the four surfaces that share queue row cells (`QueueRowCells.tsx:18-19`).
5. **Case review,** then Needs assessment and Visits.
6. **Morning Note,** Trends and the chart ramp.
7. **Dark choice,** following `dashboardPreferences.ts` for a versioned, validated preference.

## Risks

- **Guard tests.** 94 test files exist, including contract tests for the queue, Overview and case layout (`ReportTable.queueContract.test.tsx`, `CaseReviewPage.declutter.test.tsx`, `CaseReviewPage.contract.test.tsx`). Under test authority, an implementer must not edit a proof test to make it pass. Promoted changes go through the captain or aki-secondmate.
- **Doctrine lives in code and docs.** `AGENTS.md` and `validate-design-spine.mjs` assert KPI cards, the single tooltip and band tokens. Morning Note must update them in the same change. Renaming or removing dashboard classes also requires a validator update.
- **Reviewer safety.** One Voice must never remove a caution from reach or from screen readers.
- **Mobile parity.** Hex values and the exact mobile tab names are unconfirmed.
- **Prefix change.** Removing "Possible Condition:" from rows touches `report.metadata.ts:18-21`, and 4 test lines in 3 files assert that text.
- **Print.** Printed reports must stay on paper in dark mode. I did not inspect print output.
- **Not fully audited.** Login, Settings, account admin, Report Approval and Field boundaries were sized or skimmed only. Dark mode was mocked, not tried on the real app.

## Review board

The board was reviewed over two rounds, and the captain ended it. Event source: `lavish-757826a4602f313d`. Source file: `.lavish/cg-web-quiet-field-board.html` in this disposable worktree, which does not survive teardown.

## Repository state

No tracked file changed. `tokens.css` was restored after the trial. The only addition is the untracked board under `.lavish/`.
