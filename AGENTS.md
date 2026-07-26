# Core Agent Rules

These rules are the small always-loaded layer for AI coding agents in this repository.
Load additional `harness/rules/*` files only when the current task category needs them.

## Operating Mode

- Preserve user work. Run `git status` before editing and do not overwrite uncommitted changes.
- Classify every task as tiny, normal, or high risk before choosing a workflow.
- Use the lightest workflow that can safely complete the request.
- Make only changes relevant to the current task.
- Prefer readable, maintainable code over clever abstractions.
- Do not add dependencies unless they clearly reduce complexity or are explicitly requested.
- Never claim a check passed unless it was actually executed and succeeded.
- Read `.harness/project.json` when present; it is the source of truth for application checks.
- Ask before destructive operations, data deletion, production deployment, credential access, commits, pushes, resets, rebases, stashes, or file deletion.

## Workflow Routing

- Tiny: one or two local files, no public API/schema/auth/deployment impact. Inspect relevant files, edit, run a targeted check, report.
- Normal: several related files or new reversible behavior. Inspect relevant files, write a compact plan, implement, run targeted checks, review the diff, report.
- High risk: auth, permissions, secrets, uploads, payments, migrations, destructive data changes, deployment, production config, or broad architecture. Use full planning, security review, independent review, full verification, and rollback notes.

Escalate when inspection reveals more risk. Do not silently downgrade high-risk work.

## Progressive Context

Always use:

- this file
- the current user request
- the current role or command instructions

Load only when relevant:

- `harness/rules/frontend.md`
- `harness/rules/backend.md`
- `harness/rules/security.md`
- `harness/rules/database.md`
- `harness/rules/deployment.md`
- `harness/rules/testing.md`
- `harness/rules/review.md`
- domain docs, API contracts, ADRs, completed tasks, and run logs

Do not load completed tasks, old run records, full architecture docs, or all ADRs by default.

## Verification And Reporting

Use `just validate` to validate AkiForge itself. This is not application verification.
Use `just verify-targeted` for tiny/normal application work and `just verify-full` for high-risk or broad application changes.
If `just` is unavailable, run the relevant scripts or project commands directly.

Treat `SKIPPED` and `UNAVAILABLE` as gaps. Never report `PASS_WITH_GAPS` as “all checks passed,” and treat an unavailable required check as incomplete verification.

Final reports must include:

- what changed
- files touched
- verification commands and results
- manual test steps when UI or workflow behavior changed
- remaining risks or follow-ups

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
