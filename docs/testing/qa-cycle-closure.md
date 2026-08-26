# Close or abandon a coordinated QA cycle

`npm run qa:close` is the terminal lifecycle command for a coordinated `qa/YYYY-MM-DD-NN` candidate.
It keeps approval and abandonment as separate, explicit states and writes the terminal state back to the ignored cycle record.
It also creates or comments on a GitHub QA-cycle issue so the final decision is discoverable without the planning conversation.

## Inspect the active cycle

Run the status command before making a terminal decision.

```bash
QA_ID=qa/YYYY-MM-DD-NN

npm run qa:close -- status \
  --web-repo . \
  --qa-id "$QA_ID"
```

The status report names the QA ID, final state, exact source commits, EAS identity, branch policy, staging shutdown state, local record, and GitHub release record.
The local record is `.qa-staging/qa-cycles/<cycle>.json` and is intentionally ignored because it contains host-specific paths and operational evidence.
Do not put credentials, bearer tokens, private configuration values, or real user data in any QA record or GitHub issue.

The approval path requires a ready reconciliation check when a QA fix record exists.
A cycle without a reconciliation record is treated as having no recorded QA fixes and is still required to have passed the human QA decision.

## Approve a passing cycle

Approval is never inferred from automated checks, a passing reconciliation check, CI, or a command being run by a captain.
The operator must provide both the explicit confirmation flag and the name of the human who made the final decision.
The final result must also be supplied explicitly.

```bash
npm run qa:close -- approve \
  --web-repo . \
  --mobile-repo /path/to/caneguard-mobile \
  --qa-id "$QA_ID" \
  --confirm-human-approval \
  --human-approver <github-user-or-human-name> \
  --final-result pass \
  --approval-date 2026-08-26
```

The command verifies that both matching branches still exist, that the Mobile branch still matches the Mobile source recorded for the EAS artifact or update, and that any changed Web/API candidate has ready reconciliation evidence.
It then stops the tracked Tailscale Funnel and QA API/Web processes through `qa:staging stop`.
The command does not reset or delete `caneguard_staging`.

A successful approval record contains the QA ID, final Mobile commit, final Web/API commit, EAS build or update identity, final result `PASS`, approval date, human approver, staging retention evidence, and branch retention evidence.
Both `qa/*` branches remain available for inspection.
An approval tag may be added separately by a developer or FirstMate captain, but no tag is required for approval.

By default, the command creates a new issue in the repository identified by the Web checkout's `origin` remote.
Use `--github-repo OWNER/REPOSITORY` to make the destination explicit.
Use `--github-issue NUMBER` when a dedicated QA-cycle issue already exists and the command should add the final release record as a comment.

## Abandon a failed or materially changed cycle

Abandonment is distinct from approval and requires an explicit confirmation, a human confirmer, and a non-secret reason.
Use abandonment when the candidate failed QA or when a materially different replacement is needed.

```bash
npm run qa:close -- abandon \
  --web-repo . \
  --mobile-repo /path/to/caneguard-mobile \
  --qa-id "$QA_ID" \
  --confirm-abandonment \
  --abandoned-by <github-user-or-human-name> \
  --reason "The candidate requires a materially different API contract." \
  --final-result abandoned
```

The command stops the tracked Tailscale Funnel and QA API/Web processes before cleanup.
It removes the Web candidate worktree and the Mobile candidate worktree recorded by `qa:open` when those worktrees still exist.
It then deletes the matching local branches and any matching `origin` branches from both repositories.
Remote GitHub branch deletion uses the `gh-axi` API and requires the operator's existing GitHub authorization.

An abandoned cycle is recorded with state `ABANDONED` and final result `FAILED` or `ABANDONED`.
It never receives approval fields and is never reported as `APPROVED`.
The cycle record remains in `.qa-staging/qa-cycles/` so the QA ID remains permanently reserved and its replacement cannot silently reuse the abandoned identifier.

Create the next candidate with a new QA ID and a new EAS identity when the source or runtime has materially changed.
The next cycle command scans both repositories and retained cycle records, so the automatic date sequence skips abandoned identifiers.
Do not force `--qa-id` to reuse an abandoned identifier.

## Release-record recovery

The command records the local terminal state before publishing the GitHub issue.
If GitHub publication fails, the local record remains terminal with `releaseRecord.status` set to `PENDING` and includes the retry error.

Retry the discoverable record after fixing authorization or supplying the destination explicitly.

```bash
npm run qa:close -- publish \
  --web-repo . \
  --qa-id "$QA_ID" \
  --github-repo OWNER/REPOSITORY
```

`publish` does not restart staging, reset the database, recreate branches, or change the terminal decision.
It only publishes the existing terminal evidence to the GitHub QA-cycle issue.

## Staging retention and the next cycle

`qa:close` uses the existing shutdown path and leaves the `caneguard_staging` schema and seeded data intact for post-QA investigation.
The next `qa:open` and `qa:staging cycle` workflow is the explicit destructive boundary that resets storage, recreates the schema, and reseeds the database.

Use `npm run qa:staging -- public-stop` when only public ingress must be disabled while private investigation continues.
Use `npm run qa:staging -- stop` when the complete staging service process should be stopped.
The closure command uses the complete stop operation.

A cycle's final state can be rediscovered with the local status command or from its GitHub QA-cycle issue.
The release record is evidence of the exact candidate and human decision, not a substitute for retaining approved source branches.
