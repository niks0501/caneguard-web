# Quiet Field for CaneGuard web: report

## QF-2 reconciliation: final token set and tab names

Task: `cg-web-qf2-tokens-20261101`. Date: 2026-11-01. Base commit: `877900e`.
Decision aid only. No stylesheet, component, route, or test changed for this task.

### Sources compared

- **Web draft:** "Draft tokens" table in the quiet-field scout report
  (`cg-web-quiet-field-20261101`, firstmate data dir, 2026-11-01). Paper and
  dark values, gate-tested paper chart ramp.
- **Mobile tokens:** "Proposed tokens" under Paper & Ink in the mobile calm
  scout report (`cg-mobile-ux-calm-20261101`, firstmate data dir, 2026-11-01),
  plus the six captain decisions recorded there (`quiet-tabs` in particular).
- **Current web names:** `src/components/navigation/AppSidebar.tsx` on the
  base commit (Dashboard, Needs assessment, Reports, Monitoring / Map).

### Reconciliation rule

The mobile token file is canonical for every shared semantic role: Quiet
Field is one design system, and the mobile values are captain-accepted and
all pass AA. Web keeps only deliberate web adaptations: the surface split,
the existing primary ink, the dark set (mobile defines no dark paper
tokens), and the gate-tested paper chart ramp (mobile defines no band ramp).
Close calls are noted, not hidden; QF-3 may still ask the captain to flip any
of them.

### Final token set (values)

| Role | Final hex | Source | Note |
|---|---|---|---|
| Ink text | `#1d2720` | Unchanged, both sides | Body/heading ink |
| Page background (paper) | `#F8F5EE` | Mobile | Web draft `#f6f3ea` retired; the two differ imperceptibly (ink contrast 14.15 vs 13.88) |
| Surface (paper) | `#fbf9f3` | Web draft, kept | Mobile has a single background; web keeps the split for fields and raised rows |
| Soft surface (paper) | `#efeadc` | Web draft, kept | Same reason as surface |
| Secondary text (paper) | `#4A5650` | Mobile | Web draft `#3f4a42` retired; 7.04:1 on the final page |
| Note fg / tint (paper) | `#8A4A06` on `#F7EBD3` | Mobile | 5.80:1; web draft `#6e5213` on `#fbf1d3` (6.47:1) retired for parity |
| Stop fg / tint (paper) | `#9B2F2F` on `#F6E3DE` | Mobile | 5.97:1; web draft `#8f3324` on `#fbe9e3` (6.70:1) retired for parity |
| Hairline / rule (paper) | `#DDD8C9` | Mobile | Replaces cool `--color-border`; warm rule for paper |
| Primary action ink | `#1e452a` | Web, unchanged | Existing deep green, WCAG-tuned; reads as ink per the scout |
| Focus ring | `#ffdd00` + ink | Web, unchanged | Accessibility signal, stays |
| Chart bands 1-4 (paper) | `#869080`, `#1d2720`, `#857f6c`, `#2f3831` | Web draft, kept | Gate-tested; neighbouring pairs 4.63 / 3.85 / 3.03 / 3.65, all >= 3:1 |
| Dark set | `#171a16` page, `#20241f` surface, `#2a2e28` soft, `#b9b6a9` secondary, `#e9c46a` on `#2c2612` note, `#f2a48f` on `#351a14` stop | Web draft, kept | Mobile defines no dark paper tokens; dark ships in a later slice and is gate-tested then (QF-11) |

Retired web draft values (do not use): `#f6f3ea`, `#3f4a42`, `#6e5213`,
`#fbf1d3`, `#8f3324`, `#fbe9e3`.

### Final tab names (names)

Web sidebar, four links (captain decision 6):

| Final name | Replaces (current) | Route unchanged |
|---|---|---|
| Home | Dashboard | Yes |
| Needs assessment | Needs assessment | Yes |
| Reports | Reports | Yes |
| Visits | Monitoring / Map | Yes |

Visits keeps all five existing views; the map opens first; Register becomes
List and Field Operations becomes Assignments (scout QF-9). Home hosts two
tabs, Today and Trends (captain decision 1, scout QF-10): the Morning Note
sentence on Today, charts/scope/Generate report on Trends.

### Cross-platform mapping (mapping)

| Mobile tab | Web sidebar entry | Relationship |
|---|---|---|
| Home | Home | Same word; both host the Morning Note sentence |
| Visits (renamed from "Today's visits", captain `quiet-tabs`) | Visits (renamed from Monitoring / Map, captain decision 6) | Parity achieved: same word on both |
| Other two mobile tabs | — | Names not stated in the mobile report; unconfirmed, no mapping recorded |
| — | Needs assessment, Reports | Web-only; no mobile equivalent |

Constraints both sides keep: "Possible Condition" and the disclaimer wording
stay verbatim; no routes move on either platform.

### Verification

Comparison re-run from `compare.py` (task data dir,
`/home/aki/projects/firstmate/data/cg-web-qf2-tokens-20261101/compare.py`):
all 12 checks pass. Ink on final page 14.15:1; mobile secondary 7.04:1;
note 5.80:1 and stop 5.97:1 on their tints; all four neighbouring chart-band
pairs >= 3:1. No device or outdoor test ran, per the brief. Only this file
is added; `git status` shows no other change.
