# Mobile report upload contract gate

The mobile report upload contract gate is the fast compatibility check for the
CaneGuard mobile producer, the web-owned `mobile-report-upload-v1` artifact, and
the Laravel upload boundary.

It proves the intended relationship:

```text
mobile producer domain ⊆ mobile-report-upload-v1 ⊆ Laravel accepted domain
```

The gate does not run device tests, Maestro, or the P0F full-system acceptance
flow.
P0F remains the separate Mobile -> API -> Web -> API -> Mobile release proof.

## What the gate runs

The canonical artifact check validates the artifact identity, multipart wire
boundary, field metadata, types, domains, collection rules, image formats, and
conditional rules.

The mobile producer check runs the focused
`reportMultipartMapper.contract.test.ts` suite from the selected mobile
revision.
The web workflow replaces the mobile repository's local contract copy with the
web-owned artifact in the disposable checkout before running that suite.

The Laravel consumer check runs
`MobileReportUploadContractTest` against the request boundary.
Its boundary and negative cases fail when Laravel becomes narrower than the
artifact.

Each side has a separate workflow step and a category prefix:

- `[artifact]` means the canonical web artifact or its revision configuration
  is malformed or inconsistent.
- `[producer]` means the selected mobile producer emitted an undeclared field,
  an incompatible wire value, or a value outside the v1 domain.
  It also identifies a mobile checkout or focused producer-test failure.
- `[consumer]` means Laravel no longer accepts a declared v1 field, value,
  boundary, or condition.
- `[config]` means the repository pin or workflow-dispatch revision input is
  malformed or points outside the approved mobile repository.
- `[revision]` means the standalone checkout assertion received a non-matching
  exact SHA.

## Trusted workflow behavior

The pull-request workflow is `.github/workflows/mobile-report-upload-contract.yml`.
The secret-bearing workflow is
`.github/workflows/mobile-report-upload-contract-trusted.yml`.

A pull request runs only the artifact and Laravel web-boundary checks.
The pull-request workflow contains no private mobile repository credential or
secret reference.

A push to `main` on a relevant contract or Laravel upload path runs the complete
producer and consumer gate against the full-SHA mobile revision in
`ci/mobile-report-upload-gate.json`.

A trusted `workflow_dispatch` run from the `main` workflow requires an exact
40-character `mobile_ref` input.
The web revision is the exact `github.sha` of the reviewed `main` workflow.
Use this mode to prove a mobile producer change before updating the committed
pin or before P0F.
Do not dispatch a workflow definition from an unreviewed branch.

The workflow does not follow `main` in the private mobile repository.
A full SHA is committed so a passing result always identifies the exact producer
revision.
After a mobile producer PR is merged, update
`ci/mobile-report-upload-gate.json` in a web PR and let the trusted push gate
run, or dispatch the gate first with the exact mobile SHA.
This pin update is the required cross-repository change trigger and prevents an
untested moving branch from reaching P0F.

The workflow uses pinned revisions of the checkout and setup-node actions.
Both checkouts set `persist-credentials: false`.
The producer test receives a small allowlisted environment and never receives a
GitHub token or the mobile read secret.

## Secret setup

Do not provision a token as part of a code change.
A repository administrator should perform these steps once through GitHub's
settings UI.

1. Open GitHub Settings -> Developer settings -> Fine-grained personal access
   tokens -> Generate new token.
2. Select the `niks0501` resource owner, or the approved bot owner for this
   project.
3. Set repository access to **Only select repositories** and select exactly
   `niks0501/caneguard-mobile`.
4. Grant **Contents: Read-only**.
   Do not grant Actions, Administration, Issues, Pull requests, workflows, or
   write permissions.
   GitHub's required repository metadata read permission is the only additional
   access needed for checkout.
5. Choose an expiration that matches the team's rotation policy.
6. In `niks0501/caneguard-web`, open Settings -> Secrets and variables ->
   Actions -> New repository secret.
7. Store the token under the exact name
   `CANEGUARD_MOBILE_READ_TOKEN`.
8. Do not paste the token into a workflow input, shell command, issue, pull
   request, log, local file, or documentation.

The secret is referenced only by the trusted push and workflow-dispatch job's
pinned checkout action.
Do not move that reference to the pull-request job, add it to a job-level
`env`, use `pull_request_target`, or pass it to npm, Composer, Jest, PHP, or a
shell command.
Fork pull requests therefore cannot use the private mobile checkout.

### Rotation

Create a replacement fine-grained token with the same repository and
`Contents: Read-only` scope before the current token expires.
Update the `CANEGUARD_MOBILE_READ_TOKEN` repository secret without printing the
value.
Run the trusted gate with exact web and mobile SHAs, confirm producer and
consumer passes, then revoke the old token in GitHub.
Record only the rotation date and the non-secret token owner or expiration in
team operations notes.

If the secret is suspected to be exposed, revoke it first, create a replacement,
and rerun the trusted gate before P0F.

## Local deterministic commands

Install the web and API dependencies using the existing repository setup.
Then run the artifact and helper tests:

```bash
npm run contract:artifact
npm run contract:config
npm run contract:test
```

Run the Laravel consumer boundary without the full API suite:

```bash
npm run contract:consumer
```

For a local mobile producer checkout, install its dependencies without lifecycle
scripts and provide its exact checked-out revision:

```bash
cd /path/to/caneguard-mobile
npm ci --ignore-scripts --no-audit --no-fund
cd /path/to/caneguard-web
MOBILE_REPO_DIR=/path/to/caneguard-mobile \
  MOBILE_REF=<full-mobile-commit-sha> \
  npm run contract:producer
```

The producer command refuses a dirty checkout, a moving branch, or a revision
mismatch.
It restores the mobile artifact after the test, so a local checkout is not
left with the web copy.

Run the complete local fast gate with the committed mobile pin by setting only
the checkout path:

```bash
MOBILE_REPO_DIR=/path/to/caneguard-mobile npm run contract:gate
```

These commands do not create credentials or fetch private repositories.
Use an already authenticated GitHub client outside the repository when a local
mobile checkout is needed.

## Failure response

If `[artifact]` fails, fix the canonical JSON before investigating either
repository boundary.
If `[config]` fails, correct the committed mobile pin or the workflow-dispatch
revision input.

If `[producer]` fails, read the focused Jest failure first.
An undeclared multipart name, invalid enum, missing required part, invalid
conditional location field, numeric boundary, text limit, or image metadata
failure belongs to the mobile producer or to the selected artifact comparison.

If `[consumer]` fails, read the named Laravel field and boundary assertion.
The correction belongs in the Laravel request boundary or in an explicitly
reviewed artifact version change, not in a weaker producer test.

If `[revision]` fails, do not rerun with a branch name.
Correct the full SHA input or the committed mobile pin.

A passing pull-request web-boundary check is not a substitute for the trusted
cross-repository result.
P0F must use a recorded web SHA, mobile SHA, artifact digest, and passing
trusted gate before full-system acceptance begins.
