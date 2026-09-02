# Project Context

Fill this file with facts specific to the current project. Keep it concise and current.

## Purpose

What problem does this project solve, and for whom?

## Stack

- Application/framework:
- Language/runtime:
- Frontend:
- Backend:
- Database:
- External services:
- Deployment target:

## Architecture

Describe major modules, boundaries, entry points, and important data flows.

## Important conventions

List repository-specific conventions that an engineering agent must preserve.

## Security and data sensitivity

Describe authentication, authorization, sensitive data, trust boundaries, and important security assumptions.

## External contracts

List APIs, webhooks, schemas, files, queues, integrations, or interfaces that must remain compatible.

## Verification

Reference the project's real lint, typecheck, test, build, E2E, and manual verification commands.

## Constraints

Document technical, product, platform, compatibility, or academic constraints.

## Current priorities

List the current development priorities.

## Known debt or limitations

Record only limitations that materially affect implementation decisions.

# Project agent instructions

The following AkiDev guidance is retained here as project context; the committed AGENTS.md contains the shared AkiDev template content.
# AkiDev Core Agent Rules

This repository uses AkiDev's project-local engineering conventions.

The current user request, repository evidence, and these rules are authoritative. Load additional rules and skills only when relevant.

## 1. Scope and safety

- Work only inside this repository unless the user explicitly asks otherwise.
- Never modify global Codex, OpenCode, shell, operating-system, editor, package-manager, or credential configuration as a side effect of project work.
- Never write to `~/.codex`, `~/.config/opencode`, `~/.agents`, shell profiles, `/etc`, or unrelated repositories unless explicitly requested.
- Preserve user work. Inspect `git status` before editing when Git is available.
- Never overwrite, revert, reset, stash, delete, or rewrite unrelated user changes.
- Treat secrets, credentials, tokens, `.env` contents, production data, and personal data as sensitive.
- Do not expose secret values in output, logs, commits, examples, or generated files.
- Ask before destructive or externally consequential actions: deleting data/files, migrations with data risk, production changes, deployments, publishing, commits, pushes, rebases, resets, force operations, dependency installation/update, or credential access.
- Approval is operation-specific. A previous approval does not authorize a future risky operation.

## 2. Autonomy

Resolve facts that are discoverable from the repository before asking the user.

Proceed autonomously when:
- the requested behavior is clear;
- the change is reversible and project-local;
- repository conventions establish the expected implementation;
- no material product decision is required;
- no risky external side effect is required.

Stop and ask when:
- two reasonable product behaviors would produce materially different outcomes;
- a required secret, credential, external account decision, or production action is missing;
- destructive data behavior is required;
- the user must choose a compatibility or migration tradeoff;
- repository evidence contradicts the request and the conflict cannot be safely resolved.

Do not ask questions merely because implementation requires investigation.

## 3. Task classification

Classify work before choosing a workflow.

### Tiny

Typical characteristics:
- isolated local change;
- one or two closely related files;
- no public API, schema, authentication, authorization, dependency, deployment, or architecture impact;
- expected behavior is clear.

Workflow:
1. inspect the focused code path;
2. reproduce or establish the issue;
3. make the smallest complete change;
4. run targeted verification;
5. inspect the diff;
6. report.

### Normal

Typical characteristics:
- several related files;
- new reversible feature or behavior;
- internal interfaces may change;
- moderate testing or integration work.

Workflow:
1. inspect Git state;
2. inspect relevant existing patterns;
3. establish acceptance criteria;
4. write a compact implementation plan;
5. implement in cohesive increments;
6. run targeted checks, then broader checks if justified;
7. review the diff independently when practical;
8. report evidence and remaining gaps.

### High risk

Automatically treat work as high risk when it materially involves:
- authentication or authorization;
- secrets or credentials;
- file uploads or untrusted input;
- payments or financial behavior;
- database migrations or destructive data operations;
- privacy-sensitive or regulated data;
- production configuration;
- deployment or publishing;
- broad architecture changes;
- security controls;
- irreversible external side effects.

Workflow:
1. architecture/risk analysis;
2. explicit affected contracts and data flows;
3. rollback or recovery strategy;
4. scoped implementation;
5. security/data review;
6. independent review;
7. full relevant verification;
8. clearly report any unverified risk.

Escalate risk when investigation reveals wider impact. Never silently downgrade risk.

## 4. Progressive context

