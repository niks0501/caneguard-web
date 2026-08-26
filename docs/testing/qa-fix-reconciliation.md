# QA fix reconciliation

This procedure records how a QA-discovered fix moves between the frozen `qa/*` candidate and ongoing `main` development.
It is an operator workflow, not branch automation.
It never creates, merges, deletes, or rewrites branches.

The normal FirstMate worker base is not assumed to be `qa/*`.
A fresh worker may be detached or based on `main`, so the operator must select and record the fix origin explicitly.
The ignored record below `.qa-staging/qa-cycles/` keeps the selected origin, worker checkout evidence, exact history commits, equivalence evidence, retest evidence, and regression-coverage decision together.
Do not put credentials, bearer tokens, private URLs, or real user data in the record.

## Inspect the active candidate

Run these commands from the Web/API repository before beginning the fix.

```bash
QA_ID=qa/YYYY-MM-DD-NN
QA_BRANCH="$QA_ID"

pwd -P
git rev-parse --show-toplevel
git branch --show-current
git rev-parse --verify HEAD
git show-ref --verify "refs/heads/$QA_BRANCH" || git show-ref --verify "refs/remotes/origin/$QA_BRANCH"
```

The active candidate is the exact branch named by the open QA cycle record and the staging configuration.
Do not infer it from the current worker branch.
If the candidate is not available locally, fetch only the named branch before proceeding.

```bash
git fetch origin "$QA_BRANCH"
```

The reconciliation record is created once for each QA-discovered fix.
The `begin` command captures the current worker branch and commit as evidence, but it uses only the explicitly selected `--origin` and `--source-commit` as the fix origin.

## Begin from `main` deliberately

Use this path when the captain chooses ordinary development first.
The worker may start anywhere, including a detached checkout, and does not need to be switched to `qa/*`.

First capture a full commit already on `main` and create the record.

```bash
MAIN_BASE="$(git rev-parse refs/heads/main 2>/dev/null || git rev-parse refs/remotes/origin/main)"

npm run qa:reconcile -- begin \
  --repo . \
  --qa-id "$QA_ID" \
  --qa-branch "$QA_BRANCH" \
  --origin main \
  --source-commit "$MAIN_BASE" \
  --fix-id QA-<number> \
  --summary "short non-secret description of the QA defect"
```

Create a normal fix branch from the selected `main` source and implement the defect fix.
Open the normal pull request into `main` and let the configured merge authority merge it.
Do not claim that a commit is on `main` until the merged history has been fetched and inspected.

```bash
git switch -c fix/qa-<number> "$MAIN_BASE"
# implement the fix and add stable regression coverage when the defect has a valuable test seam
git add <paths>
git commit -m "fix: <short description>"
# push this fix branch and open the normal pull request into main
```

After the main pull request is merged, fetch `main` and identify the exact merged fix commit.
Do not use a moving branch name as the evidence value.

```bash
git fetch origin main
MAIN_FIX="<exact merged fix commit SHA>"
git show --stat --oneline "$MAIN_FIX"
```

Bring equivalent accepted behavior into the active QA candidate through an explicit pull request targeting `qa/*`.
A cherry-pick is appropriate when it applies cleanly.
A backport or equivalent change is appropriate when the histories require different commits.
Resolve conflicts deliberately and record the resulting QA commit instead of pretending that the SHAs must match.

```bash
git switch -c fix/qa-<number>-candidate "$QA_BRANCH"
git cherry-pick "$MAIN_FIX"
# or implement and commit the reviewed equivalent backport
# push the branch and open a pull request targeting "$QA_BRANCH"
```

After the QA pull request is merged, fetch the candidate and record both histories.
The histories are validated independently, so different full SHAs are allowed.

```bash
git fetch origin main "$QA_BRANCH"
QA_FIX="<exact accepted QA candidate commit SHA>"

npm run qa:reconcile -- reconcile \
  --record .qa-staging/qa-cycles/<cycle>-reconciliation.json \
  --fix-id QA-<number> \
  --main-commit "$MAIN_FIX" \
  --qa-commit "$QA_FIX" \
  --method cherry-pick \
  --evidence "QA commit is the reviewed cherry-pick of the merged main fix; behavior was compared after conflict resolution." \
  --regression added \
  --regression-path <test-path> \
  --regression-evidence "<exact focused test command and result>"
```

Use `--method backport` or `--method equivalent-change` when that better describes the reviewed reconciliation.
If no stable automated seam exists, use `--regression not-applicable --regression-evidence "<specific reason>"` instead of silently omitting the decision.

## Begin from the active `qa/*` branch deliberately

Use this path when the captain judges that the candidate context is safer for the first fix.
This is an explicit exception to the normal `main`-first worker model.

