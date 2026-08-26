import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  abandonQaCycle,
  approveQaCycle,
  buildReleaseIssueBody,
  deleteQaBranches,
  formatQaCloseSummary,
  publishGitHubReleaseRecord,
} from "./qa-close.mjs";

function git(repo, args) {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
}

function makeRepo(name) {
  const repo = mkdtempSync(join(tmpdir(), `caneguard-close-${name}-`));
  git(repo, ["init", "-b", "main"]);
  git(repo, ["config", "user.email", "qa-tests@caneguard.test"]);
  git(repo, ["config", "user.name", "CaneGuard QA tests"]);
  writeFileSync(join(repo, "README.md"), `${name}\n`);
  git(repo, ["add", "README.md"]);
  git(repo, ["commit", "-m", "baseline"]);
  return repo;
}

function cleanup(...paths) {
  for (const path of paths) rmSync(path, { recursive: true, force: true });
}

function makeCycle() {
  const webRepo = makeRepo("web");
  const mobileRepo = makeRepo("mobile");
  const qaId = "qa/2026-08-26-01";
  const webCommit = git(webRepo, ["rev-parse", "main"]);
  const mobileCommit = git(mobileRepo, ["rev-parse", "main"]);
  git(webRepo, ["branch", qaId, webCommit]);
  git(mobileRepo, ["branch", qaId, mobileCommit]);

  const recordPath = join(webRepo, ".qa-staging", "qa-cycles", "2026-08-26-01.json");
  const reconciliationPath = join(
    webRepo,
    ".qa-staging",
    "qa-cycles",
    "2026-08-26-01-reconciliation.json",
  );
  const record = {
    version: 1,
    qaId,
    createdAt: "2026-08-26T00:00:00.000Z",
    readiness: "QA OPEN",
    humanQa: "pending",
    repositories: {
      web: { name: "caneguard-web", path: webRepo, branch: qaId, commit: webCommit },
      mobile: { name: "caneguard-mobile", path: mobileRepo, branch: qaId, commit: mobileCommit },
    },
    recordPath,
    reconciliation: { recordPath: reconciliationPath, status: "REQUIRED_BEFORE_CLOSURE" },
    staging: {
      endpoint: "https://qa.example.ts.net",
      database: "caneguard_staging",
      configPath: null,
    },
    mobile: {
      target: "https://qa.example.ts.net",
      delivery: "build",
      identity: {
        id: "build-123",
        detailsUrl: "https://expo.dev/builds/build-123",
        environment: "preview",
        channel: "qa",
      },
      artifactUrl: "https://expo.dev/artifacts/build-123.apk",
      sourceCommit: mobileCommit,
      apiBaseUrl: "https://qa.example.ts.net",
    },
    gates: {},
    failedGate: null,
    failure: null,
  };
  mkdirSync(join(webRepo, ".qa-staging", "qa-cycles"), { recursive: true });
  writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  return { webRepo, mobileRepo, qaId, webCommit, mobileCommit, recordPath };
}

function dependencies(calls = []) {
  return {
    now: () => "2026-08-26T12:34:56.000Z",
    stopStaging: async () => {
      calls.push("stop");
      return {
        status: "STOPPED_OR_NOT_RUNNING",
        funnel: "stopped_or_not_running",
        services: "stopped_or_not_running",
        database: "caneguard_staging retained",
      };
    },
    publishReleaseRecord: async ({ record, body }) => {
      calls.push({ publish: record.status, body });
      return {
        provider: "github",
        status: "RECORDED",
        repository: "niks0501/caneguard-web",
        issue: 123,
        url: "https://github.com/niks0501/caneguard-web/issues/123",
        recordedAt: "2026-08-26T12:35:00.000Z",
      };
    },
  };
}

test("refuses approval without an explicit human decision", async () => {
  const fixture = makeCycle();
  try {
    await assert.rejects(
      approveQaCycle({
        webRepo: fixture.webRepo,
        mobileRepo: fixture.mobileRepo,
        recordPath: fixture.recordPath,
        humanApprover: "qa@example.test",
        finalResult: "pass",
      }, dependencies()),
      /requires --confirm-human-approval/,
    );
    assert.match(git(fixture.webRepo, ["show-ref", "--verify", `refs/heads/${fixture.qaId}`]), /[0-9a-f]{40}/);
    const record = JSON.parse(readFileSync(fixture.recordPath, "utf8"));
    assert.equal(record.status, undefined);
  } finally {
    cleanup(fixture.webRepo, fixture.mobileRepo);
  }
});

