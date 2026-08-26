#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { checkReconciliation } from "./qa-reconcile.mjs";
import { EXPECTED_REPOSITORIES, FULL_SHA, QA_ID } from "./qa-open.mjs";

const SCRIPT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NPM_COMMAND = process.platform === "win32" ? "npm.cmd" : "npm";
const TERMINAL_STATES = new Set(["APPROVED", "ABANDONED"]);
const APPROVAL_RESULTS = new Set(["PASS", "PASSED"]);
const ABANDONMENT_RESULTS = new Set(["FAILED", "FAIL", "ABANDONED"]);

export { TERMINAL_STATES };

export class QaCloseError extends Error {
  constructor(gate, message) {
    super(`[${gate}] ${message}`);
    this.name = "QaCloseError";
    this.gate = gate;
  }
}

function fail(gate, message) {
  throw new QaCloseError(gate, message);
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

function gitRemote(repo, remote = "origin") {
  try {
    return git(["config", "--get", `remote.${remote}.url`], repo);
  } catch {
    return "";
  }
}

function assertRepository(repo, expected) {
  const resolved = resolve(repo ?? "");
  let topLevel;
  try {
    topLevel = resolve(git(["rev-parse", "--show-toplevel"], resolved));
  } catch {
    fail("repositories", `${expected} path is not a Git checkout: ${resolved}`);
  }
  if (topLevel !== resolved) {
    fail("repositories", `${expected} path is not the root of a Git checkout: ${resolved}`);
  }
  const remote = gitRemote(resolved);
  const remoteName = basename(remote.replace(/[\\/]$/, "")).replace(/\.git$/, "");
  if (remoteName && remoteName !== expected) {
    fail("repositories", `${expected} path points to remote repository ${remoteName}`);
  }
  return resolved;
}

function assertInside(root, candidate, gate, label) {
  const path = relative(resolve(root), resolve(candidate));
  if (!path || path.startsWith("..") || isAbsolute(path)) {
    fail(gate, `${label} must be inside ${resolve(root)}`);
  }
  return resolve(candidate);
}

function assertRecordPath(repo, recordPath) {
  return assertInside(
    join(repo, ".qa-staging"),
    isAbsolute(recordPath) ? recordPath : resolve(repo, recordPath),
    "record",
    "release record",
  );
}

export function defaultReleaseRecordPath(repo, qaId) {
  if (!QA_ID.test(qaId ?? "")) {
    fail("qa-id", `QA ID must use qa/YYYY-MM-DD-NN: ${qaId}`);
  }
  return join(
    resolve(repo),
    ".qa-staging",
    "qa-cycles",
    `${qaId.replace(/^qa\//, "")}.json`,
  );
}

function resolveRecordPath(input, webRepo) {
  if (input.recordPath || input.record) {
    return assertRecordPath(webRepo, input.recordPath ?? input.record);
  }
  if (input.qaId) return defaultReleaseRecordPath(webRepo, input.qaId);
  fail("record", "pass --record or --qa-id");
}

function assertFullSha(value, label) {
  if (!FULL_SHA.test(value ?? "")) {
    fail(label, `${label} must be an exact 40-character commit SHA`);
  }
  return value.toLowerCase();
}

function safeString(value, label, { max = 2000 } = {}) {
  if (typeof value !== "string" || value.trim() === "") {
    fail(label, `${label} must be a non-empty string`);
  }
  if (value.length > max) fail(label, `${label} must be at most ${max} characters`);
  return value.trim();
}

function readCycleRecord(recordPath) {
  if (!existsSync(recordPath)) fail("record", `release record is missing: ${recordPath}`);
  let record;
  try {
    record = JSON.parse(readFileSync(recordPath, "utf8"));
  } catch (error) {
    fail("record", `release record is not valid JSON: ${error.message}`);
  }
  if (record?.version !== 1) fail("record", "release record has an unsupported version");
  if (!QA_ID.test(record.qaId ?? "")) {
    fail("record", `release record has an invalid QA ID: ${record.qaId}`);
  }
  if (record.repositories?.web?.name !== EXPECTED_REPOSITORIES.web) {
    fail("record", "release record does not identify caneguard-web as the Web repository");
  }
  if (record.repositories?.mobile?.name !== EXPECTED_REPOSITORIES.mobile) {
    fail("record", "release record does not identify caneguard-mobile as the Mobile repository");
  }
  if (record.repositories?.web?.branch !== record.qaId) {
    fail("record", "Web repository branch does not match the QA ID");
  }
  if (record.repositories?.mobile?.branch !== record.qaId) {
    fail("record", "Mobile repository branch does not match the QA ID");
  }
  assertFullSha(record.repositories?.web?.commit, "Web/API commit");
  assertFullSha(record.repositories?.mobile?.commit, "Mobile commit");
  return record;
}

function cloneRecord(record) {
  return JSON.parse(JSON.stringify(record));
}

function branchRef(repo, branch) {
  const local = `refs/heads/${branch}`;
  if (gitRefExists(repo, local)) {
    return {
      branch,
      ref: local,
      kind: "local",
      commit: git(["rev-parse", "--verify", local], repo).toLowerCase(),
    };
  }
  const remote = `refs/remotes/origin/${branch}`;
  if (gitRefExists(repo, remote)) {
    return {
      branch,
      ref: remote,
      kind: "remote",
      remote: "origin",
      commit: git(["rev-parse", "--verify", remote], repo).toLowerCase(),
    };
  }
  return null;
}

export function inspectQaBranches({ webRepo, mobileRepo, branch }) {
  const web = branchRef(webRepo, branch);
  const mobile = branchRef(mobileRepo, branch);
  return {
    web,
    mobile,
    complete: Boolean(web && mobile),
  };
}

function worktreeEntries(repo) {
  let output;
  try {
    output = git(["worktree", "list", "--porcelain"], repo);
  } catch (error) {
    fail("worktrees", `could not inspect worktrees in ${repo}: ${error.message}`);
  }
  const entries = [];
  let entry = null;
  for (const line of output.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (entry) entries.push(entry);
      entry = { path: resolve(line.slice("worktree ".length)) };
    } else if (entry && line.startsWith("branch ")) {
      entry.branch = line.slice("branch ".length).replace(/^refs\/heads\//, "");
    }
  }
  if (entry) entries.push(entry);
  return entries;
}

function removeWorktree(repo, path, branch) {
  if (!existsSync(path)) return { status: "ABSENT", path };
  const metadata = lstatSync(path);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    fail("worktrees", `candidate worktree is not a regular directory: ${path}`);
  }
  const entry = worktreeEntries(repo).find((candidate) => candidate.path === resolve(path));
  if (!entry) {
    fail("worktrees", `candidate path is not a registered Git worktree: ${path}`);
  }
  if (entry.branch && entry.branch !== branch) {
    fail("worktrees", `${path} is on ${entry.branch}, not ${branch}`);
  }
  try {
    execFileSync("git", ["worktree", "remove", "--force", path], {
      cwd: repo,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const details = error?.stderr?.toString().trim();
    fail("worktrees", details || `could not remove candidate worktree ${path}`);
  }
  if (existsSync(path)) fail("worktrees", `candidate worktree remains after removal: ${path}`);
  return { status: "REMOVED", path };
}

function candidateWorktreePath(record, key, webRepo, mobileWorktree) {
  if (key === "web") {
    const configured = record.staging?.worktreePath ?? record.gates?.["staging-checkout"]?.evidence;
    if (!configured) return null;
    return assertInside(
      join(webRepo, ".qa-staging"),
      resolve(webRepo, configured),
      "worktrees",
      "Web candidate worktree",
    );
  }
  const configured = mobileWorktree ?? record.gates?.["mobile-worktree"]?.evidence;
  if (typeof configured !== "string" || configured.trim() === "") return null;
  return assertInside(
    join(webRepo, ".qa-staging"),
    resolve(configured),
    "worktrees",
    "Mobile candidate worktree",
  );
}

function removeCandidateWorktrees(record, options, dependencies) {
  const remove = dependencies.removeWorktree ?? removeWorktree;
  const webPath = candidateWorktreePath(record, "web", options.webRepo, options.mobileWorktree);
  const mobilePath = candidateWorktreePath(record, "mobile", options.webRepo, options.mobileWorktree);
  const result = {
    web: webPath ? remove(options.webRepo, webPath, record.qaId) : { status: "NOT_RECORDED" },
    mobile: mobilePath ? remove(options.mobileRepo, mobilePath, record.qaId) : { status: "NOT_RECORDED" },
  };
  return result;
}

function githubRepositoryFromRemote(remote) {
  const value = remote.trim();
  const match = value.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/i);
  return match ? `${match[1]}/${match[2]}` : null;
}

function resolveGithubRepository(repo, requested) {
  const value = requested ?? githubRepositoryFromRemote(gitRemote(repo));
  if (!value || !/^[^/\s]+\/[^/\s]+$/.test(value)) {
    fail("release-record", "GitHub repository must be supplied as OWNER/REPOSITORY or be discoverable from origin");
  }
  return value;
}

function githubIssueUrl(repository, issue) {
  return `https://github.com/${repository}/issues/${issue}`;
}

function extractIssueDetails(output, repository, requestedIssue) {
  const text = String(output ?? "");
  const issue = requestedIssue ?? Number(text.match(/\bnumber:\s*(\d+)/i)?.[1] ?? 0);
  if (!Number.isInteger(issue) || issue <= 0) {
    fail("release-record", "gh-axi did not return a GitHub issue number");
  }
  const url = text.match(/\burl:\s*(https?:\/\/\S+)/i)?.[1]?.replace(/[),]$/, "")
    ?? githubIssueUrl(repository, issue);
  return { issue, url };
}

