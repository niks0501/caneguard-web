#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseEnvFile, validateStagingConfig } from "./qa-staging.mjs";

export const FULL_SHA = /^[0-9a-f]{40}$/i;
export const QA_ID = /^qa\/[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{2}$/;
export const QA_DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
export const EXPECTED_REPOSITORIES = {
  web: "caneguard-web",
  mobile: "caneguard-mobile",
};

const SCRIPT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_STAGING_CONFIG = join(SCRIPT_ROOT, ".qa-staging", "staging.env");
const DEFAULT_RECORD_ROOT = join(SCRIPT_ROOT, ".qa-staging", "qa-cycles");
const DEFAULT_MOBILE_WORKTREE_ROOT = join(SCRIPT_ROOT, ".qa-staging", "mobile");
const MOBILE_TARGET_KEY = "EXPO_PUBLIC_API_BASE_URL";
const MOBILE_QA_MODE_KEY = "EXPO_PUBLIC_QA_MODE";
const MOBILE_EAS_ENVIRONMENT = "preview";
const MOBILE_EAS_CHANNEL = "qa";
const NPM_COMMAND = process.platform === "win32" ? "npm.cmd" : "npm";

export class QaOpenError extends Error {
  constructor(gate, message) {
    super(`[${gate}] ${message}`);
    this.name = "QaOpenError";
    this.gate = gate;
  }
}

function fail(gate, message) {
  throw new QaOpenError(gate, message);
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

function gitRemote(repo) {
  try {
    return git(["config", "--get", "remote.origin.url"], repo);
  } catch {
    return "";
  }
}

function repositoryName(repo, expected) {
  const remote = gitRemote(repo);
  const remoteName = basename(remote.replace(/[\\/]$/, "")).replace(/\.git$/, "");
  const directoryName = basename(repo);
  if (remoteName && remoteName !== expected) {
    fail(
      "repositories",
      `${expected} path points to remote repository ${remoteName}; use the matching caneguard repository`,
    );
  }
  if (!remoteName && directoryName !== expected) {
    fail(
      "repositories",
      `${expected} repository has no origin and its directory is ${directoryName}; pass a caneguard-${expected === "caneguard-web" ? "web" : "mobile"} checkout`,
    );
  }
  return expected;
}

function assertDirectory(repo, expected) {
  const resolved = resolve(repo);
  if (!existsSync(resolved) || !lstatSync(resolved).isDirectory()) {
    fail("repositories", `${expected} repository is not a directory: ${resolved}`);
  }
  try {
    const topLevel = resolve(git(["rev-parse", "--show-toplevel"], resolved));
    if (topLevel !== resolved) {
      fail("repositories", `${expected} path is not the root of a Git checkout: ${resolved}`);
    }
  } catch (error) {
    if (error instanceof QaOpenError) throw error;
    fail("repositories", `${expected} path is not a Git checkout: ${resolved}`);
  }
  repositoryName(resolved, expected);
  return resolved;
}

function isInside(root, candidate) {
  const path = relative(resolve(root), resolve(candidate));
  return path !== "" && !path.startsWith("..") && !isAbsolute(path);
}

function assertFullSha(value, label) {
  if (!FULL_SHA.test(value ?? "")) {
    fail(label, `${label} must be an exact 40-character commit SHA`);
  }
  return value.toLowerCase();
}

function mainRef(repo) {
  for (const ref of ["refs/heads/main", "refs/remotes/origin/main"]) {
    if (gitRefExists(repo, ref)) return ref;
  }
  fail("source-commits", `could not find main or origin/main in ${repo}`);
}

export function assertSelectedMainCommit(repo, commit, label) {
  const selected = assertFullSha(commit, label);
  let actual;
  try {
    actual = git(["rev-parse", "--verify", `${selected}^{commit}`], repo).toLowerCase();
  } catch {
    fail(label, `${label} does not exist as a commit in ${repo}`);
  }
  if (actual !== selected) {
    fail(label, `${label} resolves to ${actual}, not the explicitly selected ${selected}`);
  }
  const ref = mainRef(repo);
  if (!gitAncestor(repo, selected, ref)) {
    fail(
      label,
      `${label} ${selected} is not reachable from ${ref}; select a commit already present on main`,
    );
  }
  return selected;
}

function branchExistsAnywhere(repo, branch) {
  return gitRefExists(repo, `refs/heads/${branch}`) ||
    gitRefExists(repo, `refs/remotes/origin/${branch}`);
}

function existingQaNumbers(repo, date) {
  let refs = "";
  try {
    refs = git(
      [
        "for-each-ref",
        "--format=%(refname:short)",
        `refs/heads/qa/${date}-*`,
        `refs/remotes/origin/qa/${date}-*`,
      ],
      repo,
    );
  } catch {
    return new Set();
  }
  const numbers = new Set();
  for (const ref of refs.split("\n").filter(Boolean)) {
    const match = ref.match(new RegExp(`^qa/${date}-(\\d{2})$`));
    if (match) numbers.add(Number(match[1]));
  }
  return numbers;
}

export function nextQaId(date, repositories) {
  if (!QA_DATE.test(date)) fail("qa-id", `date must use YYYY-MM-DD: ${date}`);
  const used = new Set();
  for (const repo of repositories) {
    for (const number of existingQaNumbers(repo, date)) used.add(number);
  }
  for (let number = 1; number <= 99; number += 1) {
    if (!used.has(number)) return `qa/${date}-${String(number).padStart(2, "0")}`;
  }
  fail("qa-id", `all QA cycle numbers for ${date} are already used`);
}

function assertNewBranch(repo, branch) {
  if (!QA_ID.test(branch)) fail("qa-id", `invalid QA branch name: ${branch}`);
  if (branchExistsAnywhere(repo, branch)) {
    fail(
      "branches",
      `${branch} already exists in ${repositoryName(repo, repo === SCRIPT_ROOT ? EXPECTED_REPOSITORIES.web : EXPECTED_REPOSITORIES.mobile)}; choose a new QA cycle`,
    );
  }
}

function createBranch(repo, branch, commit) {
  try {
    execFileSync("git", ["branch", branch, commit], {
      cwd: repo,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const details = error?.stderr?.toString().trim();
    throw new Error(details || `could not create ${branch} in ${repo}`);
  }
  const actual = git(["rev-parse", "--verify", `refs/heads/${branch}`], repo).toLowerCase();
  if (actual !== commit.toLowerCase()) {
    throw new Error(`${branch} in ${repo} resolved to ${actual}, expected ${commit}`);
  }
}

function deleteCreatedBranch(repo, branch, commit) {
  try {
    execFileSync(
      "git",
      ["update-ref", "-d", `refs/heads/${branch}`, commit],
      { cwd: repo, stdio: "ignore" },
    );
  } catch {
    // Keep the original failure visible. A branch is never force-deleted here.
  }
}

export function createQaBranches({ webRepo, mobileRepo, branch, webCommit, mobileCommit }) {
  const selectedWebCommit = assertFullSha(webCommit, "Web/API commit");
  const selectedMobileCommit = assertFullSha(mobileCommit, "Mobile commit");
  assertNewBranch(webRepo, branch);
  assertNewBranch(mobileRepo, branch);

  const created = [];
  try {
    createBranch(webRepo, branch, selectedWebCommit);
    created.push([webRepo, branch, selectedWebCommit]);
    createBranch(mobileRepo, branch, selectedMobileCommit);
    created.push([mobileRepo, branch, selectedMobileCommit]);
  } catch (error) {
    for (const [repo, createdBranch, commit] of created.reverse()) {
      deleteCreatedBranch(repo, createdBranch, commit);
    }
    throw error;
  }

  return {
    web: git(["rev-parse", "--verify", `refs/heads/${branch}`], webRepo).toLowerCase(),
    mobile: git(["rev-parse", "--verify", `refs/heads/${branch}`], mobileRepo).toLowerCase(),
  };
}

function assertRegularFile(path, label) {
  let metadata;
  try {
    metadata = lstatSync(path);
  } catch (error) {
    fail(label, `${label} is unavailable at ${path}: ${error.message}`);
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    fail(label, `${label} must be a regular file, not a symlink or directory: ${path}`);
  }
}

function readStagingConfig(configPath, branch) {
  assertRegularFile(configPath, "staging configuration");
  if ((lstatSync(configPath).mode & 0o077) !== 0) {
    fail("staging-config", `staging configuration must be private (chmod 600): ${configPath}`);
  }
  const config = parseEnvFile(readFileSync(configPath, "utf8"));
  const errors = validateStagingConfig(config);
  if (errors.length > 0) fail("staging-config", errors.join("; "));
  if (config.QA_BRANCH !== branch) {
    return { config, branchMismatch: true };
  }
  return { config, branchMismatch: false };
}

function replaceBranchInConfig(configPath, branch) {
  assertRegularFile(configPath, "staging configuration");
  const original = readFileSync(configPath, "utf8");
  const matches = original.match(/^QA_BRANCH=.*$/gm) ?? [];
  if (matches.length !== 1) {
    fail("staging-config", "staging configuration must contain exactly one QA_BRANCH assignment");
  }
  const updated = original.replace(/^QA_BRANCH=.*$/m, `QA_BRANCH=${branch}`);
  const temporary = `${configPath}.qa-open-${process.pid}`;
  const mode = lstatSync(configPath).mode & 0o777;
  try {
    writeFileSync(temporary, updated, { mode });
    renameSync(temporary, configPath);
  } catch (error) {
    try {
      if (existsSync(temporary)) writeFileSync(configPath, original, { mode });
    } catch {
      // The original write failure remains the actionable error.
    }
    fail("staging-config", `could not select ${branch} in ${configPath}: ${error.message}`);
  }
  return parseEnvFile(updated);
}

function parsePublicOrigin(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(label, `${label} must be a valid HTTPS origin`);
  }
  if (
    url.protocol !== "https:" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    fail(label, `${label} must be an HTTPS origin without a path`);
  }
  return url.origin;
}

function parseHttpsUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(label, `${label} must be a valid HTTPS URL`);
  }
  if (url.protocol !== "https:") fail(label, `${label} must use HTTPS`);
  return url.toString();
}

export function readMobileTargetConfig(path, expectedOrigin) {
  assertRegularFile(path, "Mobile QA target configuration");
  const values = parseEnvFile(readFileSync(path, "utf8"));
  const target = parsePublicOrigin(values[MOBILE_TARGET_KEY] ?? "", MOBILE_TARGET_KEY);
  const expected = parsePublicOrigin(expectedOrigin, "staging public URL");
  if (target !== expected) {
    fail(
      "mobile-target",
      `${MOBILE_TARGET_KEY} is ${target}, but the selected staging origin is ${expected}`,
    );
  }
  if (values[MOBILE_QA_MODE_KEY] !== "true") {
    fail("mobile-target", `${MOBILE_QA_MODE_KEY} must be true for a Mobile QA candidate`);
  }
  return { apiBaseUrl: target, qaMode: true };
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function objectValue(value) {
  return value && typeof value === "object" ? value : {};
}

function identityFromEas(eas, delivery) {
  const value = objectValue(eas);
  const update = objectValue(value.update ?? value.updates?.[0]);
  const identity = objectValue(value.identity);
  const id = delivery === "build"
    ? firstValue(identity.id, value.id, value.buildId, value.build?.id)
    : firstValue(
        identity.id,
        value.updateGroupId,
        value.group,
        value.groupId,
        update.updateGroupId,
        update.group,
        update.id,
        value.id,
      );
  const detailsUrl = firstValue(
    identity.detailsUrl,
    value.buildDetailsUrl,
    value.detailsUrl,
    value.updateDetailsUrl,
    update.detailsUrl,
    update.updateDetailsUrl,
  );
  const artifactUrl = firstValue(
    identity.artifactUrl,
    value.artifactUrl,
    value.artifact?.url,
    value.build?.artifactUrl,
  );
  return { id, detailsUrl, artifactUrl };
}

export function parseMobileEasEvidence(contents, context = {}) {
  let raw;
  try {
    raw = JSON.parse(contents);
  } catch (error) {
    fail("mobile-eas", `Mobile EAS evidence is not valid JSON: ${error.message}`);
  }
  const envelope = objectValue(raw.qaCycle ?? raw);
  const eas = envelope.eas ?? envelope.result ?? envelope;
  const delivery = String(
    firstValue(envelope.delivery, envelope.kind, envelope.type) ?? "",
  ).toLowerCase();
  if (!new Set(["build", "update"]).has(delivery)) {
    fail("mobile-eas", "Mobile EAS evidence must declare delivery as build or update");
  }
  const identity = identityFromEas(
    {
      ...objectValue(eas),
      ...envelope,
      identity: envelope.identity ?? objectValue(eas).identity,
    },
    delivery,
  );
  const apiBaseUrl = firstValue(
    envelope.apiBaseUrl,
    envelope.stagingUrl,
    envelope.publicApiUrl,
    objectValue(eas).apiBaseUrl,
  );
  const sourceCommit = firstValue(
    envelope.sourceCommit,
    envelope.mobileCommit,
    objectValue(eas).gitCommitHash,
    objectValue(eas).gitCommit,
  );
  const result = {
    qaId: firstValue(envelope.qaId, context.qaId),
    sourceCommit: sourceCommit?.toLowerCase(),
    delivery,
    environment: firstValue(envelope.environment, objectValue(eas).environment),
    channel: firstValue(envelope.channel, objectValue(eas).channel),
    apiBaseUrl,
    id: identity.id,
    detailsUrl: identity.detailsUrl,
    artifactUrl: delivery === "build" ? identity.artifactUrl : null,
  };

  if (!result.id || typeof result.id !== "string") {
    fail("mobile-eas", `Mobile EAS ${delivery} evidence does not contain an identity`);
  }
  if (delivery === "build" && !result.artifactUrl) {
    fail("mobile-eas", "Mobile EAS build evidence does not contain an APK artifact URL");
  }
  if (delivery === "build" && result.artifactUrl) {
    result.artifactUrl = parseHttpsUrl(result.artifactUrl, "Mobile APK artifact URL");
  }
  if (context.qaId && result.qaId !== context.qaId) {
    fail("mobile-eas", `Mobile EAS evidence is for ${result.qaId}, not ${context.qaId}`);
  }
  if (context.mobileCommit && result.sourceCommit && result.sourceCommit !== context.mobileCommit.toLowerCase()) {
    fail(
      "mobile-eas",
      `Mobile EAS evidence names ${result.sourceCommit}, not the selected Mobile commit ${context.mobileCommit}`,
    );
  }
  if (context.stagingOrigin) {
    const expected = parsePublicOrigin(context.stagingOrigin, "staging public URL");
    const actual = parsePublicOrigin(result.apiBaseUrl ?? "", "Mobile EAS API target");
    if (actual !== expected) {
      fail("mobile-eas", `Mobile EAS candidate targets ${actual}, not ${expected}`);
    }
  }
  if (result.environment !== MOBILE_EAS_ENVIRONMENT) {
    fail("mobile-eas", `Mobile EAS environment must be ${MOBILE_EAS_ENVIRONMENT}`);
  }
  if (result.channel !== MOBILE_EAS_CHANNEL) {
    fail("mobile-eas", `Mobile EAS channel must be ${MOBILE_EAS_CHANNEL}`);
  }
  return result;
}

function ensureCandidateWorktree(repo, branch, worktree) {
  try {
    lstatSync(worktree);
    fail("mobile-worktree", `Mobile candidate worktree already exists: ${worktree}`);
  } catch (error) {
    if (error instanceof QaOpenError) throw error;
  }
  mkdirSync(dirname(worktree), { recursive: true, mode: 0o700 });
  try {
    execFileSync("git", ["worktree", "add", worktree, branch], {
      cwd: repo,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const details = error?.stderr?.toString().trim();
    fail("mobile-worktree", details || `could not create the Mobile candidate worktree at ${worktree}`);
  }
  const actualBranch = git(["branch", "--show-current"], worktree);
  if (actualBranch !== branch) {
    fail("mobile-worktree", `Mobile candidate worktree is on ${actualBranch || "no branch"}, expected ${branch}`);
  }
}

function runCommand(command, args, cwd, env, gate) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    stdio: "inherit",
  });
  if (result.error) fail(gate, `could not start ${command}: ${result.error.message}`);
  if (result.status !== 0) {
    fail(gate, `${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}`);
  }
}

function runNpmScript(cwd, args, env, gate) {
  runCommand(NPM_COMMAND, args, cwd, env, gate);
}

function safeCommandEnvironment() {
  const environment = {};
  for (const key of ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL"]) {
    if (process.env[key]) environment[key] = process.env[key];
  }
  environment.CI = "true";
  return environment;
}

function configArgument(webRepo, configPath) {
  const value = relative(webRepo, configPath);
  if (!value || value.startsWith("..") || isAbsolute(value)) {
    fail("staging-config", `staging configuration must be inside ${webRepo}`);
  }
  return value;
}

function assertBranchHead(repo, branch, expected, label) {
  const actual = git(["rev-parse", "--verify", `refs/heads/${branch}`], repo).toLowerCase();
  if (actual !== expected.toLowerCase()) {
    fail(label, `${branch} in ${repo} moved to ${actual}; expected frozen commit ${expected}`);
  }
  return actual;
}

function assertCandidateWorktree(worktree, branch, expected, label) {
  const actualBranch = git(["branch", "--show-current"], worktree);
  if (actualBranch !== branch) {
    fail(label, `candidate worktree ${worktree} is on ${actualBranch || "no branch"}, expected ${branch}`);
  }
  const actualCommit = git(["rev-parse", "--verify", "HEAD"], worktree).toLowerCase();
  if (actualCommit !== expected.toLowerCase()) {
    fail(label, `candidate worktree ${worktree} moved to ${actualCommit}; expected ${expected}`);
  }
  const status = git(["status", "--porcelain", "--untracked-files=all"], worktree);
  if (status !== "") fail(label, `candidate worktree ${worktree} has uncommitted source changes`);
  return actualCommit;
}

function initialRecord({ qaId, webRepo, mobileRepo, webCommit, mobileCommit, recordPath }) {
  return {
    version: 1,
    qaId,
    createdAt: new Date().toISOString(),
    readiness: "NOT_OPEN",
    humanQa: "pending",
    repositories: {
      web: { name: EXPECTED_REPOSITORIES.web, path: webRepo, branch: qaId, commit: webCommit },
      mobile: { name: EXPECTED_REPOSITORIES.mobile, path: mobileRepo, branch: qaId, commit: mobileCommit },
    },
    recordPath,
    reconciliation: {
      recordPath: join(
        dirname(recordPath),
        `${qaId.replace(/^qa\//, "")}-reconciliation.json`,
      ),
      status: "REQUIRED_BEFORE_CLOSURE",
    },
    staging: { endpoint: null, database: "caneguard_staging", configPath: null },
    mobile: { target: null, delivery: null, identity: null, artifactUrl: null },
    gates: {},
    failedGate: null,
    failure: null,
  };
}

function persistRecord(record, recordPath) {
  mkdirSync(dirname(recordPath), { recursive: true, mode: 0o700 });
  const temporary = `${recordPath}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, recordPath);
}

function passGate(record, gate, evidence, recordPath) {
  record.gates[gate] = { status: "PASS", ...(evidence ? { evidence } : {}) };
  persistRecord(record, recordPath);
}

function failGate(record, error, recordPath) {
  record.readiness = "NOT_OPEN";
  record.failedGate = error.gate ?? "workflow";
  record.failure = error.message.replace(/^\[[^\]]+\] /, "");
  record.gates[record.failedGate] = {
    status: "FAIL",
    message: record.failure,
  };
  persistRecord(record, recordPath);
}

function runGate(record, name, action, recordPath) {
  try {
    const evidence = action();
    passGate(record, name, evidence, recordPath);
    return evidence;
  } catch (error) {
    const normalized = error instanceof QaOpenError
      ? new QaOpenError(name, error.message.replace(/^\[[^\]]+\] /, ""))
      : new QaOpenError(name, error.message);
    failGate(record, normalized, recordPath);
    normalized.record = record;
    throw normalized;
  }
}

function resolveOptions(input) {
  const webRepo = resolve(input.webRepo ?? SCRIPT_ROOT);
  const mobileRepo = resolve(input.mobileRepo ?? "");
  if (!input.mobileRepo) fail("arguments", "--mobile-repo is required");
  const resolved = {
    ...input,
    webRepo,
    mobileRepo,
    webCommit: input.webCommit,
    mobileCommit: input.mobileCommit,
    stagingConfig: resolve(webRepo, input.stagingConfig ?? ".qa-staging/staging.env"),
  };
  if (input.mobileTarget) resolved.mobileTarget = resolve(input.mobileTarget);
  else resolved.mobileTarget = resolve(mobileRepo, ".env.qa.local");
  if (input.mobileEasRecord) resolved.mobileEasRecord = resolve(input.mobileEasRecord);
  else fail("arguments", "--mobile-eas-record is required so an EAS identity cannot be invented");
  resolved.recordPath = input.record ? resolve(webRepo, input.record) : null;
  resolved.mobileWorktree = input.mobileWorktree ? resolve(input.mobileWorktree) : null;
  return resolved;
}

export function openQaCycle(input, dependencies = {}) {
  const options = resolveOptions(input);
  const webRepo = assertDirectory(options.webRepo, EXPECTED_REPOSITORIES.web);
  const mobileRepo = assertDirectory(options.mobileRepo, EXPECTED_REPOSITORIES.mobile);
  const webCommit = assertFullSha(options.webCommit, "Web/API commit");
  const mobileCommit = assertFullSha(options.mobileCommit, "Mobile commit");
  const qaId = options.qaId ?? nextQaId(
    options.date ?? new Date().toISOString().slice(0, 10),
    [webRepo, mobileRepo],
  );
  if (!QA_ID.test(qaId)) fail("qa-id", `QA ID must use qa/YYYY-MM-DD-NN: ${qaId}`);
  const branch = qaId;
  const recordPath = options.recordPath ?? join(
    webRepo,
    ".qa-staging",
    "qa-cycles",
    `${qaId.replace(/^qa\//, "")}.json`,
  );
  const mobileWorktree = options.mobileWorktree ?? join(
    webRepo,
    ".qa-staging",
    "mobile",
    qaId.replace(/^qa\//, ""),
  );
  if (!isInside(join(webRepo, ".qa-staging"), recordPath)) {
    fail("record", `release record must be inside ${join(webRepo, ".qa-staging")}`);
  }
  if (!isInside(join(webRepo, ".qa-staging"), mobileWorktree)) {
    fail("mobile-worktree", `Mobile candidate worktree must be inside ${join(webRepo, ".qa-staging")}`);
  }
  if (!isInside(mobileRepo, options.mobileTarget)) {
    fail("mobile-target", `Mobile QA target configuration must be inside ${mobileRepo}`);
  }
  const record = initialRecord({
    qaId,
    webRepo,
    mobileRepo,
    webCommit,
    mobileCommit,
    recordPath,
  });
  const save = () => persistRecord(record, recordPath);
  const commandEnvironment = safeCommandEnvironment();
  save();

  try {
    const selected = runGate(record, "source-commits", () => ({
      web: assertSelectedMainCommit(webRepo, webCommit, "Web/API commit"),
      mobile: assertSelectedMainCommit(mobileRepo, mobileCommit, "Mobile commit"),
    }), recordPath);
    record.repositories.web.commit = selected.web;
    record.repositories.mobile.commit = selected.mobile;
    save();

    const staging = runGate(record, "staging-config", () => {
      if (!isInside(join(webRepo, ".qa-staging"), options.stagingConfig)) {
        fail("staging-config", `staging configuration must be inside ${join(webRepo, ".qa-staging")}`);
      }
      const result = readStagingConfig(options.stagingConfig, branch);
      record.staging.endpoint = result.config.QA_PUBLIC_URL;
      record.staging.configPath = options.stagingConfig;
      return {
        endpoint: result.config.QA_PUBLIC_URL,
        database: result.config.DB_DATABASE,
        worktreePath: result.config.QA_WORKTREE_PATH,
        branchBeforeSelection: result.config.QA_BRANCH,
      };
    }, recordPath);

    const target = runGate(record, "mobile-target", () =>
      readMobileTargetConfig(options.mobileTarget, staging.endpoint), recordPath);
    record.mobile.target = target.apiBaseUrl;
    save();

    const mobileEvidence = runGate(record, "mobile-eas", () => {
      assertRegularFile(options.mobileEasRecord, "Mobile EAS evidence");
      return parseMobileEasEvidence(
        readFileSync(options.mobileEasRecord, "utf8"),
        { qaId, mobileCommit, stagingOrigin: staging.endpoint },
      );
    }, recordPath);
    record.mobile.delivery = mobileEvidence.delivery;
    record.mobile.identity = {
      id: mobileEvidence.id,
      detailsUrl: mobileEvidence.detailsUrl ?? null,
      environment: mobileEvidence.environment,
      channel: mobileEvidence.channel,
    };
    record.mobile.artifactUrl = mobileEvidence.artifactUrl;
    save();

    runGate(record, "device-state", () => {
      if (!options.deviceStateCleared) {
        fail(
          "device-state",
          "pass --device-state-cleared only after clearing CaneGuard app data on every QA device",
        );
      }
      return "operator-confirmed app data clear; human QA approval is still pending";
    }, recordPath);

    runGate(record, "branches", () => {
      const branches = dependencies.createBranches
        ? dependencies.createBranches({ webRepo, mobileRepo, branch, webCommit, mobileCommit })
        : createQaBranches({ webRepo, mobileRepo, branch, webCommit, mobileCommit });
      if (branches.web !== webCommit || branches.mobile !== mobileCommit) {
        fail("branches", "matching QA branches did not resolve to both selected commits");
      }
      return {
        web: `${EXPECTED_REPOSITORIES.web}:${branch}@${branches.web}`,
        mobile: `${EXPECTED_REPOSITORIES.mobile}:${branch}@${branches.mobile}`,
      };
    }, recordPath);

    runGate(record, "staging-config-selection", () => {
      const selectedConfig = replaceBranchInConfig(options.stagingConfig, branch);
      const errors = validateStagingConfig(selectedConfig);
      if (errors.length > 0 || selectedConfig.QA_BRANCH !== branch) {
        fail("staging-config-selection", errors.join("; ") || "QA_BRANCH selection was not persisted");
      }
      return `QA_BRANCH=${branch}`;
    }, recordPath);

    const configArg = configArgument(webRepo, options.stagingConfig);
    const stagingWorktree = resolve(webRepo, staging.worktreePath);
    runGate(record, "staging-checkout", () => {
      runNpmScript(webRepo, ["run", "qa:staging", "--", "checkout", "--config", configArg], commandEnvironment, "staging-checkout");
      assertCandidateWorktree(stagingWorktree, branch, webCommit, "staging-checkout");
      return staging.worktreePath;
    }, recordPath);

    runGate(record, "mobile-worktree", () => {
      ensureCandidateWorktree(mobileRepo, branch, mobileWorktree);
      return mobileWorktree;
    }, recordPath);

    runGate(record, "dependencies", () => {
      runNpmScript(stagingWorktree, ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], commandEnvironment, "dependencies");
      runCommand(
        "composer",
        ["install", "--working-dir=api", "--no-interaction", "--no-progress", "--prefer-dist"],
        stagingWorktree,
        commandEnvironment,
        "dependencies",
      );
      runNpmScript(mobileWorktree, ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], commandEnvironment, "dependencies");
      return "npm ci and composer install from lockfiles in both candidate worktrees";
    }, recordPath);

    runGate(record, "automated-web-api", () => {
      runNpmScript(stagingWorktree, ["run", "check:all"], commandEnvironment, "automated-web-api");
      runNpmScript(
        stagingWorktree,
        ["run", "contract:producer", "--", "--mobile-dir", mobileWorktree, "--mobile-ref", mobileCommit],
        commandEnvironment,
        "automated-web-api",
      );
      return ["npm run check:all", "npm run contract:producer -- --mobile-dir <Mobile candidate> --mobile-ref <Mobile SHA>"];
    }, recordPath);

    runGate(record, "automated-mobile", () => {
      for (const args of [
        ["run", "lint"],
        ["run", "typecheck"],
        ["test", "--", "--runInBand"],
      ]) {
        runNpmScript(mobileWorktree, args, commandEnvironment, "automated-mobile");
      }
      return ["npm run lint", "npm run typecheck", "npm test -- --runInBand"];
    }, recordPath);

    runGate(record, "staging-database", () => {
      runNpmScript(webRepo, ["run", "qa:staging", "--", "cycle", "--config", configArg], commandEnvironment, "staging-database");
      return "qa:staging cycle (migrate:fresh --seed --force)";
    }, recordPath);

    runGate(record, "public-https-smoke", () => {
      runNpmScript(webRepo, ["run", "qa:staging", "--", "public-start", "--config", configArg], commandEnvironment, "public-https-smoke");
      runNpmScript(webRepo, ["run", "qa:staging", "--", "public-ready", "--config", configArg], commandEnvironment, "public-https-smoke");
      return `qa:staging public-start and public-ready through ${staging.endpoint}`;
    }, recordPath);

    runGate(record, "candidate-freeze", () => {
      const frozenWeb = assertBranchHead(webRepo, branch, webCommit, "candidate-freeze");
      const frozenMobile = assertBranchHead(mobileRepo, branch, mobileCommit, "candidate-freeze");
      const frozenWebWorktree = assertCandidateWorktree(stagingWorktree, branch, webCommit, "candidate-freeze");
      const mobileWorktreeCommit = assertCandidateWorktree(mobileWorktree, branch, mobileCommit, "candidate-freeze");
      return { web: frozenWeb, mobile: frozenMobile, webWorktree: frozenWebWorktree, mobileWorktree: mobileWorktreeCommit };
    }, recordPath);

    record.readiness = "QA OPEN";
    record.humanQa = "pending";
    record.failedGate = null;
    record.failure = null;
    save();
    return record;
  } catch (error) {
    if (!(error instanceof QaOpenError)) {
      const normalized = new QaOpenError("workflow", error.message);
      failGate(record, normalized, recordPath);
      normalized.record = record;
      throw normalized;
    }
    throw error;
  }
}

export function formatQaSummary(record) {
  const mobileIdentity = record.mobile.identity?.id
    ? `${record.mobile.delivery === "build" ? "EAS Preview APK build" : "EAS Update group"} ${record.mobile.identity.id}`
      + (record.mobile.artifactUrl ? ` (${record.mobile.artifactUrl})` : "")
    : "not captured";
  const lines = [
    `QA ID: ${record.qaId}`,
    `Web repository: ${record.repositories.web.name}`,
    `Web/API commit: ${record.repositories.web.commit}`,
    `Mobile repository: ${record.repositories.mobile.name}`,
    `Mobile commit: ${record.repositories.mobile.commit}`,
    `Staging endpoint: ${record.staging.endpoint ?? "not verified"}`,
    `Mobile artifact/update identity: ${mobileIdentity}`,
    `Readiness: ${record.readiness}${record.humanQa === "pending" ? " (human QA approval pending)" : ""}`,
  ];
  if (record.failedGate) lines.push(`Failed gate: ${record.failedGate} - ${record.failure}`);
  lines.push(`Release record: ${record.recordPath}`);
  lines.push(`Reconciliation record: ${record.reconciliation?.recordPath ?? "not created until a QA fix is found"}`);
  return lines.join("\n");
}

function parseArgs(values) {
  const options = { webRepo: SCRIPT_ROOT };
  const valueOptions = new Set([
    "web-repo",
    "mobile-repo",
    "web-commit",
    "mobile-commit",
    "qa-id",
    "date",
    "staging-config",
    "mobile-target",
    "mobile-eas-record",
    "mobile-worktree",
    "record",
  ]);
  const keyMap = {
    "web-repo": "webRepo",
    "mobile-repo": "mobileRepo",
    "web-commit": "webCommit",
    "mobile-commit": "mobileCommit",
    "qa-id": "qaId",
    date: "date",
    "staging-config": "stagingConfig",
    "mobile-target": "mobileTarget",
    "mobile-eas-record": "mobileEasRecord",
    "mobile-worktree": "mobileWorktree",
    record: "record",
  };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--help" || value === "-h") return { help: true };
    if (!value.startsWith("--")) fail("arguments", `unexpected argument ${value}`);
    const [rawKey, inlineValue] = value.slice(2).split("=", 2);
    if (rawKey === "device-state-cleared") {
      if (inlineValue !== undefined) fail("arguments", "--device-state-cleared does not take a value");
      options.deviceStateCleared = true;
      continue;
    }
    if (!valueOptions.has(rawKey)) fail("arguments", `unknown option --${rawKey}`);
    const nextValue = inlineValue ?? values[++index];
    if (!nextValue || nextValue.startsWith("--")) fail("arguments", `--${rawKey} needs a value`);
    options[keyMap[rawKey]] = nextValue;
  }
  if (!options.mobileRepo) fail("arguments", "--mobile-repo is required");
  for (const key of ["webCommit", "mobileCommit"]) {
    if (!options[key]) fail("arguments", `--${key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)} is required`);
  }
  if (options.date && !QA_DATE.test(options.date)) fail("qa-id", "--date must use YYYY-MM-DD");
  if (options.qaId && !QA_ID.test(options.qaId)) fail("qa-id", "--qa-id must use qa/YYYY-MM-DD-NN");
  return options;
}

