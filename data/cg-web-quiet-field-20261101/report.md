# Quiet Field for CaneGuard web: report

## QF-2 reconciliation: final token set and tab names

Task: `cg-web-qf2-tokens-20261101`. Date: 2026-11-01. Base commit: `877900e`.
Decision aid only. No stylesheet, component, route, or test changed for this
task; the additions are this record plus `inputs.json`, `compare.py` and the
two vendored source reports in this directory.

### Sources compared

- **Web draft:** "Draft tokens" in the quiet-field scout report, vendored
  verbatim at `sources/scout-report.md` (copy of the firstmate data file
  `cg-web-quiet-field-20261101/report.md`, 2026-11-01). The scout report keeps
  its own in-repo path under `sources/`, so this QF-2 record does not shadow it.
- **Mobile tokens:** "Proposed tokens" under Paper & Ink and the captain
  decisions `quiet-tabs` and `quiet-disease-color` in the mobile calm scout
  report, vendored verbatim at `sources/mobile-report.md` (copy of
  `cg-mobile-ux-calm-20261101/report.md`, 2026-11-01).
- **Current web tokens:** `src/styles/tokens.css` on the base commit, plus the
  literal copies at `src/components/fieldValidation/ValidationMap.tsx:37,39,41,42`
  and `src/components/fieldValidation/localBasemap.ts:21`.
- **Current web names:** `src/components/navigation/AppSidebar.tsx` on the base
  commit. Driven with the admin fixture, an admin session renders eight links
  (a reviewer session renders five): the four monitored here (Dashboard, Needs
  assessment, Reports, Monitoring / Map), three admin-only entries (Report
  Approval, User Management, Admin Settings) and Settings, under the group
  labels Monitoring, Administration and Account. The Administration group and
  its three entries are admin-only.

### Reconciliation rule

The mobile token file is canonical for every shared semantic role: Quiet Field
is one design system, and the mobile values are captain-accepted and all pass
AA. Web keeps only deliberate web adaptations: the surface split, the existing
primary green, the dark set (mobile defines no dark paper tokens), and the
gate-tested paper chart ramp (mobile defines no band ramp). Close calls are
noted, not hidden; QF-3 may still ask the captain to flip any of them.

Two binding rules keep the set applicable without invention:

- **A hex is not a role.** Where one value serves two roles, the token decides:
  `#ffffff` stays as `--color-inverse-text` while `--color-surface` moves;
  `#1e452a` stays as `--color-primary-dark` while `--kpi-band-2` moves; and
  `#2d6b40` stays for both `--color-primary` and `--color-success`.
- **A role binds every token and literal that carries it.** Tokens that share a
  role keep one value (secondary text and muted; danger and error; both tints),
  and a literal copy moves with its token in the lane that owns the file.

### Final token set (role → token → value)

| Role | Token(s) in `src/styles/tokens.css` | Paper | Dark | Status |
|---|---|---|---|---|
| Ink text | `--color-text` | `#1d2720` | `#EDE9DF` | Paper unchanged; dark ink added by QF-2 |
| Page background | `--color-page` | `#F8F5EE` | `#171a16` | Mobile. `--color-page` is also the sidebar text on `--color-primary-dark` (`src/index.css:148-149`, 9.94:1) |
| Surface | `--color-surface` | `#fbf9f3` | `#20241f` | Web draft, kept. Mobile has one background; web keeps the split for fields and raised rows |
| Soft surface | `--color-surface-soft` | `#efeadc` | `#2a2e28` | Web draft, kept, same reason |
| Secondary text | `--color-secondary-text`, `--color-muted` | `#4A5650` | `#b9b6a9` | Mobile. Both tokens take one value, as they do today |
| Note fg / tint | `--color-warning`, `--color-warning-soft` | `#8A4A06` / `#F7EBD3` | `#e9c46a` / `#2c2612` | Mobile; 5.80:1 on the tint |
| Stop fg / tint | `--color-danger`, `--color-error`, `--color-danger-soft`, `--color-error-soft` | `#9B2F2F` / `#F6E3DE` | `#f2a48f` / `#351a14` | Mobile; 5.97:1 on the tint. Both fg tokens and both tint tokens take one value |
| Hairline / rule | `--color-border` | `#DDD8C9` | not set | Mobile. Replaces the cool border with a warm rule |
| Primary green | `--color-primary`, `--color-primary-dark` | `#2d6b40` / `#1e452a` | not set | Unchanged. `--color-primary` is the primary button fill, `--color-primary-dark` the hover, link and sidebar green |
| Focus ring | `--color-focus`, `--focus-ring` | `#ffdd00`, ring plus ink `#1d2720` | not set | Unchanged. Accessibility signal, stays |
| Inverse text | `--color-inverse-text` | `#ffffff` | not set | Unchanged. Text on ink and primary fills |
| Chart bands 1-4 | `--kpi-band-1` to `--kpi-band-4` | `#869080`, `#1d2720`, `#857f6c`, `#2f3831` | not set | Web draft, kept. Gate-tested; neighbouring pairs 4.63 / 3.85 / 3.03 / 3.65 |