test("approves only after explicit human approval and retains both branches", async () => {
  const fixture = makeCycle();
  const calls = [];
  try {
    const record = await approveQaCycle({
      webRepo: fixture.webRepo,
      mobileRepo: fixture.mobileRepo,
      recordPath: fixture.recordPath,
      confirmHumanApproval: true,
      humanApprover: "qa@example.test",
      finalResult: "pass",
      approvalDate: "2026-08-26",
      githubRepo: "niks0501/caneguard-web",
    }, dependencies(calls));

    assert.equal(record.status, "APPROVED");
    assert.equal(record.finalQaResult, "PASS");
    assert.equal(record.approvalDate, "2026-08-26");
    assert.equal(record.humanApprover, "qa@example.test");
    assert.equal(record.release.mobileCommit, fixture.mobileCommit);
    assert.equal(record.release.webApiCommit, fixture.webCommit);
    assert.equal(record.release.eas.identity, "build-123");
    assert.equal(record.releaseRecord.issue, 123);
    assert.equal(record.branches.policy, "RETAINED");
    assert.equal(record.stagingShutdown.database, "caneguard_staging retained");
    assert.deepEqual(calls.map((call) => typeof call === "string" ? call : call.publish), ["stop", "APPROVED"]);
    assert.match(formatQaCloseSummary(record), /Final state: APPROVED/);
    assert.match(git(fixture.webRepo, ["show-ref", "--verify", `refs/heads/${fixture.qaId}`]), /[0-9a-f]{40}/);
    assert.match(git(fixture.mobileRepo, ["show-ref", "--verify", `refs/heads/${fixture.qaId}`]), /[0-9a-f]{40}/);
  } finally {
    cleanup(fixture.webRepo, fixture.mobileRepo);
  }
});

test("abandons explicitly, stops staging, and deletes matching branches", async () => {
  const fixture = makeCycle();
  const calls = [];
  try {
    const record = await abandonQaCycle({
      webRepo: fixture.webRepo,
      mobileRepo: fixture.mobileRepo,
      recordPath: fixture.recordPath,
      confirmAbandonment: true,
      abandonedBy: "captain@example.test",
      reason: "The candidate requires a materially different API contract.",
      finalResult: "failed",
      githubRepo: "niks0501/caneguard-web",
    }, dependencies(calls));

    assert.equal(record.status, "ABANDONED");
    assert.equal(record.finalQaResult, "FAILED");
    assert.equal(record.abandonment.abandonedBy, "captain@example.test");
    assert.equal(record.approval, undefined);
    assert.equal(record.branches.policy, "DELETED");
    assert.equal(record.branches.web.local, "DELETED");
    assert.equal(record.branches.mobile.local, "DELETED");
    assert.equal(record.stagingShutdown.database, "caneguard_staging retained");
    assert.deepEqual(calls.map((call) => typeof call === "string" ? call : call.publish), ["stop", "ABANDONED"]);
    assert.throws(() => git(fixture.webRepo, ["show-ref", "--verify", `refs/heads/${fixture.qaId}`]), /Command failed/);
    assert.throws(() => git(fixture.mobileRepo, ["show-ref", "--verify", `refs/heads/${fixture.qaId}`]), /Command failed/);
  } finally {
    cleanup(fixture.webRepo, fixture.mobileRepo);
  }
});

test("removes recorded candidate worktrees before deleting abandoned branches", async () => {
  const fixture = makeCycle();
  const webWorktree = join(fixture.webRepo, ".qa-staging", "worktree");
  const mobileWorktree = join(fixture.webRepo, ".qa-staging", "mobile", "2026-08-26-01");
  try {
    mkdirSync(join(fixture.webRepo, ".qa-staging", "mobile"), { recursive: true });
    git(fixture.webRepo, ["worktree", "add", webWorktree, fixture.qaId]);
    git(fixture.mobileRepo, ["worktree", "add", mobileWorktree, fixture.qaId]);
    const record = JSON.parse(readFileSync(fixture.recordPath, "utf8"));
    record.staging.worktreePath = ".qa-staging/worktree";
    record.gates = {
      "mobile-worktree": { status: "PASS", evidence: mobileWorktree },
    };
    writeFileSync(fixture.recordPath, `${JSON.stringify(record, null, 2)}\n`);

    await abandonQaCycle({
      webRepo: fixture.webRepo,
      mobileRepo: fixture.mobileRepo,
      recordPath: fixture.recordPath,
      confirmAbandonment: true,
      abandonedBy: "captain@example.test",
      reason: "The candidate is being replaced.",
    }, dependencies());

    assert.equal(existsSync(webWorktree), false);
    assert.equal(existsSync(mobileWorktree), false);
  } finally {
    cleanup(fixture.webRepo, fixture.mobileRepo);
  }
});

test("deletes a pushed remote branch even when no local tracking ref remains", () => {
  const fixture = makeCycle();
  const webRemote = mkdtempSync(join(tmpdir(), "caneguard-close-web-remote-"));
  const mobileRemote = mkdtempSync(join(tmpdir(), "caneguard-close-mobile-remote-"));
  try {
    git(webRemote, ["init", "--bare"]);
    git(mobileRemote, ["init", "--bare"]);
    git(fixture.webRepo, ["remote", "add", "origin", webRemote]);
    git(fixture.mobileRepo, ["remote", "add", "origin", mobileRemote]);
    git(fixture.webRepo, ["push", "origin", fixture.qaId]);
    git(fixture.mobileRepo, ["push", "origin", fixture.qaId]);
    git(fixture.webRepo, ["update-ref", "-d", `refs/remotes/origin/${fixture.qaId}`]);
    git(fixture.mobileRepo, ["update-ref", "-d", `refs/remotes/origin/${fixture.qaId}`]);

    const deleted = deleteQaBranches({
      webRepo: fixture.webRepo,
      mobileRepo: fixture.mobileRepo,
      branch: fixture.qaId,
    });

    assert.equal(deleted.web.remote, "DELETED");
    assert.equal(deleted.mobile.remote, "DELETED");
    assert.throws(() => git(webRemote, ["show-ref", "--verify", `refs/heads/${fixture.qaId}`]), /Command failed/);
    assert.throws(() => git(mobileRemote, ["show-ref", "--verify", `refs/heads/${fixture.qaId}`]), /Command failed/);
  } finally {
    cleanup(fixture.webRepo, fixture.mobileRepo, webRemote, mobileRemote);
  }
});