function runGhAxi(args) {
  try {
    return execFileSync("gh-axi", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const details = error?.stderr?.toString().trim();
    throw new Error(details || `gh-axi ${args.join(" ")} failed`);
  }
}

function releaseIssueTitle(record) {
  return `[QA] ${record.qaId} ${record.status}`;
}

function findExistingReleaseIssue(repository, title) {
  const output = runGhAxi([
    "issue",
    "list",
    "-R",
    repository,
    "--state",
    "all",
    "--limit",
    "1000",
  ]);
  for (const line of output.split("\n")) {
    const match = line.match(/^\s*(\d+),"(.*)",(open|closed),/);
    if (match && match[2] === title) {
      return { issue: Number(match[1]), url: githubIssueUrl(repository, Number(match[1])) };
    }
  }
  return null;
}

export function buildReleaseIssueBody(record, webRepo) {
  const release = record.release ?? {};
  const eas = release.eas ?? {};
  const branchPolicy = record.status === "APPROVED" ? "retained" : "deleted from both repositories";
  const lines = [
    `# CaneGuard QA cycle ${record.qaId}`,
    "",
    `State: **${record.status}**`,
    `QA ID: \`${record.qaId}\``,
    `Mobile commit: \`${release.mobileCommit ?? record.repositories?.mobile?.commit ?? "not recorded"}\``,
    `Web/API commit: \`${release.webApiCommit ?? record.repositories?.web?.commit ?? "not recorded"}\``,
    `EAS delivery: **${eas.delivery ?? "not recorded"}**`,
    `EAS build or update identity: \`${eas.identity ?? "not recorded"}\``,
    `Final QA result: **${release.finalQaResult ?? record.finalQaResult ?? "not recorded"}**`,
    `QA branches: **${branchPolicy}**`,
    "",
  ];

  if (record.status === "APPROVED") {
    lines.push(`Approval date: ${release.approvalDate ?? record.approvalDate ?? "not recorded"}`);
    lines.push(`Human approver: ${release.humanApprover ?? record.humanApprover ?? "not recorded"}`);
  } else {
    lines.push(`Abandoned at: ${release.abandonedAt ?? "not recorded"}`);
    lines.push(`Abandoned by: ${release.abandonedBy ?? "not recorded"}`);
    lines.push(`Abandonment reason: ${release.reason ?? "not recorded"}`);
  }

  lines.push(
    "",
    "## Evidence",
    `Initial Mobile commit: \`${record.repositories?.mobile?.commit ?? "not recorded"}\``,
    `Initial Web/API commit: \`${record.repositories?.web?.commit ?? "not recorded"}\``,
    `Mobile artifact/update details: ${eas.detailsUrl ?? "not recorded"}`,
    `Mobile artifact URL: ${eas.artifactUrl ?? "not applicable"}`,
    `Reconciliation: ${record.reconciliation?.status ?? "not recorded"}`,
    `Staging shutdown: ${record.stagingShutdown?.status ?? "not recorded"}`,
    "Tailscale Funnel and staging API/Web processes were stopped before terminal state was recorded.",
    "The `caneguard_staging` database was retained for post-QA investigation and is reset only when the next QA cycle begins.",
    `Local cycle record: \`${relative(webRepo, record.recordPath ?? "") || record.recordPath || ".qa-staging/qa-cycles"}\``,
  );
  return `${lines.join("\n")}\n`;
}

export function publishGitHubReleaseRecord({ record, body, githubRepo, githubIssue }) {
  const repository = resolveGithubRepository(record.repositories?.web?.path ?? SCRIPT_ROOT, githubRepo);
  if (githubIssue !== undefined && githubIssue !== null) {
    const issue = Number(githubIssue);
    if (!Number.isInteger(issue) || issue <= 0) {
      fail("release-record", "GitHub issue must be a positive integer");
    }
    runGhAxi([
      "issue",
      "comment",
      String(issue),
      "-R",
      repository,
      "--body",
      body,
    ]);
    return {
      provider: "github",
      status: "RECORDED",
      repository,
      issue,
      url: githubIssueUrl(repository, issue),
      recordedAt: new Date().toISOString(),
    };
  }

  const title = releaseIssueTitle(record);
  const existing = findExistingReleaseIssue(repository, title);
  if (existing) {
    runGhAxi([
      "issue",
      "edit",
      String(existing.issue),
      "-R",
      repository,
      "--body",
      body,
    ]);
    return {
      provider: "github",
      status: "RECORDED",
      repository,
      ...existing,
      recordedAt: new Date().toISOString(),
    };
  }

  const output = runGhAxi([
    "issue",
    "create",
    "-R",
    repository,
    "--title",
    title,
    "--body",
    body,
  ]);
  const details = extractIssueDetails(output, repository);
  return {
    provider: "github",
    status: "RECORDED",
    repository,
    ...details,
    recordedAt: new Date().toISOString(),
  };
}

function reconciliationPath(record, webRepo) {
  const configured = record.reconciliation?.recordPath;
  if (configured) {
    return assertInside(
      join(webRepo, ".qa-staging"),
      resolve(webRepo, configured),
      "reconciliation",
      "reconciliation record",
    );
  }
  return defaultReleaseRecordPath(webRepo, record.qaId).replace(/\.json$/, "-reconciliation.json");
}

export function inspectReconciliation(record, webRepo, { requireReady = true } = {}) {
  const path = reconciliationPath(record, webRepo);
  if (!existsSync(path)) {
    return {
      status: "NOT_REQUIRED",
      recordPath: path,
      reason: "No QA fix reconciliation record exists for this cycle.",
      result: null,
    };
  }
  try {
    const result = checkReconciliation({ repo: webRepo, recordPath: path });
    if (!result.ready && requireReady) {
      fail(
        "reconciliation",
        `reconciliation is not ready for approval: ${result.blocked.map((fix) => `${fix.id}:${fix.status}`).join(", ") || "closure blocked"}`,
      );
    }
    return {
      status: result.ready ? "READY" : "BLOCKED",
      recordPath: path,
      result,
    };
  } catch (error) {
    if (requireReady) {
      if (error instanceof QaCloseError) throw error;
      fail("reconciliation", error.message);
    }
    return {
      status: "PRESENT_BUT_UNAVAILABLE",
      recordPath: path,
      reason: `Reconciliation evidence could not be evaluated during abandonment: ${error.message}`,
      result: null,
    };
  }
}

function requireHumanApproval(input) {
  if (input.confirmHumanApproval !== true && input.humanApprovalConfirmed !== true) {
    fail(
      "human-approval",
      "approval requires --confirm-human-approval and an explicit human approver; automation cannot infer approval",
    );
  }
  return safeString(input.humanApprover ?? input.approver ?? input.approvedBy, "human approver", { max: 200 });
}

function parseApprovalDate(value, nowValue) {
  if (value === undefined || value === null || value === "") {
    return { approvalDate: nowValue.slice(0, 10), approvedAt: nowValue };
  }
  const text = safeString(value, "approval date", { max: 100 });
  const date = new Date(text);
  if (Number.isNaN(date.valueOf())) fail("approval-date", "approval date must be an ISO date or timestamp");
  return {
    approvalDate: date.toISOString().slice(0, 10),
    approvedAt: date.toISOString(),
  };
}

function normalizeApprovalResult(value) {
  const result = String(value ?? "").trim().toUpperCase();
  if (!APPROVAL_RESULTS.has(result)) {
    fail("final-result", "approved cycles require an explicit final QA result of pass");
  }
  return "PASS";
}

function normalizeAbandonmentResult(value) {
  const result = String(value ?? "ABANDONED").trim().toUpperCase();
  if (!ABANDONMENT_RESULTS.has(result)) {
    fail("final-result", "abandoned cycles require a final QA result of failed or abandoned");
  }
  return result === "FAIL" ? "FAILED" : result;
}

function assertOpenForApproval(record) {
  if (record.status && TERMINAL_STATES.has(record.status)) {
    fail("lifecycle", `cycle is already terminal as ${record.status}; use status or publish for its existing record`);
  }
  if (record.readiness !== "QA OPEN") {
    fail("readiness", `only a QA OPEN cycle can be approved, not ${record.readiness ?? "unknown"}`);
  }
  if (record.failedGate || record.failure) {
    fail("readiness", "a cycle with a failed readiness gate cannot be approved");
  }
  if (!record.mobile?.identity?.id || !record.mobile?.delivery) {
    fail("mobile-eas", "approval requires the exact EAS build or update identity captured at QA opening");
  }
}

function assertNotTerminal(record) {
  if (record.status && TERMINAL_STATES.has(record.status)) {
    fail("lifecycle", `cycle is already terminal as ${record.status}`);
  }
}

function candidateEvidence(record, branches) {
  if (!branches.complete) {
    fail("branches", `matching QA branch ${record.qaId} must exist in both repositories before closure`);
  }
  return {
    web: {
      commit: assertFullSha(branches.web.commit, "Web/API candidate commit"),
      ref: branches.web.ref,
      kind: branches.web.kind,
    },
    mobile: {
      commit: assertFullSha(branches.mobile.commit, "Mobile candidate commit"),
      ref: branches.mobile.ref,
      kind: branches.mobile.kind,
    },
  };
}

function assertCandidateIdentityForApproval(record, candidate, reconciliation) {
  const selectedWeb = assertFullSha(record.repositories.web.commit, "Web/API commit");
  const selectedMobile = assertFullSha(record.repositories.mobile.commit, "Mobile commit");
  if (candidate.mobile.commit !== selectedMobile) {
    fail(
      "candidate-freeze",
      `Mobile QA branch moved to ${candidate.mobile.commit}; the EAS artifact/update was captured for ${selectedMobile}. Abandon and open a new QA ID with a new artifact.`,
    );
  }
  const mobileEvidence = assertFullSha(
    record.mobile.sourceCommit ?? selectedMobile,
    "Mobile EAS source commit",
  );
  if (mobileEvidence !== candidate.mobile.commit) {
    fail(
      "mobile-eas",
      `Mobile EAS evidence names ${mobileEvidence}, not the final Mobile candidate ${candidate.mobile.commit}`,
    );
  }
  if (candidate.web.commit !== selectedWeb) {
    if (reconciliation.status !== "READY" || !reconciliation.result?.fixes?.length) {
      fail(
        "candidate-freeze",
        `Web/API QA branch moved to ${candidate.web.commit} without a ready QA fix reconciliation record; use a new QA ID or reconcile the accepted fix first`,
      );
    }
  }
}

function stagingConfigArgument(webRepo, configPath) {
  const resolved = resolve(webRepo, configPath ?? ".qa-staging/staging.env");
  return assertInside(join(webRepo, ".qa-staging"), resolved, "staging", "staging configuration");
}

async function stopStaging(webRepo, configPath, dependencies) {
  if (dependencies.stopStaging) {
    return await dependencies.stopStaging({ webRepo, configPath });
  }
  const configArgument = relative(webRepo, stagingConfigArgument(webRepo, configPath));
  const result = spawnSync(
    NPM_COMMAND,
    ["run", "qa:staging", "--", "stop", "--config", configArgument],
    {
      cwd: webRepo,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) fail("staging-shutdown", `could not stop QA staging: ${result.error.message}`);
  if (result.status !== 0) {
    fail("staging-shutdown", `qa:staging stop failed with exit code ${result.status ?? "unknown"}`);
  }
  return {
    status: "STOPPED_OR_NOT_RUNNING",
    funnel: "stopped_or_not_running",
    services: "stopped_or_not_running",
    database: "caneguard_staging retained",
    command: `npm run qa:staging -- stop --config ${configArgument}`,
  };
}

function terminalRecord(record, mode, context, nowValue) {
  const next = cloneRecord(record);
  const isApproved = mode === "APPROVED";
  const release = {
    state: mode,
    qaId: record.qaId,
    mobileCommit: context.candidate.mobile.commit,
    webApiCommit: context.candidate.web.commit,
    eas: {
      delivery: record.mobile.delivery,
      identity: record.mobile.identity.id,
      detailsUrl: record.mobile.identity.detailsUrl ?? null,
      artifactUrl: record.mobile.artifactUrl ?? null,
    },
    finalQaResult: context.finalQaResult,
  };
  if (isApproved) {
    release.approvalDate = context.approval.approvalDate;
    release.approvedAt = context.approval.approvedAt;
    release.humanApprover = context.approver;
  } else {
    release.abandonedAt = nowValue;
    release.abandonedBy = context.abandonedBy;
    release.reason = context.reason;
  }

  next.status = mode;
  next.readiness = mode;
  next.humanQa = isApproved ? "approved" : "abandoned";
  next.finalQaResult = context.finalQaResult;
  next.mobileCommit = release.mobileCommit;
  next.webApiCommit = release.webApiCommit;
  next.easIdentity = release.eas;
  next.release = release;
  next.reconciliation = {
    ...(next.reconciliation ?? {}),
    recordPath: context.reconciliation.recordPath,
    status: context.reconciliation.status,
    ...(context.reconciliation.reason ? { reason: context.reconciliation.reason } : {}),
  };
  next.stagingShutdown = {
    status: "PASS",
    recordedAt: nowValue,
    database: "caneguard_staging retained",
    evidence: context.staging,
  };
  next.candidate = {
    initial: {
      webApiCommit: record.repositories.web.commit,
      mobileCommit: record.repositories.mobile.commit,
    },
    tested: {
      webApiCommit: context.candidate.web.commit,
      mobileCommit: context.candidate.mobile.commit,
    },
    webRef: context.candidate.web.ref,
    mobileRef: context.candidate.mobile.ref,
  };
  next.branches = {
    policy: isApproved ? "RETAINED" : "DELETED",
    web: context.branches.web,
    mobile: context.branches.mobile,
  };
  next.closure = {
    state: mode,
    recordedAt: nowValue,
    branchPolicy: isApproved ? "retain matching qa/* branches" : "delete matching qa/* branches",
    staging: "Funnel and staging services stopped; caneguard_staging retained",
  };
  if (isApproved) {
    next.approval = {
      result: "PASS",
      approvalDate: context.approval.approvalDate,
      approvedAt: context.approval.approvedAt,
      humanApprover: context.approver,
    };
    next.approvalDate = context.approval.approvalDate;
    next.humanApprover = context.approver;
    delete next.abandonment;
  } else {
    next.abandonment = {
      result: context.finalQaResult,
      abandonedAt: nowValue,
      abandonedBy: context.abandonedBy,
      reason: context.reason,
    };
    delete next.approval;
    delete next.approvalDate;
    delete next.humanApprover;
  }
  next.releaseRecord = {
    provider: "github",
    status: "PENDING",
    ...(context.githubRepo ? { repository: context.githubRepo } : {}),
    ...(context.githubIssue ? { issue: context.githubIssue } : {}),
  };
  return next;
}

async function publishTerminalRecord(record, recordPath, options, dependencies) {
  const body = buildReleaseIssueBody(record, options.webRepo);
  let published;
  try {
    published = dependencies.publishReleaseRecord
      ? await dependencies.publishReleaseRecord({
          record,
          body,
          githubRepo: options.githubRepo,
          githubIssue: options.githubIssue,
        })
      : publishGitHubReleaseRecord({
          record,
          body,
          githubRepo: options.githubRepo,
          githubIssue: options.githubIssue,
        });
  } catch (error) {
    record.releaseRecord = {
      ...(record.releaseRecord ?? { provider: "github" }),
      status: "PENDING",
      attemptedAt: new Date().toISOString(),
      error: error.message,
    };
    persistRecord(record, recordPath);
    fail("release-record", `cycle is terminal locally but its GitHub release record is pending: ${error.message}`);
  }
  record.releaseRecord = published;
  persistRecord(record, recordPath);
  return record;
}

function persistRecord(record, recordPath) {
  mkdirSync(dirname(recordPath), { recursive: true, mode: 0o700 });
  const temporary = `${recordPath}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, recordPath);
}

function resolveOptions(input, command) {
  const webRepo = assertRepository(input.webRepo ?? SCRIPT_ROOT, EXPECTED_REPOSITORIES.web);
  const recordPath = resolveRecordPath(input, webRepo);
  const record = readCycleRecord(recordPath);
  const mobileRepo = input.mobileRepo
    ? assertRepository(input.mobileRepo, EXPECTED_REPOSITORIES.mobile)
    : null;
  if (["approve", "abandon"].includes(command) && !mobileRepo) {
    fail("arguments", "--mobile-repo is required for approval or abandonment");
  }
  return {
    ...input,
    command,
    webRepo,
    mobileRepo,
    recordPath,
    record,
    stagingConfig: input.stagingConfig ?? ".qa-staging/staging.env",
    mobileWorktree: input.mobileWorktree ? resolve(webRepo, input.mobileWorktree) : null,
    githubIssue: input.githubIssue === undefined ? undefined : Number(input.githubIssue),
  };
}

export async function approveQaCycle(input, dependencies = {}) {
  const options = resolveOptions(input, "approve");
  const { record } = options;
  assertOpenForApproval(record);
  const approver = requireHumanApproval(options);
  const finalQaResult = normalizeApprovalResult(options.finalQaResult ?? options.finalResult);
  const nowValue = (dependencies.now ?? (() => new Date().toISOString()))();
  const approval = parseApprovalDate(options.approvalDate ?? options.approvedAt, nowValue);
  const reconciliation = inspectReconciliation(record, options.webRepo);
  const branches = inspectQaBranches({
    webRepo: options.webRepo,
    mobileRepo: options.mobileRepo,
    branch: record.qaId,
  });
  const candidate = candidateEvidence(record, branches);
  assertCandidateIdentityForApproval(record, candidate, reconciliation);
  const staging = await stopStaging(options.webRepo, options.stagingConfig, dependencies);
  const terminal = terminalRecord(
    record,
    "APPROVED",
    {
      approver,
      approval,
      finalQaResult,
      reconciliation,
      candidate,
      branches: {
        web: { status: "RETAINED", commit: candidate.web.commit, ref: candidate.web.ref },
        mobile: { status: "RETAINED", commit: candidate.mobile.commit, ref: candidate.mobile.ref },
      },
      staging,
      githubRepo: options.githubRepo,
      githubIssue: options.githubIssue,
    },
    nowValue,
  );
  persistRecord(terminal, options.recordPath);
  return publishTerminalRecord(terminal, options.recordPath, options, dependencies);
}

export async function abandonQaCycle(input, dependencies = {}) {
  const options = resolveOptions(input, "abandon");
  const { record } = options;
  assertNotTerminal(record);
  if (options.confirmAbandonment !== true) {
    fail("abandonment", "abandonment requires --confirm-abandonment");
  }
  const abandonedBy = safeString(
    options.abandonedBy ?? options.confirmedBy ?? options.approver,
    "abandonment confirmer",
    { max: 200 },
  );
  const reason = safeString(options.reason ?? options.abandonReason, "abandonment reason");
  const finalQaResult = normalizeAbandonmentResult(options.finalQaResult ?? options.finalResult);
  const nowValue = (dependencies.now ?? (() => new Date().toISOString()))();
  const reconciliation = inspectReconciliation(record, options.webRepo, { requireReady: false });
  const branches = inspectQaBranches({
    webRepo: options.webRepo,
    mobileRepo: options.mobileRepo,
    branch: record.qaId,
  });
  const candidate = {
    web: branches.web
      ? { commit: branches.web.commit, ref: branches.web.ref, kind: branches.web.kind }
      : { commit: record.repositories.web.commit, ref: null, kind: "ABSENT" },
    mobile: branches.mobile
      ? { commit: branches.mobile.commit, ref: branches.mobile.ref, kind: branches.mobile.kind }
      : { commit: record.repositories.mobile.commit, ref: null, kind: "ABSENT" },
  };
  const staging = await stopStaging(options.webRepo, options.stagingConfig, dependencies);
  const worktrees = dependencies.removeCandidateWorktrees
    ? await dependencies.removeCandidateWorktrees({ record, options })
    : removeCandidateWorktrees(record, options, dependencies);
  const deleted = dependencies.deleteQaBranches
    ? await dependencies.deleteQaBranches({
        webRepo: options.webRepo,
        mobileRepo: options.mobileRepo,
        branch: record.qaId,
      })
    : deleteQaBranches({
        webRepo: options.webRepo,
        mobileRepo: options.mobileRepo,
        branch: record.qaId,
      });
  const terminal = terminalRecord(
    record,
    "ABANDONED",
    {
      abandonedBy,
      reason,
      finalQaResult,
      reconciliation,
      candidate,
      branches: {
        web: { ...(deleted.web ?? {}), before: candidate.web },
        mobile: { ...(deleted.mobile ?? {}), before: candidate.mobile },
      },
      staging: { ...staging, worktrees },
      githubRepo: options.githubRepo,
      githubIssue: options.githubIssue,
    },
    nowValue,
  );
  persistRecord(terminal, options.recordPath);
  return publishTerminalRecord(terminal, options.recordPath, options, dependencies);
}

export function deleteQaBranches({ webRepo, mobileRepo, branch }, dependencies = {}) {
  const results = {};
  for (const [key, repo] of [["web", webRepo], ["mobile", mobileRepo]]) {
    const localRef = `refs/heads/${branch}`;
    const remoteRef = `refs/remotes/origin/${branch}`;
    const result = { local: "ABSENT", remote: "ABSENT" };
    if (gitRefExists(repo, localRef)) {
      const checkedOut = worktreeEntries(repo).find((entry) => entry.branch === branch);
      if (checkedOut) {
        fail("branches", `cannot delete ${branch} in ${repo}: it is checked out at ${checkedOut.path}`);
      }
      const commit = git(["rev-parse", "--verify", localRef], repo);
      try {
        execFileSync("git", ["update-ref", "-d", localRef, commit], {
          cwd: repo,
          stdio: "ignore",
        });
      } catch (error) {
        fail("branches", `could not delete local ${branch} in ${repo}: ${error.message}`);
      }
      if (gitRefExists(repo, localRef)) fail("branches", `local ${branch} remains in ${repo}`);
      result.local = "DELETED";
    }
    const remote = "origin";
    const hasRemoteTrackingRef = gitRefExists(repo, remoteRef);
    const hasRemoteBranch = hasRemoteTrackingRef || remoteBranchExists(repo, remote, branch);
    if (hasRemoteBranch) {
      if (dependencies.deleteRemoteBranch) {
        dependencies.deleteRemoteBranch({ repo, remote, branch });
      } else {
        deleteRemoteBranch(repo, remote, branch);
      }
      if (hasRemoteTrackingRef) {
        try {
          execFileSync("git", ["update-ref", "-d", remoteRef], { cwd: repo, stdio: "ignore" });
        } catch {
          // The remote was deleted successfully. A stale local tracking ref is harmless but is removed when possible.
        }
      }
      if (gitRefExists(repo, remoteRef)) fail("branches", `remote tracking ref ${remoteRef} remains in ${repo}`);
      result.remote = "DELETED";
    }
    results[key] = result;
  }
  return results;
}

function remoteBranchExists(repo, remote, branch) {
  const remoteUrl = gitRemote(repo, remote);
  if (!remoteUrl) return false;
  const slug = githubRepositoryFromRemote(remoteUrl);
  if (slug) {
    try {
      runGhAxi(["api", "GET", `/repos/${slug}/git/ref/heads/${branch}`]);
      return true;
    } catch (error) {
      if (/404|not found|resource not found/i.test(error.message)) return false;
      fail("branches", `could not inspect remote ${remote}/${branch}: ${error.message}`);
    }
  }
  try {
    return execFileSync("git", ["ls-remote", "--heads", remote, `refs/heads/${branch}`], {
      cwd: repo,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim() !== "";
  } catch (error) {
    const details = error?.stderr?.toString().trim();
    fail("branches", details || `could not inspect remote ${remote}/${branch}`);
  }
}

function deleteRemoteBranch(repo, remote, branch) {
  const slug = githubRepositoryFromRemote(gitRemote(repo, remote));
  if (slug) {
    try {
      runGhAxi(["api", "DELETE", `/repos/${slug}/git/refs/heads/${branch}`]);
    } catch (error) {
      if (!/404|not found|resource not found/i.test(error.message)) throw error;
    }
    return;
  }
  try {
    execFileSync("git", ["push", remote, "--delete", branch], {
      cwd: repo,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const details = error?.stderr?.toString().trim();
    fail("branches", details || `could not delete remote ${remote}/${branch}`);
  }
}

export async function publishPendingReleaseRecord(input, dependencies = {}) {
  const options = resolveOptions(input, "publish");
  const record = options.record;
  if (!TERMINAL_STATES.has(record.status)) {
    fail("lifecycle", "only a terminal cycle can publish a release record");
  }
  if (record.releaseRecord?.status === "RECORDED") return record;
  const body = buildReleaseIssueBody(record, options.webRepo);
  let published;
  try {
    published = dependencies.publishReleaseRecord
      ? await dependencies.publishReleaseRecord({
          record,
          body,
          githubRepo: options.githubRepo,
          githubIssue: options.githubIssue,
        })
      : publishGitHubReleaseRecord({
          record,
          body,
          githubRepo: options.githubRepo,
          githubIssue: options.githubIssue,
        });
  } catch (error) {
    fail("release-record", error.message);
  }
  record.releaseRecord = published;
  persistRecord(record, options.recordPath);
  return record;
}

export function formatQaCloseSummary(record) {
  const release = record.release ?? {};
  const eas = release.eas ?? {};
  const lines = [
    `QA ID: ${record.qaId}`,
    `Final state: ${record.status ?? record.readiness ?? "ACTIVE"}`,
    `Final QA result: ${record.finalQaResult ?? release.finalQaResult ?? "pending"}`,
    `Mobile commit: ${release.mobileCommit ?? record.repositories?.mobile?.commit ?? "not recorded"}`,
    `Web/API commit: ${release.webApiCommit ?? record.repositories?.web?.commit ?? "not recorded"}`,
    `EAS ${eas.delivery ?? "delivery"} identity: ${eas.identity ?? "not recorded"}`,
    `QA branches: ${record.branches?.policy ?? "active"}`,
    `Staging shutdown: ${record.stagingShutdown?.status ?? "pending"}`,
    `Staging database: ${record.stagingShutdown?.database ?? "caneguard_staging retained after stop"}`,
    `Release record: ${record.releaseRecord?.url ?? record.releaseRecord?.status ?? "pending"}`,
    `Local cycle record: ${record.recordPath ?? "not recorded"}`,
  ];
  if (record.status === "APPROVED") {
    lines.push(`Approval date: ${record.approvalDate ?? release.approvalDate ?? "not recorded"}`);
    lines.push(`Human approver: ${record.humanApprover ?? release.humanApprover ?? "not recorded"}`);
  }
  if (record.status === "ABANDONED") {
    lines.push(`Abandoned by: ${record.abandonment?.abandonedBy ?? release.abandonedBy ?? "not recorded"}`);
    lines.push(`Abandonment reason: ${record.abandonment?.reason ?? release.reason ?? "not recorded"}`);
  }
  return lines.join("\n");
}

export function parseArgs(values) {
  const options = {};
  const valueOptions = new Set([
    "web-repo",
    "mobile-repo",
    "qa-id",
    "record",
    "staging-config",
    "mobile-worktree",
    "github-repo",
    "github-issue",
    "human-approver",
    "approver",
    "approved-by",
    "confirmed-by",
    "abandoned-by",
    "reason",
    "abandon-reason",
    "final-result",
    "final-qa-result",
    "approval-date",
    "approved-at",
  ]);
  const keyMap = {
    "web-repo": "webRepo",
    "mobile-repo": "mobileRepo",
    "qa-id": "qaId",
    record: "recordPath",
    "staging-config": "stagingConfig",
    "mobile-worktree": "mobileWorktree",
    "github-repo": "githubRepo",
    "github-issue": "githubIssue",
    "human-approver": "humanApprover",
    approver: "approver",
    "approved-by": "approvedBy",
    "confirmed-by": "confirmedBy",
    "abandoned-by": "abandonedBy",
    reason: "reason",
    "abandon-reason": "abandonReason",
    "final-result": "finalResult",
    "final-qa-result": "finalQaResult",
    "approval-date": "approvalDate",
    "approved-at": "approvedAt",
  };
  const booleanOptions = new Map([
    ["confirm-human-approval", "confirmHumanApproval"],
    ["human-approval-confirmed", "humanApprovalConfirmed"],
    ["confirm-abandonment", "confirmAbandonment"],
  ]);

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--help" || value === "-h") return { help: true };
    if (!value.startsWith("--")) fail("arguments", `unexpected argument ${value}`);
    const [rawKey, inlineValue] = value.slice(2).split("=", 2);
    if (booleanOptions.has(rawKey)) {
      if (inlineValue !== undefined) fail("arguments", `--${rawKey} does not take a value`);
      options[booleanOptions.get(rawKey)] = true;
      continue;
    }
    if (!valueOptions.has(rawKey)) fail("arguments", `unknown option --${rawKey}`);
    const nextValue = inlineValue ?? values[++index];
    if (!nextValue || nextValue.startsWith("--")) fail("arguments", `--${rawKey} needs a value`);
    options[keyMap[rawKey]] = nextValue;
  }
  return options;
}

function printHelp() {
  console.log(`Usage: npm run qa:close -- <approve|abandon|publish|status> [options]

Common options:
  --record PATH                  ignored .qa-staging/qa-cycles/<cycle>.json path
  --qa-id qa/YYYY-MM-DD-NN       use the default cycle record for this QA ID
  --web-repo PATH                caneguard-web checkout (default: current checkout)
  --mobile-repo PATH             caneguard-mobile checkout for branch verification/deletion
  --staging-config PATH          ignored staging.env path (used for shutdown)
  --github-repo OWNER/REPOSITORY GitHub release-record repository, inferred from origin
  --github-issue NUMBER           comment on an existing cycle issue instead of creating one

Approve options:
  --confirm-human-approval       explicit human decision confirmation, never inferred from checks
  --human-approver NAME           human who approved the final QA result
  --final-result pass             explicit final human QA result
  --approval-date ISO-DATE        approval date, defaulting to the current UTC date

Abandon options:
  --confirm-abandonment           explicit confirmation that this cycle is failed or abandoned
  --abandoned-by NAME             human who confirmed abandonment
  --reason TEXT                   non-secret reason for abandonment
  --final-result failed|abandoned final state result, default abandoned
  --mobile-worktree PATH          candidate Mobile worktree when it is not in the opening record

The command stops Tailscale Funnel and QA API/Web services without resetting caneguard_staging.
Approval retains both matching qa/* branches.
Abandonment removes candidate worktrees and deletes both matching branches.
A GitHub QA-cycle issue is created or updated as the discoverable release record.
Use publish to retry a pending GitHub record after a local terminal state has already been recorded.`);
}

async function main(argv) {
  const [command = "help", ...values] = argv;
  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }
  const parsed = parseArgs(values);
  if (parsed.help) {
    printHelp();
    return;
  }
  if (!["approve", "abandon", "publish", "status"].includes(command)) {
    fail("arguments", `unknown command ${command}`);
  }
  const options = resolveOptions(parsed, command);
  if (command === "status") {
    console.log(formatQaCloseSummary(options.record));
    return;
  }
  const record = command === "approve"
    ? await approveQaCycle(parsed)
    : command === "abandon"
      ? await abandonQaCycle(parsed)
      : await publishPendingReleaseRecord(parsed);
  console.log(formatQaCloseSummary(record));
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  console.warn("[deprecated] qa-close is retired. Use npm run staging -- stop; staging data is retained.");
  main(process.argv.slice(2)).catch((error) => {
    console.error(`[qa-close] ${error.message}`);
    process.exitCode = 1;
  });
}