The dark set needs a dark ink. Neither source states one: the only ink row is
`#1d2720`, "unchanged, both sides", which sits at 1.14:1 on the dark page
`#171a16`. QF-2 sets dark ink and headings to `#EDE9DF`, the paper page
`#F8F5EE` deepened one step, at 14.49:1 on the dark page, 12.99:1 on the dark
surface and 11.40:1 on the dark soft surface. Dark hairline, dark chart bands,
the dark map style and the dark focus ring are not set here; QF-11 derives and
gates them with the rest of the dark slice.

### Unchanged and out of scope

Every other colour-bearing token keeps today's value and is not part of the
final set:

| Token group | Status |
|---|---|
| `--color-surface-muted` `#f8faf8`, `--color-surface-tint` `#e2ece3`, `--color-border-strong` `#98aba0` | Unchanged. Live in `src/index.css`; `--color-surface-tint` and `--color-border-strong` also frame the KPI status indicator, and `--color-border-strong` is read by `src/components/dashboard/chartTheme.ts` |
| `--color-primary-light` `#447a54`, `--color-primary-tint` `#e8f2ea`, `--color-accent` `#d6cc99`, `--color-accent-dark` `#b8ad73`, `--color-brand` `#2d6b40`, `--color-brand-hover` `#225331` | Unchanged |
| `--color-success` `#2d6b40`, `--color-success-soft` `#e5f2e8` | Unchanged |
| `--brand-*` (8 tokens) | Unchanged, brand palette |
| `--badge-*` (8 tokens) | Unchanged, timeline badges, out of scope |
| `--login-page-mint-*` (3 tokens) | Unchanged, login portal, out of scope |
| `--shadow-*` (3 tokens) | Unchanged, ink at 5-12% alpha, out of scope |
| `--disease-*` (4 tokens) | Unchanged today; retired when QF-3 removes the disease colours (captain pick `quiet-disease-color`) |
| Type, spacing, grid, chart heights, radii, control heights, transitions | Unchanged. QF-2 does not touch them, and web keeps the 16px text floor |

### Retired draft values and replaced current values

These draft values exist nowhere in the codebase, so no lane has anything to
remove: `#f6f3ea` (draft page), `#3f4a42` (draft secondary), `#fbf1d3` (draft
note tint), `#8f3324` (draft stop fg), `#fbe9e3` (draft stop tint).

These values ship today and are replaced by the token that owns them. They are
not retired: they stay until the owning lane lands the final value.

| Shipped today | Where it is | Becomes |
|---|---|---|
| `#6e5213` | `--color-warning`; literal `ValidationMap.tsx:42` (map default) | `#8A4A06` |
| `#fef5d6` | `--color-warning-soft` | `#F7EBD3` |
| `#4d5c52` | `--color-secondary-text`, `--color-muted`; literal `ValidationMap.tsx:39` | `#4A5650` |
| `#a64637`, `#fbeee8` | `--color-danger` and `--color-error`, and their soft tints | `#9B2F2F`, `#F6E3DE` |
| `#cbd8ce` | `--color-border` | `#DDD8C9` |
| `#edf3ed` | `--color-surface-soft`; literal `localBasemap.ts:21` (map background chosen to match the token) | `#efeadc` |
| `#f4f7f3`, `#ffffff` (surface) | `--color-page`, `--color-surface` | `#F8F5EE`, `#fbf9f3` |
| `#749926`, `#1e452a` (band 2), `#ae8a1b`, `#45370b` | `--kpi-band-1` to `--kpi-band-4` | `#869080`, `#1d2720`, `#857f6c`, `#2f3831` |

