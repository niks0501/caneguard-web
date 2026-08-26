import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  beginReconciliation,
  checkReconciliation,
  formatReconciliationSummary,
  reconcileFix,
  recordRetest,
} from "./qa-reconcile.mjs";

function git(repo, args) {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
}

function makeRepo() {
  const repo = mkdtempSync(join(tmpdir(), "caneguard-reconcile-"));
  git(repo, ["init", "-b", "main"]);
  git(repo, ["config", "user.email", "qa-tests@caneguard.test"]);
  git(repo, ["config", "user.name", "CaneGuard QA tests"]);
  writeFileSync(join(repo, "behavior.txt"), "baseline\n");
  git(repo, ["add", "behavior.txt"]);
  git(repo, ["commit", "-m", "baseline"]);
  const baseline = git(repo, ["rev-parse", "main"]);

  git(repo, ["branch", "qa/2026-08-26-01", baseline]);
  git(repo, ["checkout", "main"]);
  writeFileSync(join(repo, "behavior.txt"), "accepted behavior\n");
  git(repo, ["add", "behavior.txt"]);
  git(repo, ["commit", "-m", "fix on main"]);
  const mainFix = git(repo, ["rev-parse", "main"]);

  git(repo, ["checkout", "qa/2026-08-26-01"]);
  writeFileSync(join(repo, "behavior.txt"), "accepted behavior\n");
  git(repo, ["add", "behavior.txt"]);
  git(repo, ["commit", "-m", "backport QA fix"]);
  const qaFix = git(repo, ["rev-parse", "qa/2026-08-26-01"]);

  git(repo, ["checkout", "-b", "fm/fresh-worker", baseline]);
  return { repo, baseline, mainFix, qaFix, qaBranch: "qa/2026-08-26-01" };
}

function cleanup(repo) {
  rmSync(repo, { recursive: true, force: true });
}

function recordPath(repo) {
  return join(repo, ".qa-staging", "qa-cycles", "2026-08-26-01-reconciliation.json");
}

test("records main-first origin separately from an ordinary worker checkout", () => {
  const fixture = makeRepo();
  try {
    const path = recordPath(fixture.repo);
    const record = beginReconciliation({
      repo: fixture.repo,
      qaId: "qa/2026-08-26-01",
      qaBranch: fixture.qaBranch,
      origin: "main",
      sourceCommit: fixture.baseline,
      fixId: "QA-17",
      summary: "form accepts a stale report state",
      recordPath: path,
    });

    assert.equal(record.origin, "main");
    assert.equal(record.originLabel, "main-first");
    assert.equal(record.source.branch, "main");
    assert.equal(record.dispatch.workerBranch, "fm/fresh-worker");
    assert.equal(JSON.parse(readFileSync(path, "utf8")).qaBranch, fixture.qaBranch);
  } finally {
    cleanup(fixture.repo);
  }
});

test("reports a QA-only accepted fix and blocks closure", () => {
  const fixture = makeRepo();
  try {
    const path = recordPath(fixture.repo);
    beginReconciliation({
      repo: fixture.repo,
      qaId: "qa/2026-08-26-01",
      qaBranch: fixture.qaBranch,
      origin: "qa",
      sourceCommit: fixture.baseline,
      fixId: "QA-18",
      summary: "empty report state is recoverable",
      recordPath: path,
    });

    reconcileFix({
      repo: fixture.repo,
      recordPath: path,
      fixId: "QA-18",
      qaCommit: fixture.qaFix,
      method: "equivalent-change",
      evidence: "QA candidate implementation was reviewed against the accepted behavior.",
      regression: "not-applicable",
      regressionEvidence: "The defect is covered by a manual-only device interaction seam.",
    });

    const result = checkReconciliation({ repo: fixture.repo, recordPath: path });
    assert.equal(result.ready, false);
    assert.equal(result.fixes[0].status, "QA_ONLY");
    assert.match(formatReconciliationSummary(result, path), /exists only on qa\/2026-08-26-01/);
    assert.match(formatReconciliationSummary(result, path), /CLOSURE BLOCKED/);
  } finally {
    cleanup(fixture.repo);
  }
});