Always start with:
- the current request;
- this `AGENTS.md`;
- the active role/skill instructions;
- the smallest relevant project files.

Load conditional material only when needed:
- `PROJECT_CONTEXT.md`;
- `PROJECT_CHECKS.md`;
- `PROJECT_STACK.md`;
- `DATABASE_GUIDE.md`;
- `.agents/rules/*`;
- API contracts;
- schema/migrations;
- ADRs;
- framework documentation;
- external library documentation.

Do not preload old task logs, every ADR, full history, generated files, or unrelated modules.

Prefer:
1. repository-local facts;
2. framework-owner documentation;
3. current dependency documentation;
4. trustworthy upstream sources;
5. general model knowledge.

When documentation and repository behavior differ, call out the discrepancy.

## 5. Engineering principles

- Prefer the simplest design that fully satisfies the requirement.
- Prefer existing project patterns unless there is a concrete reason to change them.
- Keep abstractions proportional to actual repetition and complexity.
- Avoid speculative generalization.
- Make invalid states difficult to represent where practical.
- Keep interfaces narrow and explicit.
- Separate pure logic from I/O and side effects when it improves testability.
- Handle errors at the layer that has enough context to act on them.
- Validate data at trust boundaries.
- Preserve backwards compatibility unless a breaking change is explicitly accepted.
- Avoid hidden global state.
- Prefer deterministic behavior.
- Prefer readable code over clever code.
- Comments should explain why, constraints, or non-obvious behavior—not narrate obvious syntax.
- Do not add dependencies when the platform or existing stack already solves the problem adequately.

## 6. External tools and skills

Read `.akidev/config` to understand selected integrations. Resolve selected commands from the active shell `PATH`; use project npm actions such as `npm run check:web` for project behavior. Other integrations may still document a project-local wrapper where their integration requires it.


Third-party integrations are optional.

- Do not install, update, register, or globally configure a third-party tool without explicit user intent.
- Do not assume an MCP, CLI, or skill exists. Detect availability first.
- Use Context7 or equivalent documentation tooling for version-sensitive external APIs when useful, not reflexively.
- When GitHub MCP is available, prefer local Git for local working-tree state and use GitHub MCP for remote repositories, PRs, issues, and Actions. Never inspect or expose `GITHUB_PERSONAL_ACCESS_TOKEN`.
- Ask before remote GitHub mutations such as creating/editing issues, comments, pull requests, workflow dispatches, releases, or other externally visible state.
- Use Graphify only when repository-wide structure or hidden dependency analysis would materially help.
- Use browser automation when Web UI behavior requires it, not for unrelated API work.
- For non-trivial architecture, debugging, runtime, or verification work, consult the project `akidev-tool-routing` skill and load the smallest matching specialized skill. Never install missing shared workstation tools.
- Keep this Web/API repository focused on its Web and API checks; do not run device tooling or device E2E here.
- Framework-owner guidance wins when third-party skills conflict with the framework's official behavior.
- Repository-specific instructions win over generic style guidance unless doing so would introduce a correctness or security defect.

## 7. Verification

Verification should match risk.

Start narrow:
- syntax/typecheck for changed code;
- focused unit/integration tests;
- lint on changed scope when supported.

Expand when justified:
- related test suite;
- build;
- E2E;
- browser/device verification;
- security checks.

Never claim a check passed unless it actually ran and succeeded.

Distinguish:
- `PASS` — required relevant checks ran and passed.
- `PASS_WITH_GAPS` — implemented successfully, but one or more non-blocking verification gaps remain.
- `FAIL` — implemented or attempted, but a relevant check failed.
- `INCOMPLETE` — the task could not be completed or required evidence could not be obtained.

`SKIPPED`, `UNAVAILABLE`, and "not run" are gaps, not passes.

## 8. Failure handling

When a command fails:
1. read the actual error;
2. determine whether the failure is caused by the change, environment, configuration, or unrelated baseline state;
3. make one evidence-based corrective attempt when appropriate;
4. avoid repeatedly running the same failing command without changing the relevant condition;
5. report the blocker when progress requires user action or an unsafe assumption.

Never hide failing checks by deleting tests, weakening assertions, disabling validation, or broadening ignores without a justified requirement.

## 9. Final reporting

A completion report should state:
- what behavior changed;
- important files touched;
- verification actually run and its result;
- manual checks required for UI/workflow changes;
- remaining risks, gaps, or follow-ups.

Keep reports proportional to the task.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