Two of those values carry a second role that does not move: `#ffffff` stays
as `--color-inverse-text` and `#1e452a` stays as `--color-primary-dark`.
`#2d6b40` at `ValidationMap.tsx:37` stays for `verified_by_staff`, and
`#98aba0` at `ValidationMap.tsx:41` is `--color-border-strong` and also stays.
Every other consumer reads `var(--token)` in `src/index.css`, so it moves with
the token. Two shapes of that matter: `--color-warning` also rings the KPI
status mark (`StatusIndicator.tsx:8`), which `npm run test:design-spine`
asserts, so QF-3 repaints that graphic when it lands the Note value; and
`--color-page` is also the sidebar text on `--color-primary-dark`, noted in
the role table.

### Final tab names (names)

Web sidebar links (captain decision 6):

| Final name | Replaces (current) | Route unchanged |
|---|---|---|
| Home | Dashboard | Yes |
| Needs assessment | Needs assessment | Yes |
| Reports | Reports | Yes |
| Visits | Monitoring / Map | Yes |

Only these four rows are renamed. The sidebar's Monitoring, Administration and
Account group labels, the three admin-only entries (Report Approval, User
Management, Admin Settings) and Settings keep their current names and routes.

Visits keeps all five existing views; the map opens first; Register becomes
List and Field Operations becomes Assignments (scout QF-9). Home hosts two
tabs, Today and Trends (captain decision 1, scout QF-10): the Morning Note
sentence on Today, charts/scope/Generate report on Trends.

### Cross-platform mapping (mapping)

| Mobile tab | Web sidebar entry | Relationship |
|---|---|---|
| Home | Home | Same word; both host the Morning Note sentence |
| Visits (renamed from "Today's visits", captain `quiet-tabs`) | Visits (renamed from Monitoring / Map, captain decision 6) | Parity achieved: same word on both |
| Activity | — | Mobile-only; web has no Activity tab (`sources/mobile-report.md`, measured-noise table) |
| Scan | — | Mobile-only; web has no Scan tab (`sources/mobile-report.md`, measured-noise table, "Scan is a tab") |
| — | Needs assessment, Reports | Web-only; no mobile equivalent |

Constraints both sides keep: "Possible Condition" and the disclaimer wording
stay verbatim; no routes move on either platform.

### Verification

Re-derived from this directory:
`python3 data/cg-web-quiet-field-20261101/compare.py`. It reads `inputs.json`,
recomputes every ratio below, checks that every colour-bearing token in
`src/styles/tokens.css` has a recorded status here (59 of 59 on 2026-11-01),
and checks that tokens sharing one role keep one value. All checks pass.

| Check | Ratio |
|---|---|
| Ink on final page / surface / soft surface | 14.15 / 14.63 / 12.82 |
| Secondary on page / surface / soft surface | 7.04 / 7.28 / 6.38 |
| Note pair / Stop pair | 5.80 / 5.97 |
| Chart band on final surface, 1-4 | 3.16 / 14.63 / 3.80 / 11.52 |
| Chart band neighbours 1-2 / 2-3 / 3-4 / 4-1 | 4.63 / 3.85 / 3.03 / 3.65 |
| Dark ink on dark page / surface / soft surface | 14.49 / 12.99 / 11.40 |
| Dark secondary on dark page / surface | 8.64 / 7.74 |
| Dark note pair / Stop pair | 9.02 / 8.01 |
| Retired draft: ink / secondary / note / stop on draft paper | 13.88 / 8.34 / 6.47 / 6.70 |
| Shipped ink on dark page, why dark ink is set | 1.14 |

No device or outdoor test ran, per the brief. No code, stylesheet, route or
test file changed; `git status` shows additions only under
`data/cg-web-quiet-field-20261101/`.