test("allows different SHAs when both histories contain the accepted behavior", () => {
  const fixture = makeRepo();
  try {
    const path = recordPath(fixture.repo);
    beginReconciliation({
      repo: fixture.repo,
      qaId: "qa/2026-08-26-01",
      qaBranch: fixture.qaBranch,
      origin: "main",
      sourceCommit: fixture.baseline,
      fixId: "QA-19",
      summary: "report details retain their selected filter",
      recordPath: path,
    });

    reconcileFix({
      repo: fixture.repo,
      recordPath: path,
      fixId: "QA-19",
      mainCommit: fixture.mainFix,
      method: "cherry-pick",
      evidence: "The main fix is the original change and the QA fix is its reviewed cherry-pick.",
    });
    let result = checkReconciliation({ repo: fixture.repo, recordPath: path });
    assert.equal(result.fixes[0].status, "MAIN_ONLY");
    assert.equal(result.fixes[0].histories, "MAIN_ONLY");

    reconcileFix({
      repo: fixture.repo,
      recordPath: path,
      fixId: "QA-19",
      qaCommit: fixture.qaFix,
      method: "cherry-pick",
      evidence: "The main and QA commits differ but produce the same accepted behavior.",
      regression: "added",
      regressionPath: "src/example.test.ts",
      regressionEvidence: "npm test -- --run src/example.test.ts",
    });
    result = checkReconciliation({ repo: fixture.repo, recordPath: path });
    assert.equal(result.fixes[0].histories, "BOTH");
    assert.equal(result.fixes[0].status, "RETEST_REQUIRED");
    assert.equal(result.ready, false);

    recordRetest({
      repo: fixture.repo,
      recordPath: path,
      fixId: "QA-19",
      candidateCommit: fixture.qaFix,
      result: "pass",
      evidence: "npm run check:all and the QA scenario passed on the active candidate.",
    });
    result = checkReconciliation({ repo: fixture.repo, recordPath: path });
    assert.equal(result.fixes[0].status, "READY_FOR_HUMAN_APPROVAL");
    assert.equal(result.ready, true);
    assert.match(formatReconciliationSummary(result, path), /SHAs may differ/);
    assert.match(formatReconciliationSummary(result, path), /does not record approval/);

    git(fixture.repo, ["checkout", fixture.qaBranch]);
    writeFileSync(join(fixture.repo, "candidate-note.txt"), "candidate moved\n");
    git(fixture.repo, ["add", "candidate-note.txt"]);
    git(fixture.repo, ["commit", "-m", "move active candidate"]);
    git(fixture.repo, ["checkout", "fm/fresh-worker"]);
    result = checkReconciliation({ repo: fixture.repo, recordPath: path });
    assert.equal(result.fixes[0].status, "RETEST_REQUIRED");
    assert.equal(result.ready, false);
  } finally {
    cleanup(fixture.repo);
  }
});

test("keeps per-fix origins visible when one cycle has multiple fixes", () => {
  const fixture = makeRepo();
  try {
    const path = recordPath(fixture.repo);
    beginReconciliation({
      repo: fixture.repo,
      qaId: "qa/2026-08-26-01",
      qaBranch: fixture.qaBranch,
      origin: "main",
      sourceCommit: fixture.baseline,
      fixId: "QA-21",
      summary: "main-origin fix",
      recordPath: path,
    });
    beginReconciliation({
      repo: fixture.repo,
      qaId: "qa/2026-08-26-01",
      qaBranch: fixture.qaBranch,
      origin: "qa",
      sourceCommit: fixture.baseline,
      fixId: "QA-22",
      summary: "candidate-origin fix",
      recordPath: path,
    });

    const result = checkReconciliation({ repo: fixture.repo, recordPath: path });
    assert.equal(result.origin, "mixed");
    assert.deepEqual(result.fixes.map((fix) => fix.originLabel), ["main-first", "qa-first"]);
    assert.match(formatReconciliationSummary(result, path), /origin is recorded per fix/);
  } finally {
    cleanup(fixture.repo);
  }
});

test("requires the active QA branch and exact history commits", () => {
  const fixture = makeRepo();
  try {
    assert.throws(
      () => beginReconciliation({
        repo: fixture.repo,
        qaId: "qa/2026-08-26-01",
        origin: "qa",
        sourceCommit: fixture.baseline,
        fixId: "QA-20",
        summary: "missing branch selection",
      }),
      /active QA branch must be supplied explicitly/,
    );

    const path = recordPath(fixture.repo);
    beginReconciliation({
      repo: fixture.repo,
      qaId: "qa/2026-08-26-01",
      qaBranch: fixture.qaBranch,
      origin: "qa",
      sourceCommit: fixture.baseline,
      fixId: "QA-20",
      summary: "history must be explicit",
      recordPath: path,
    });
    assert.throws(
      () => reconcileFix({
        repo: fixture.repo,
        recordPath: path,
        fixId: "QA-20",
        mainCommit: fixture.qaFix,
        method: "backport",
        evidence: "incorrect history",
      }),
      /main history commit .* is not reachable from refs\/heads\/main/,
    );
  } finally {
    cleanup(fixture.repo);
  }
});