function printHelp() {
  console.log(`Usage: npm run qa:open -- [options]

Required:
  --mobile-repo PATH             caneguard-mobile checkout
  --web-commit SHA               exact Web/API commit already reachable from main
  --mobile-commit SHA             exact Mobile commit already reachable from main
  --mobile-target PATH            Mobile .env.qa.local with the public staging URL
  --mobile-eas-record PATH        sanitized EAS evidence envelope
  --device-state-cleared          confirm CaneGuard app data was cleared on QA devices

Optional:
  --qa-id qa/YYYY-MM-DD-NN        use an explicit new cycle ID
  --date YYYY-MM-DD               choose the date when generating the next cycle ID
  --staging-config PATH           ignored .qa-staging/staging.env path
  --mobile-worktree PATH          dedicated Mobile candidate worktree path
  --record PATH                   ignored JSON release record path

The command creates the same frozen QA branch in both named repositories, runs the existing
qa:staging cycle and public smoke workflow, runs Web/API and Mobile automated checks, and
reports QA OPEN only when every gate passes. It never records human QA approval.`);
}

if (pathResolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const parsed = parseArgs(process.argv.slice(2));
    if (parsed.help) {
      printHelp();
    } else {
      const record = openQaCycle(parsed);
      console.log(formatQaSummary(record));
    }
  } catch (error) {
    console.error(`[qa-open] NOT OPEN: ${error.message}`);
    if (error.record) console.error(formatQaSummary(error.record));
    process.exitCode = 1;
  }
}

function pathResolve(path) {
  return resolve(path ?? "");
}

export {
  DEFAULT_MOBILE_WORKTREE_ROOT,
  DEFAULT_RECORD_ROOT,
  DEFAULT_STAGING_CONFIG,
  MOBILE_EAS_CHANNEL,
  MOBILE_EAS_ENVIRONMENT,
  MOBILE_QA_MODE_KEY,
  MOBILE_TARGET_KEY,
  parseArgs,
  parsePublicOrigin,
  parseHttpsUrl,
};