Capture the exact active QA branch head and create the record with `--origin qa`.

```bash
QA_BASE="$(git rev-parse "refs/heads/$QA_BRANCH" 2>/dev/null || git rev-parse "refs/remotes/origin/$QA_BRANCH")"

npm run qa:reconcile -- begin \
  --repo . \
  --qa-id "$QA_ID" \
  --qa-branch "$QA_BRANCH" \
  --origin qa \
  --source-commit "$QA_BASE" \
  --fix-id QA-<number> \
  --summary "short non-secret description of the QA defect"
```

Create a fix branch from the captured QA source and open an explicit pull request targeting the active QA branch.
Do not assume that the ordinary worker checkout is already on the QA branch.

```bash
git switch -c fix/qa-<number>-candidate "$QA_BASE"
# implement the fix and add stable regression coverage when appropriate
git add <paths>
git commit -m "fix: <short description>"
# push this fix branch and open a pull request targeting "$QA_BRANCH"
```

After that QA pull request is merged, update the active staging worktree without resetting its database.
Restart the QA services, refresh the public smoke boundary, and retest the actual active candidate.

```bash
git fetch origin "$QA_BRANCH"
# update the dedicated QA worktree through its normal fast-forward workflow
git -C .qa-staging/worktree pull --ff-only origin "$QA_BRANCH"
npm run qa:staging -- stop
npm run qa:staging -- start
npm run qa:staging -- public-ready
```

Port the same accepted behavior into `main` through an explicit pull request.
Cherry-pick the QA fix when it applies cleanly, or make a reviewed equivalent change when the main history differs.
Let the configured merge authority merge the pull request.

```bash
git switch -c fix/qa-<number>-main main
git cherry-pick "<accepted QA candidate commit SHA>"
# or implement and commit the reviewed equivalent main change
# push this branch and open a pull request targeting main
```

Fetch both histories after the main pull request is merged and record them.

```bash
git fetch origin main "$QA_BRANCH"
MAIN_FIX="<exact accepted main commit SHA>"
QA_FIX="<exact accepted QA candidate commit SHA>"

npm run qa:reconcile -- reconcile \
  --record .qa-staging/qa-cycles/<cycle>-reconciliation.json \
  --fix-id QA-<number> \
  --main-commit "$MAIN_FIX" \
  --qa-commit "$QA_FIX" \
  --method cherry-pick \
  --evidence "QA-first fix was reviewed on the candidate and ported to main with equivalent accepted behavior." \
  --regression added \
  --regression-path <test-path> \
  --regression-evidence "<exact focused test command and result>"
```

Use the same `backport` or `equivalent-change` method and regression decision rules as the main-first path.

## Retest the active candidate

Retest only after the accepted QA history commit has been recorded.
The command requires the supplied candidate SHA to be the current head of the active `qa/*` branch, which prevents stale evidence from closing the cycle.
Run the focused regression and relevant Web/API checks, then perform the QA scenario against the active staging candidate.
Record a failure as well as a pass so an unsuccessful attempt remains visible.

```bash
QA_FIX="<current active QA branch head>"

npm run qa:reconcile -- retest \
  --record .qa-staging/qa-cycles/<cycle>-reconciliation.json \
  --fix-id QA-<number> \
  --candidate-commit "$QA_FIX" \
  --result pass \
  --evidence "<focused regression, relevant automated checks, and QA scenario result>"
```

A later movement of the active QA branch makes an earlier pass stale.
Retest again and record the new current candidate SHA before checking closure readiness.

## Read status and enforce the closure gate

Use `status` to produce a fresh-worker-readable report.
It reports the selected origin, worker checkout evidence, both required histories, whether accepted behavior exists only on `main` or only on the active QA branch, the latest retest, and the regression decision.

```bash
npm run qa:reconcile -- status \
  --record .qa-staging/qa-cycles/<cycle>-reconciliation.json
```

Run `check` immediately before any separate cycle approval or closure workflow.
It exits non-zero with `CLOSURE BLOCKED` when an accepted fix is present on only one history, when the candidate has not been retested, when retest evidence is stale or failed, or when the regression decision is missing.
It exits zero only when every recorded fix is represented on both histories and the current candidate has a passing retest.

```bash
npm run qa:reconcile -- check \
  --record .qa-staging/qa-cycles/<cycle>-reconciliation.json
```

A zero exit status means reconciliation evidence is ready for a separate human QA decision.
It does not mark QA approved, record an approver, close the cycle, merge a pull request, or delete a branch.
Use [qa-cycle-closure.md](./qa-cycle-closure.md) to record the explicit approval or abandonment decision and apply the matching branch policy.
A cycle must not be recorded as successfully closed while this check is blocked.
