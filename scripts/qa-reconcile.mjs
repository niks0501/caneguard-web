#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const FULL_SHA = /^[0-9a-f]{40}$/i;
export const QA_ID = /^qa\/[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{2}$/;
export const FIX_ID = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
export const ORIGINS = new Set(["main", "qa"]);
const RECORD_ORIGINS = new Set(["main", "qa", "mixed"]);
export const RECONCILIATION_METHODS = new Set([
  "cherry-pick",
  "backport",
  "equivalent-change",
]);
export const REGRESSION_STATUSES = new Set(["added", "not-applicable"]);

const SCRIPT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED_REPOSITORY = "caneguard-web";

export class QaReconcileError extends Error {
  constructor(gate, message) {
    super(`[${gate}] ${message}`);
    this.name = "QaReconcileError";
    this.gate = gate;
  }
}

function fail(gate, message) {
  throw new QaReconcileError(gate, message);
}

function git(args, cwd) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const details = error?.stderr?.toString().trim();
    throw new Error(details || `git ${args.join(" ")} failed in ${cwd}`);
  }
}

function gitRefExists(repo, ref) {
  try {
    execFileSync("git", ["show-ref", "--verify", "--quiet", ref], {
      cwd: repo,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function gitAncestor(repo, commit, ref) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", commit, ref], {
      cwd: repo,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function assertFullSha(value, label) {
  if (!FULL_SHA.test(value ?? "")) fail(label, `${label} must be an exact 40-character commit SHA`);
  return value.toLowerCase();
}

function assertQaId(value) {
  if (!QA_ID.test(value ?? "")) fail("qa-id", `QA ID must use qa/YYYY-MM-DD-NN: ${value}`);
  return value;
}

function assertFixId(value) {
  if (!FIX_ID.test(value ?? "") || value.includes("..")) {
    fail("fix-id", `fix ID must be a safe path-like identifier: ${value}`);
  }
  return value;
}

function assertRepo(repo) {
  const resolved = resolve(repo ?? SCRIPT_ROOT);
  let topLevel;
  try {
    topLevel = resolve(git(["rev-parse", "--show-toplevel"], resolved));
  } catch {
    fail("repository", `not a Git checkout: ${resolved}`);
  }
  if (topLevel !== resolved) fail("repository", `repository path is not its Git root: ${resolved}`);
  const remote = (() => {
    try {
      return git(["config", "--get", "remote.origin.url"], resolved);
    } catch {
      return "";
    }
  })();
  const remoteName = basename(remote.replace(/[\\/]$/, "")).replace(/\.git$/, "");
  if (remoteName && remoteName !== EXPECTED_REPOSITORY) {
    fail("repository", `expected ${EXPECTED_REPOSITORY}, found remote repository ${remoteName}`);
  }
  return resolved;
}

function assertRecordPath(repo, recordPath) {
  const resolved = isAbsolute(recordPath) ? resolve(recordPath) : resolve(repo, recordPath);
  const root = resolve(repo, ".qa-staging");
  const path = relative(root, resolved);
  if (!path || path.startsWith("..") || isAbsolute(path)) {
    fail("record", `reconciliation record must be inside ${root}`);
  }
  return resolved;
}

function defaultRecordPath(repo, qaId) {
  return join(
    repo,
    ".qa-staging",
    "qa-cycles",
    `${qaId.replace(/^qa\//, "")}-reconciliation.json`,
  );
}

function assertCycleNotTerminal(repo, qaId) {
  const releaseRecordPath = join(
    repo,
    ".qa-staging",
    "qa-cycles",
    `${qaId.replace(/^qa\//, "")}.json`,
  );
  if (!existsSync(releaseRecordPath)) return;
  let record;
  try {
    record = JSON.parse(readFileSync(releaseRecordPath, "utf8"));
  } catch (error) {
    fail("cycle", `could not read the QA cycle release record: ${error.message}`);
  }
  if (new Set(["APPROVED", "ABANDONED"]).has(record?.status)) {
    fail("cycle", `QA cycle ${qaId} is terminal as ${record.status}; reconciliation cannot be changed`);
  }
}

function branchRefCandidates(branch) {
  return [`refs/heads/${branch}`, `refs/remotes/origin/${branch}`];
}

function resolveBranch(repo, branch, gate) {
  for (const ref of branchRefCandidates(branch)) {
    if (gitRefExists(repo, ref)) {
      return { branch, ref, commit: git(["rev-parse", "--verify", ref], repo).toLowerCase() };
    }
  }
  fail(gate, `${branch} is not available as a local branch or origin/${branch}`);
}

function resolveMain(repo) {
  for (const ref of ["refs/heads/main", "refs/remotes/origin/main"]) {
    if (gitRefExists(repo, ref)) {
      return { branch: "main", ref, commit: git(["rev-parse", "--verify", ref], repo).toLowerCase() };
    }
  }
  fail("main-history", "could not find main or origin/main");
}

function assertCommitOnRef(repo, commit, ref, label) {
  const selected = assertFullSha(commit, label);
  let actual;
  try {
    actual = git(["rev-parse", "--verify", `${selected}^{commit}`], repo).toLowerCase();
  } catch {
    fail(label, `${label} does not exist as a commit in ${repo}`);
  }
  if (actual !== selected) fail(label, `${label} resolves to ${actual}, not ${selected}`);
  if (!gitAncestor(repo, selected, ref)) {
    fail(label, `${label} ${selected} is not reachable from ${ref}`);
  }
  return selected;
}

function currentWorkerEvidence(repo) {
  let branch;
  try {
    branch = git(["branch", "--show-current"], repo) || "<detached HEAD>";
  } catch {
    branch = "<unknown>";
  }
  return {
    branch,
    commit: git(["rev-parse", "--verify", "HEAD"], repo).toLowerCase(),
  };
}

function now() {
  return new Date().toISOString();
}

function safeString(value, label, { required = true, max = 1000 } = {}) {
  if (typeof value !== "string" || (required && value.trim() === "")) {
    fail(label, `${label} must be a non-empty string`);
  }
  if (value.length > max) fail(label, `${label} must be at most ${max} characters`);
  return value.trim();
}

function initialFix({ fixId, summary, origin, source, worker }) {
  return {
    id: fixId,
    summary,
    origin,
    source,
    histories: { main: null, qa: null },
    reconciliation: null,
    retests: [],
    regression: null,
    createdAt: now(),
    worker,
  };
}

export function reconciliationRecordPath(repo, qaId) {
  return defaultRecordPath(assertRepo(repo), assertQaId(qaId));
}

export function beginReconciliation(input) {
  const repo = assertRepo(input.repo ?? SCRIPT_ROOT);
  const qaId = assertQaId(input.qaId);
  if (!input.qaBranch) fail("qa-branch", "active QA branch must be supplied explicitly");
  const qaBranch = input.qaBranch;
  if (qaBranch !== qaId) fail("qa-branch", `active QA branch must match QA ID: ${qaId}`);
  if (!ORIGINS.has(input.origin)) fail("origin", `origin must be main or qa, not ${input.origin}`);
  const fixId = assertFixId(input.fixId);
  const summary = safeString(input.summary, "summary");
  const recordPath = assertRecordPath(
    repo,
    input.recordPath ?? defaultRecordPath(repo, qaId),
  );
  assertCycleNotTerminal(repo, qaId);
  const sourceBranch = input.origin === "main" ? resolveMain(repo) : resolveBranch(repo, qaBranch, "qa-history");
  const sourceCommit = assertCommitOnRef(
    repo,
    input.sourceCommit,
    sourceBranch.ref,
    "source commit",
  );
  const worker = currentWorkerEvidence(repo);
  const newFix = initialFix({
    fixId,
    summary,
    origin: input.origin,
    source: {
      branch: sourceBranch.branch,
      ref: sourceBranch.ref,
      commit: sourceCommit,
    },
    worker,
  });
  if (existsSync(recordPath)) {
    const record = readRecord(recordPath, repo);
    if (record.qaId !== qaId || record.qaBranch !== qaBranch) {
      fail("record", `record belongs to ${record.qaId}/${record.qaBranch}, not ${qaId}/${qaBranch}`);
    }
    if (record.fixes.some((fix) => fix.id === fixId)) {
      fail("fix-id", `fix ${fixId} is already in ${recordPath}`);
    }
    record.fixes.push(newFix);
    if (record.origin !== input.origin) {
      record.origin = "mixed";
      record.originLabel = "mixed (origin is recorded per fix)";
    }
    return updateRecord(record, recordPath);
  }

  const record = {
    version: 1,
    repository: EXPECTED_REPOSITORY,
    qaId,
    qaBranch,
    createdAt: now(),
    updatedAt: now(),
    origin: input.origin,
    originLabel: input.origin === "main" ? "main-first" : "qa-first",
    source: {
      branch: sourceBranch.branch,
      ref: sourceBranch.ref,
      commit: sourceCommit,
    },
    dispatch: {
      workerBranch: worker.branch,
      workerCommit: worker.commit,
      note: "The worker checkout is evidence only; the selected fix origin is recorded per fix above.",
    },
    fixes: [newFix],
    closure: {
      status: "BLOCKED",
      rule: "Do not close the QA cycle until every accepted fix is present on main and the active QA candidate.",
    },
    recordPath,
  };
  persistRecord(record, recordPath);
  return record;
}

function persistRecord(record, recordPath) {
  mkdirSync(dirname(recordPath), { recursive: true, mode: 0o700 });
  const temporary = `${recordPath}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, recordPath);
}

function readRecord(recordPath, repo) {
  if (!existsSync(recordPath)) fail("record", `reconciliation record is missing: ${recordPath}`);
  let record;
  try {
    record = JSON.parse(readFileSync(recordPath, "utf8"));
  } catch (error) {
    fail("record", `reconciliation record is not valid JSON: ${error.message}`);
  }
  if (record?.version !== 1 || record?.repository !== EXPECTED_REPOSITORY) {
    fail("record", "reconciliation record has an unsupported version or repository");
  }
  assertQaId(record.qaId);
  if (record.qaBranch !== record.qaId) fail("record", "record QA branch does not match its QA ID");
  if (!Array.isArray(record.fixes)) fail("record", "reconciliation record fixes must be an array");
  if (!RECORD_ORIGINS.has(record.origin)) fail("record", "record has an invalid origin");
  for (const fix of record.fixes) {
    assertFixId(fix.id);
    if (!ORIGINS.has(fix.origin)) fail("record", `fix ${fix.id} has an invalid origin`);
    safeString(fix.summary, `fix ${fix.id} summary`);
    if (!fix.histories || typeof fix.histories !== "object") {
      fail("record", `fix ${fix.id} histories must be an object`);
    }
    for (const history of ["main", "qa"]) {
      if (fix.histories[history] !== null && fix.histories[history] !== undefined) {
        assertFullSha(fix.histories[history].commit, `${fix.id} ${history} history commit`);
      }
    }
    if (!Array.isArray(fix.retests)) fail("record", `fix ${fix.id} retests must be an array`);
  }
  return record;
}

function recordPathFromInput(input) {
  const repo = assertRepo(input.repo ?? SCRIPT_ROOT);
  const qaId = input.qaId ? assertQaId(input.qaId) : null;
  if (input.recordPath) return { repo, path: assertRecordPath(repo, input.recordPath) };
  if (!qaId) fail("record", "pass --record or --qa-id with --repo");
  return { repo, path: defaultRecordPath(repo, qaId) };
}

function getFix(record, fixId) {
  const id = assertFixId(fixId);
  const fix = record.fixes.find((candidate) => candidate.id === id);
  if (!fix) fail("fix-id", `fix ${id} is not in ${record.recordPath}`);
  return fix;
}

function updateRecord(record, recordPath) {
  record.updatedAt = now();
  record.closure = {
    status: "BLOCKED",
    rule: "Do not close the QA cycle until every accepted fix is present on main and the active QA candidate.",
  };
  persistRecord(record, recordPath);
  return record;
}

export function reconcileFix(input) {
  const { repo, path } = recordPathFromInput(input);
  const record = readRecord(path, repo);
  assertCycleNotTerminal(repo, record.qaId);
  const fix = getFix(record, input.fixId);
  const hasMain = input.mainCommit !== undefined;
  const hasQa = input.qaCommit !== undefined;
  if (!hasMain && !hasQa) fail("histories", "provide --main-commit, --qa-commit, or both");
  const method = safeString(input.method, "method");
  if (!RECONCILIATION_METHODS.has(method)) {
    fail("method", `method must be one of ${[...RECONCILIATION_METHODS].join(", ")}`);
  }
  const evidence = safeString(input.evidence, "equivalence evidence", { max: 2000 });

  if (hasMain) {
    const main = resolveMain(repo);
    const commit = assertCommitOnRef(repo, input.mainCommit, main.ref, "main history commit");
    fix.histories.main = {
      commit,
      ref: main.ref,
      branch: main.branch,
      recordedAt: now(),
      method,
    };
  }
  if (hasQa) {
    const qa = resolveBranch(repo, record.qaBranch, "qa-history");
    const commit = assertCommitOnRef(repo, input.qaCommit, qa.ref, "QA history commit");
    fix.histories.qa = {
      commit,
      ref: qa.ref,
      branch: qa.branch,
      recordedAt: now(),
      method,
    };
  }
  fix.reconciliation = {
    method,
    evidence,
    recordedAt: now(),
  };
  if (input.regression !== undefined) {
    const regression = safeString(input.regression, "regression status");
    if (!REGRESSION_STATUSES.has(regression)) {
      fail("regression", "regression status must be added or not-applicable");
    }
    const regressionEvidence = safeString(input.regressionEvidence, "regression evidence", { max: 2000 });
    fix.regression = {
      status: regression,
      evidence: regressionEvidence,
      recordedAt: now(),
      ...(input.regressionPath ? { path: safeString(input.regressionPath, "regression path", { max: 500 }) } : {}),
    };
    if (regression === "added" && !input.regressionPath) {
      fail("regression", "--regression added requires --regression-path");
    }
    if (regression === "not-applicable" && input.regressionPath) {
      fail("regression", "--regression not-applicable cannot include --regression-path");
    }
  }
  return updateRecord(record, path);
}

function branchHead(repo, branch, gate) {
  return resolveBranch(repo, branch, gate);
}

export function recordRetest(input) {
  const { repo, path } = recordPathFromInput(input);
  const record = readRecord(path, repo);
  assertCycleNotTerminal(repo, record.qaId);
  const fix = getFix(record, input.fixId);
  const result = safeString(input.result, "retest result").toLowerCase();
  if (!new Set(["pass", "fail"]).has(result)) fail("retest", "retest result must be pass or fail");
  if (!fix.histories.qa) {
    fail("retest", "record the accepted QA history commit before recording its retest");
  }
  const qa = branchHead(repo, record.qaBranch, "qa-history");
  const candidateCommit = assertCommitOnRef(repo, input.candidateCommit, qa.ref, "retest candidate commit");
  if (candidateCommit !== qa.commit) {
    fail(
      "retest",
      `retest candidate ${candidateCommit} is not the active QA branch head ${qa.commit}; retest the current candidate`,
    );
  }
  if (!gitAncestor(repo, fix.histories.qa.commit, candidateCommit)) {
    fail("retest", `retest candidate ${candidateCommit} does not contain QA history commit ${fix.histories.qa.commit}`);
  }
  const evidence = safeString(input.evidence, "retest evidence", { max: 2000 });
  fix.retests.push({
    result: result.toUpperCase(),
    candidateCommit,
    qaRef: qa.ref,
    evidence,
    recordedAt: now(),
  });
  return updateRecord(record, path);
}

function latestRetest(fix) {
  return fix.retests?.[fix.retests.length - 1] ?? null;
}

function historyState(fix) {
  const hasMain = Boolean(fix.histories?.main);
  const hasQa = Boolean(fix.histories?.qa);
  if (hasMain && hasQa) return "BOTH";
  if (hasMain) return "MAIN_ONLY";
  if (hasQa) return "QA_ONLY";
  return "NEITHER";
}

function evaluateFix(repo, record, fix) {
  const qa = resolveBranch(repo, record.qaBranch, "qa-history");
  const main = resolveMain(repo);
  const mainReachable = Boolean(
    fix.histories?.main && gitAncestor(repo, fix.histories.main.commit, main.ref),
  );
  const qaReachable = Boolean(
    fix.histories?.qa && gitAncestor(repo, fix.histories.qa.commit, qa.ref),
  );
  const histories = historyState({
    histories: {
      main: mainReachable ? fix.histories.main : null,
      qa: qaReachable ? fix.histories.qa : null,
    },
  });
  const latest = latestRetest(fix);
  const retestCurrent = Boolean(
    latest?.result === "PASS" &&
      latest.candidateCommit === qa.commit &&
      qaReachable &&
      gitAncestor(repo, fix.histories.qa.commit, qa.commit),
  );
  const status = histories === "BOTH" && retestCurrent && fix.regression
    ? "READY_FOR_HUMAN_APPROVAL"
    : histories === "MAIN_ONLY"
      ? "MAIN_ONLY"
      : histories === "QA_ONLY"
        ? "QA_ONLY"
        : histories === "NEITHER"
          ? "UNRECONCILED"
          : latest?.result === "FAIL" || !retestCurrent
            ? "RETEST_REQUIRED"
            : "REGRESSION_DECISION_REQUIRED";
  return {
    id: fix.id,
    summary: fix.summary,
    origin: fix.origin,
    originLabel: fix.origin === "main" ? "main-first" : "qa-first",
    source: fix.source,
    worker: fix.worker,
    histories,
    status,
    main: fix.histories?.main ?? null,
    qa: fix.histories?.qa ?? null,
    mainReachable,
    qaReachable,
    activeMain: main,
    activeQa: qa,
    latestRetest: latest,
    retestCurrent,
    regression: fix.regression,
  };
}

export function evaluateReconciliation(repo, record) {
  const resolvedRepo = assertRepo(repo ?? SCRIPT_ROOT);
  const evaluations = record.fixes.map((fix) => evaluateFix(resolvedRepo, record, fix));
  const blocked = evaluations.filter((evaluation) => evaluation.status !== "READY_FOR_HUMAN_APPROVAL");
  return {
    qaId: record.qaId,
    qaBranch: record.qaBranch,
    origin: record.origin,
    originLabel: record.originLabel,
    worker: record.dispatch,
    fixes: evaluations,
    ready: blocked.length === 0,
    blocked,
  };
}

export function formatReconciliationSummary(result, recordPath) {
  const lines = [
    `QA ID: ${result.qaId}`,
    `Active QA branch: ${result.qaBranch}`,
    `Selected fix origin: ${result.originLabel} (${result.origin})`,
    `Worker checkout evidence: ${result.worker?.workerBranch ?? "unknown"}@${result.worker?.workerCommit ?? "unknown"}`,
    `Reconciliation record: ${recordPath}`,
  ];
  if (result.fixes.length === 0) {
    lines.push("Accepted fixes: none recorded");
  }
  for (const fix of result.fixes) {
    lines.push(`Fix ${fix.id}: ${fix.status} - ${fix.summary}`);
    lines.push(`  Selected origin: ${fix.originLabel} (${fix.origin})`);
    lines.push(`  Source evidence: ${fix.source?.ref ?? "unknown"}@${fix.source?.commit ?? "unknown"}`);
    lines.push(`  Worker evidence: ${fix.worker?.branch ?? "unknown"}@${fix.worker?.commit ?? "unknown"}`);
    lines.push(`  Required histories: main=${fix.main?.commit ?? "missing"}${fix.main && !fix.mainReachable ? " (not reachable)" : ""}, ${result.qaBranch}=${fix.qa?.commit ?? "missing"}${fix.qa && !fix.qaReachable ? " (not reachable)" : ""}`);
    if (fix.histories === "MAIN_ONLY") lines.push("  Accepted behavior exists only on main; QA candidate reconciliation is required.");
    if (fix.histories === "QA_ONLY") lines.push(`  Accepted behavior exists only on ${result.qaBranch}; main reconciliation is required.`);
    if (fix.histories === "BOTH") lines.push("  Accepted behavior is represented on both required histories; commit SHAs may differ.");
    if (fix.latestRetest) lines.push(`  Latest QA retest: ${fix.latestRetest.result} at ${fix.latestRetest.candidateCommit}`);
    if (fix.regression) lines.push(`  Regression coverage decision: ${fix.regression.status}`);
  }
  lines.push(
    result.ready
      ? "Reconciliation: READY FOR HUMAN QA APPROVAL (this command does not record approval)."
      : `Reconciliation: CLOSURE BLOCKED (${result.blocked.map((fix) => `${fix.id}: ${fix.status}`).join(", ") || "no accepted-fix decision"}).`,
  );
  return lines.join("\n");
}

export function checkReconciliation(input) {
  const { repo, path } = recordPathFromInput(input);
  const record = readRecord(path, repo);
  const result = evaluateReconciliation(repo, record);
  return { ...result, recordPath: path };
}

export function parseArgs(values) {
  const options = {};
  const valueOptions = new Set([
    "repo",
    "record",
    "qa-id",
    "qa-branch",
    "origin",
    "source-commit",
    "fix-id",
    "summary",
    "main-commit",
    "qa-commit",
    "method",
    "evidence",
    "regression",
    "regression-evidence",
    "regression-path",
    "candidate-commit",
    "result",
  ]);
  const keyMap = {
    record: "recordPath",
    "qa-id": "qaId",
    "qa-branch": "qaBranch",
    "source-commit": "sourceCommit",
    "fix-id": "fixId",
    "main-commit": "mainCommit",
    "qa-commit": "qaCommit",
    "regression-evidence": "regressionEvidence",
    "regression-path": "regressionPath",
    "candidate-commit": "candidateCommit",
  };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) fail("arguments", `unexpected argument ${value}`);
    const [rawKey, inlineValue] = value.slice(2).split("=", 2);
    if (!valueOptions.has(rawKey)) fail("arguments", `unknown option --${rawKey}`);
    const nextValue = inlineValue ?? values[++index];
    if (!nextValue || nextValue.startsWith("--")) fail("arguments", `--${rawKey} needs a value`);
    options[keyMap[rawKey] ?? rawKey.replaceAll("-", "_")] = nextValue;
  }
  return options;
}

function printHelp() {
  console.log(`Usage: npm run qa:reconcile -- <command> [options]

Commands:
  begin          Create a durable record and explicitly select main-first or qa-first.
  reconcile      Record the accepted behavior commit on main and/or the active QA branch.
  retest         Record a pass or fail for the current active QA candidate.
  status         Report origin, history coverage, retest state, and closure state.
  check          Exit non-zero while any accepted fix is unreconciled or un-retested.

Begin options:
  --repo PATH                    caneguard-web checkout (default: current checkout)
  --qa-id qa/YYYY-MM-DD-NN       active QA cycle identifier
  --qa-branch qa/YYYY-MM-DD-NN   active QA branch, required to be the QA ID
  --origin main|qa               selected fix origin, never inferred from worker branch
  --source-commit SHA             exact commit at the selected origin
  --fix-id ID                    stable QA defect identifier
  --summary TEXT                 short non-secret defect description
  --record PATH                  ignored record below .qa-staging

Reconcile options:
  --record PATH                  existing record, or use --repo and --qa-id
  --fix-id ID                    fix to update
  --main-commit SHA              accepted behavior commit reachable from main
  --qa-commit SHA                accepted behavior commit reachable from active qa/*
  --method cherry-pick|backport|equivalent-change
  --evidence TEXT                explain why the histories preserve equivalent behavior
  --regression added|not-applicable
  --regression-path PATH         test path when regression coverage was added
  --regression-evidence TEXT     test command or reason coverage is not applicable

Retest options:
  --record PATH --fix-id ID --candidate-commit SHA --result pass|fail --evidence TEXT

The commands do not create, merge, delete, or rewrite branches. A passing check means only
that reconciliation evidence is ready for separate human QA approval; it never records approval.`);
}

function main(argv) {
  const [command = "help", ...values] = argv;
  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }
  const options = parseArgs(values);
  if (command === "begin") {
    const record = beginReconciliation(options);
    console.log(formatReconciliationSummary(checkReconciliation({ repo: options.repo ?? SCRIPT_ROOT, recordPath: record.recordPath }), record.recordPath));
    return;
  }
  if (command === "reconcile") {
    const record = reconcileFix(options);
    console.log(formatReconciliationSummary(checkReconciliation({ repo: options.repo ?? SCRIPT_ROOT, recordPath: record.recordPath }), record.recordPath));
    return;
  }
  if (command === "retest") {
    const record = recordRetest(options);
    console.log(formatReconciliationSummary(checkReconciliation({ repo: options.repo ?? SCRIPT_ROOT, recordPath: record.recordPath }), record.recordPath));
    return;
  }
  if (command === "status" || command === "check") {
    const result = checkReconciliation(options);
    console.log(formatReconciliationSummary(result, result.recordPath));
    if (command === "check" && !result.ready) process.exitCode = 2;
    return;
  }
  fail("arguments", `unknown command ${command}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.warn("[deprecated] qa-reconcile is retired. Use the simple npm run staging workflow.");
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`[qa-reconcile] CLOSURE BLOCKED: ${error.message}`);
    process.exitCode = 1;
  }
}