test("publishes every required approved-cycle release field in the issue body", () => {
  const fixture = makeCycle();
  try {
    const record = JSON.parse(readFileSync(fixture.recordPath, "utf8"));
    record.status = "APPROVED";
    record.finalQaResult = "PASS";
    record.approvalDate = "2026-08-26";
    record.humanApprover = "qa@example.test";
    record.release = {
      mobileCommit: fixture.mobileCommit,
      webApiCommit: fixture.webCommit,
      finalQaResult: "PASS",
      approvalDate: "2026-08-26",
      humanApprover: "qa@example.test",
      eas: {
        delivery: "build",
        identity: "build-123",
        detailsUrl: "https://expo.dev/builds/build-123",
        artifactUrl: "https://expo.dev/artifacts/build-123.apk",
      },
    };
    const body = buildReleaseIssueBody(record, fixture.webRepo);
    for (const expected of [
      "State: **APPROVED**",
      `QA ID: \`${fixture.qaId}\``,
      `Mobile commit: \`${fixture.mobileCommit}\``,
      `Web/API commit: \`${fixture.webCommit}\``,
      "EAS build or update identity: `build-123`",
      "Final QA result: **PASS**",
      "Approval date: 2026-08-26",
      "Human approver: qa@example.test",
    ]) {
      assert.equal(body.includes(expected), true, `missing release field: ${expected}`);
    }
  } finally {
    cleanup(fixture.webRepo, fixture.mobileRepo);
  }
});

test("updates an existing deterministic release issue instead of creating a duplicate", () => {
  const fixture = makeCycle();
  const commandLog = join(fixture.webRepo, "gh-axi.log");
  const fakeBin = mkdtempSync(join(tmpdir(), "caneguard-close-gh-"));
  const fakeGh = join(fakeBin, "gh-axi");
  const originalPath = process.env.PATH;
  try {
    const record = JSON.parse(readFileSync(fixture.recordPath, "utf8"));
    record.status = "APPROVED";
    record.finalQaResult = "PASS";
    record.release = {
      mobileCommit: fixture.mobileCommit,
      webApiCommit: fixture.webCommit,
      finalQaResult: "PASS",
      approvalDate: "2026-08-26",
      humanApprover: "qa@example.test",
      eas: { delivery: "update", identity: "update-123" },
    };
    writeFileSync(
      fakeGh,
      `#!/bin/sh\nprintf '%s\\n' "$*" >> "${commandLog}"\ncase "$1 $2" in\n  "issue list") printf '%s\\n' 'issues[1]{number,title,state,author,created}:' '  777,"[QA] qa/2026-08-26-01 APPROVED",open,qa,now' ;;\n  "issue edit") exit 0 ;;\n  *) exit 1 ;;\nesac\n`,
    );
    chmodSync(fakeGh, 0o755);
    process.env.PATH = `${fakeBin}:${originalPath}`;

    const published = publishGitHubReleaseRecord({
      record,
      body: buildReleaseIssueBody(record, fixture.webRepo),
      githubRepo: "niks0501/caneguard-web",
    });

    assert.equal(published.issue, 777);
    const calls = readFileSync(commandLog, "utf8");
    assert.match(calls, /issue list/);
    assert.match(calls, /issue edit/);
    assert.doesNotMatch(calls, /issue create/);
  } finally {
    process.env.PATH = originalPath;
    cleanup(fixture.webRepo, fixture.mobileRepo, fakeBin);
  }
});

test("does not approve a Mobile candidate whose branch moved beyond its EAS evidence", async () => {
  const fixture = makeCycle();
  try {
    git(fixture.mobileRepo, ["checkout", fixture.qaId]);
    writeFileSync(join(fixture.mobileRepo, "changed.txt"), "materially changed\n");
    git(fixture.mobileRepo, ["add", "changed.txt"]);
    git(fixture.mobileRepo, ["commit", "-m", "materially change candidate"]);
    git(fixture.mobileRepo, ["checkout", "main"]);

    await assert.rejects(
      approveQaCycle({
        webRepo: fixture.webRepo,
        mobileRepo: fixture.mobileRepo,
        recordPath: fixture.recordPath,
        confirmHumanApproval: true,
        humanApprover: "qa@example.test",
        finalResult: "pass",
      }, dependencies()),
      /Mobile QA branch moved/,
    );
  } finally {
    cleanup(fixture.webRepo, fixture.mobileRepo);
  }
});
