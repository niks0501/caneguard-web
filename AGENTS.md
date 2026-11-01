## Engineering Practice

- Inspect the repository and existing patterns before making changes.
- Before using an unfamiliar CLI subcommand or flag, check that CLI's help; do not assume compatibility with another tool's syntax.
- Prefer the simplest complete solution and avoid unnecessary abstractions or dependencies.
- Keep changes focused, readable, deterministic, and maintainable.
- Before staging, inspect generated and tool-maintained artifact diffs; stage only explicit task-required files and review `git diff --cached` before committing. A `--stat` summary alone is not a staged-diff review. Keep generated Graphify output out of commits.
- Preserve unrelated user work and never overwrite, reset, stash, delete, or rewrite unrelated changes.
- Treat secrets, credentials, tokens, environment values, production data, and personal data as sensitive.
- Do not expose sensitive values in output, logs, commits, examples, or generated files.
- Tool-call arguments are logged too: never embed literal passwords or tokens in shell commands, even for local tests. Use an authorized local credential mechanism without printing its values.
- Ask before destructive actions, production changes, deployments, publishing, force operations, dependency changes, credential access, or other externally consequential actions. Permission to push or open a PR does not authorize a force-push, including `--force-with-lease`; ask separately.
- Resolve facts that can be discovered from the repository before asking the user.
- Ask only when a genuine product decision, missing credential, destructive behavior, or material tradeoff requires user input.

## Graphify

When `graphify-out/graph.json` exists, use Graphify as the first source for understanding repository structure and relationships.

- For codebase questions, start with `graphify query "<question>"`. Run it before source searches, not after them.
- Use `graphify path "<A>" "<B>"` to understand relationships between components.
- Use `graphify explain "<concept>"` for focused explanations of a component or concept.
- Prefer these scoped commands over reading the full graph or performing broad source searches.
- If `graphify-out/wiki/index.md` exists, use it for broad repository navigation.
- Read `graphify-out/GRAPH_REPORT.md` only for broad architecture review or when `query`, `path`, and `explain` do not provide enough context.
- Generated files under `graphify-out/` are ignored local artifacts and do not appear in Git status or diffs; never force-add them.
- After modifying code, run `npm run graphify:refresh` to keep the graph current and contract-valid.
- Include that refresh in the completion checklist: `graphify update .` alone omits normalization and clustering. Report a failed or unavailable refresh rather than silently skipping it.
- When the user explicitly invokes `/graphify`, follow the installed Graphify skill or instructions before doing anything else.

## Verification

- Match verification effort to the risk and scope of the change.
- Start with the smallest relevant automated checks, such as targeted unit tests, integration tests, type checks, and lint.
- Expand to broader tests, builds, E2E, browser, or device verification only when justified.
- Never claim a check passed unless it actually ran and succeeded.
- Never hide failures by deleting tests, weakening assertions, or disabling validation.
- Dashboard layout rules live in `src/index.css`; `npm run test:design-spine` asserts named selectors in `scripts/validate-design-spine.mjs`, so removing or renaming a dashboard class requires updating that validator in the same change.
- The dashboard has exactly one tooltip: `.kpi-card__support-tip` on KPI 1, revealed on hover and `:focus-visible` and pointed at by the card link's `aria-describedby`. It must stay clipped rather than `display: none` while hidden, or the description stops resolving; `npm run test:design-spine` enforces both.
- Dashboard control memory lives in `src/components/dashboard/dashboardPreferences.ts`: a versioned, validated `localStorage` payload holding the scope ruler (mode, month, custom window) and the map layer. Add new persisted Overview controls there, restore them lazily in `useState`, and keep the corrupt/stale-value fallback covered by `src/components/dashboard/dashboardPreferences.test.ts`.
- Dashboard graphics draw solid fills only: the KPI graphics (sparkline, waiting-age radial, schedule bar, status indicator), the decision charts and every legend swatch all take a flat `--kpi-band-*` solid from `src/styles/tokens.css`, indexed by `src/components/dashboard/kpiBandEncoding.ts`. `npm run test:design-spine` fails if a pattern or texture returns, if neighbouring fills drop below 3:1 (including the radial ring's 4-1 join), or if a band loses its gap or separator stroke. Tune a new band there, never with ad-hoc colours in a component.

## Dashboard Visual Doctrine

- Minimal text: dashboard surfaces carry data, not explanation. Delete retired prose rather than shortening it, and never add notes that restate what a chart or table already shows.
- Every displayed time is 12-hour Asia/Manila with an explicit meridiem marker (`src/lib/formatters.ts`); never 24-hour.
- Graphics draw flat solids from the `--kpi-band-*` ramp (`src/components/dashboard/kpiBandEncoding.ts`), never patterns, textures or ad-hoc colours.
- Be honest about scope and shade: never label a scoped or filtered list as unfiltered or all-periods, and keep neighbouring graphic fills distinguishable rather than relying on a subtle tint.

## Failure Handling

- Read the actual error before attempting a fix.
- Determine whether a failure comes from the change, environment, configuration, or existing repository state.
- Make evidence-based corrective attempts rather than repeatedly rerunning the same failing command unchanged.
- Report blockers clearly when further progress requires user action or an unsafe assumption.

## No-Mistakes Test Policy

During no-mistakes validation, never run E2E, UI, browser, device, or interactive acceptance tests such as agent-device, Playwright, Appium, Detox, Cypress, or Selenium.

Use only fast non-interactive automated checks, including targeted unit tests, integration tests, type checks, lint, and static validation.

E2E validation belongs to the implementation phase and must not be repeated by no-mistakes unless explicitly requested.

## Completion

- Report what changed, what verification actually ran, and any remaining meaningful risks or gaps.
- When reporting a PR, state whether required CI checks passed, failed, or remain pending; explicitly say when no checks are configured or their status is unknown. Local test results do not establish CI success.
- Keep reports proportional to the task.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
