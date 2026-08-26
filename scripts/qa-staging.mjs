#!/usr/bin/env node

import { execFileSync, spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const EXPECTED_SEEDED_REPORT_COUNT = 12;
export const EXPECTED_SEEDED_REFERENCE_CODE = "CG-2026-0001";
export const SEEDED_USERS = {
  fieldReporter: {
    email: "field@caneguard.test",
    role: "field_reporter",
    passwordKey: "CANEGUARD_FIELD_PASSWORD",
  },
  reviewer: {
    email: "mao@caneguard.test",
    role: "reviewer",
    passwordKey: "CANEGUARD_REVIEWER_PASSWORD",
  },
  administrator: {
    email: "admin@caneguard.test",
    role: "admin",
    passwordKey: "CANEGUARD_ADMIN_PASSWORD",
  },
};

const SCRIPT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CONFIG_PATH = join(SCRIPT_ROOT, ".qa-staging", "staging.env");
const CONFIG_EXAMPLE_PATH = join(
  SCRIPT_ROOT,
  ".qa-staging",
  "staging.env.example",
);
const STATE_PATH = join(SCRIPT_ROOT, ".qa-staging", "state.json");
const LOG_PATH = join(SCRIPT_ROOT, ".qa-staging", "logs");
const CONFIG_PLACEHOLDER = /^(?:<[^>]+>|replace[-_ ]?me|change[-_ ]?me)$/i;
const PRIVATE_BIND_HOST = "127.0.0.1";
const FUNNEL_PORTS = new Set(["443", "8443", "10000"]);
const NPM_COMMAND = process.platform === "win32" ? "npm.cmd" : "npm";
const TEST_API_BASE_URL = "http://localhost:8000";
const SEEDED_REPORT_CLIENT_UUID = "30000000-0000-4000-8000-000000000001";
const REQUIRED_KEYS = [
  "QA_BRANCH",
  "QA_WORKTREE_PATH",
  "QA_API_HOST",
  "QA_API_PORT",
  "QA_API_URL",
  "QA_WEB_HOST",
  "QA_WEB_PORT",
  "QA_WEB_URL",
  "QA_PUBLIC_URL",
  "QA_FUNNEL_PORT",
  "APP_NAME",
  "APP_ENV",
  "APP_KEY",
  "APP_DEBUG",
  "APP_MAINTENANCE_DRIVER",
  "APP_MAINTENANCE_STORE",
  "APP_URL",
  "FRONTEND_URL",
  "CORS_ALLOWED_ORIGINS",
  "SANCTUM_STATEFUL_DOMAINS",
  "SESSION_DRIVER",
  "SESSION_SECURE_COOKIE",
  "SESSION_SAME_SITE",
  "FILESYSTEM_DISK",
  "QUEUE_CONNECTION",
  "CACHE_STORE",
  "DB_CONNECTION",
  "DB_HOST",
  "DB_PORT",
  "DB_DATABASE",
  "DB_USERNAME",
  "DB_PASSWORD",
  "CANEGUARD_FIELD_PASSWORD",
  "CANEGUARD_REVIEWER_PASSWORD",
  "CANEGUARD_ADMIN_PASSWORD",
  "VITE_API_BASE_URL",
  "VITE_DATA_SOURCE",
];
const APPLICATION_ENV_KEYS = [
  "APP_NAME",
  "APP_ENV",
  "APP_KEY",
  "APP_DEBUG",
  "APP_MAINTENANCE_DRIVER",
  "APP_MAINTENANCE_STORE",
  "APP_URL",
  "APP_LOCALE",
  "APP_FALLBACK_LOCALE",
  "APP_FAKER_LOCALE",
  "BCRYPT_ROUNDS",
  "LOG_CHANNEL",
  "LOG_STACK",
  "LOG_LEVEL",
  "DB_CONNECTION",
  "DB_HOST",
  "DB_PORT",
  "DB_DATABASE",
  "DB_USERNAME",
  "DB_PASSWORD",
  "DB_URL",
  "DB_CHARSET",
  "DB_COLLATION",
  "DB_TIMEZONE",
  "FRONTEND_URL",
  "CORS_ALLOWED_ORIGINS",
  "SANCTUM_STATEFUL_DOMAINS",
  "SESSION_DRIVER",
  "SESSION_LIFETIME",
  "SESSION_ENCRYPT",
  "SESSION_PATH",
  "SESSION_DOMAIN",
  "SESSION_SECURE_COOKIE",
  "SESSION_HTTP_ONLY",
  "SESSION_SAME_SITE",
  "BROADCAST_CONNECTION",
  "FILESYSTEM_DISK",
  "QUEUE_CONNECTION",
  "CACHE_STORE",
  "MAIL_MAILER",
  "CANEGUARD_FIELD_PASSWORD",
  "CANEGUARD_REVIEWER_PASSWORD",
  "CANEGUARD_ADMIN_PASSWORD",
  "VITE_API_BASE_URL",
  "VITE_DATA_SOURCE",
  "VITE_REPORT_REFRESH_MS",
  "VITE_MAPTILER_KEY",
];

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function shellGit(args, cwd = SCRIPT_ROOT) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function parseEnvValue(rawValue) {
  const value = rawValue.trim();

  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }

  const commentIndex = value.indexOf(" #");
  return commentIndex === -1 ? value : value.slice(0, commentIndex).trimEnd();
}

export function parseEnvFile(contents) {
  const values = {};
  const errors = [];

  contents.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) return;

    const separator = trimmed.indexOf("=");
    if (separator <= 0) {
      errors.push(`line ${index + 1} must use KEY=VALUE syntax`);
      return;
    }

    const key = trimmed.slice(0, separator).trim();
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
      errors.push(`line ${index + 1} has an invalid environment key`);
      return;
    }

    values[key] = parseEnvValue(trimmed.slice(separator + 1));
  });

  if (errors.length > 0) {
    throw new Error(`Invalid QA staging configuration:\n- ${errors.join("\n- ")}`);
  }

  return values;
}

function isPlaceholder(value) {
  return value === "" || CONFIG_PLACEHOLDER.test(value);
}

function isPort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

function isHttpsOrigin(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

function originHost(value) {
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

function isSafeStagingBranch(branch) {
  if (!branch || branch === "main" || branch === "master") return false;

  return (
    /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(branch) &&
    !branch.includes("..") &&
    !branch.endsWith("/") &&
    !branch.endsWith(".") &&
    !branch.includes("//") &&
    !branch.includes("@{") &&
    !branch.split("/").some(
      (part) => part.startsWith(".") || part.endsWith(".lock"),
    )
  );
}

export function validateStagingConfig(config) {
  const errors = [];

  for (const key of REQUIRED_KEYS) {
    if (isPlaceholder(config[key] ?? "")) {
      errors.push(`${key} must be set`);
    }
  }

  if (config.QA_BRANCH && !isSafeStagingBranch(config.QA_BRANCH)) {
    errors.push(
      "QA_BRANCH must name a safe non-main staging branch (for example staging or qa/2026-08-27-02)",
    );
  }

  if (config.QA_WORKTREE_PATH) {
    const worktreePath = resolve(SCRIPT_ROOT, config.QA_WORKTREE_PATH);
    const allowedRoot = resolve(SCRIPT_ROOT, ".qa-staging");
    const worktreeRelative = relative(allowedRoot, worktreePath);
    if (
      isAbsolute(config.QA_WORKTREE_PATH) ||
      worktreeRelative === "" ||
      worktreeRelative.startsWith("..") ||
      isAbsolute(worktreeRelative)
    ) {
      errors.push("QA_WORKTREE_PATH must point below .qa-staging");
    }
  }

  for (const key of ["QA_API_PORT", "QA_WEB_PORT", "DB_PORT", "QA_FUNNEL_PORT"]) {
    if (config[key] && !isPort(config[key])) {
      errors.push(`${key} must be a TCP port between 1 and 65535`);
    }
  }

  if (config.QA_FUNNEL_PORT && !FUNNEL_PORTS.has(String(config.QA_FUNNEL_PORT))) {
    errors.push("QA_FUNNEL_PORT must be one of 443, 8443, or 10000 for Tailscale Funnel");
  }

  for (const key of ["QA_API_HOST", "QA_WEB_HOST", "DB_HOST"]) {
    if (config[key] && config[key] !== PRIVATE_BIND_HOST) {
      errors.push(`${key} must be ${PRIVATE_BIND_HOST} to keep local staging private`);
    }
  }

  if (config.QA_API_PORT === config.QA_WEB_PORT) {
    errors.push("QA_API_PORT and QA_WEB_PORT must be different");
  }

  if (config.APP_ENV && config.APP_ENV !== "qa-staging") {
    errors.push("APP_ENV must be qa-staging");
  }
  if (config.APP_DEBUG && config.APP_DEBUG !== "false") {
    errors.push("APP_DEBUG must be false for QA staging");
  }
  if (config.DB_CONNECTION && config.DB_CONNECTION !== "mysql") {
    errors.push("DB_CONNECTION must be mysql for QA staging");
  }
  if (config.DB_DATABASE && config.DB_DATABASE !== "caneguard_staging") {
    errors.push("DB_DATABASE must be exactly caneguard_staging");
  }
  if (config.VITE_DATA_SOURCE && config.VITE_DATA_SOURCE !== "api") {
    errors.push("VITE_DATA_SOURCE must be api for QA staging");
  }

  if (config.QA_PUBLIC_URL && !isHttpsOrigin(config.QA_PUBLIC_URL)) {
    errors.push("QA_PUBLIC_URL must be a public HTTPS origin without a path");
  }

  if (config.QA_PUBLIC_URL && config.QA_WEB_URL && config.QA_PUBLIC_URL !== config.QA_WEB_URL) {
    errors.push("QA_WEB_URL must match QA_PUBLIC_URL");
  }

  if (
    config.QA_API_URL &&
    config.QA_API_HOST &&
    config.QA_API_PORT &&
    config.QA_API_URL !== `http://${config.QA_API_HOST}:${config.QA_API_PORT}`
  ) {
    errors.push("QA_API_URL must match the private QA API host and port");
  }

  const requiredRuntimeValues = [
    ["APP_MAINTENANCE_DRIVER", "file"],
    ["SESSION_DRIVER", "database"],
    ["FILESYSTEM_DISK", "local"],
    ["QUEUE_CONNECTION", "database"],
    ["CACHE_STORE", "database"],
  ];
  for (const [key, expected] of requiredRuntimeValues) {
    if (config[key] && config[key] !== expected) {
      errors.push(`${key} must be ${expected} for QA staging`);
    }
  }

  const urlPairs = [
    ["QA_PUBLIC_URL", "APP_URL"],
    ["QA_PUBLIC_URL", "FRONTEND_URL"],
    ["QA_PUBLIC_URL", "CORS_ALLOWED_ORIGINS"],
    ["QA_PUBLIC_URL", "VITE_API_BASE_URL"],
  ];
  for (const [left, right] of urlPairs) {
    if (config[left] && config[right] && config[left] !== config[right]) {
      errors.push(`${right} must match ${left}`);
    }
  }

  if (
    config.QA_WEB_URL &&
    config.CORS_ALLOWED_ORIGINS &&
    config.CORS_ALLOWED_ORIGINS !== config.QA_WEB_URL
  ) {
    errors.push("CORS_ALLOWED_ORIGINS must match QA_WEB_URL");
  }

  const publicHost = originHost(config.QA_PUBLIC_URL ?? "");
  if (
    publicHost &&
    config.SANCTUM_STATEFUL_DOMAINS &&
    !config.SANCTUM_STATEFUL_DOMAINS.split(",").some((domain) => domain.trim() === publicHost)
  ) {
    errors.push("SANCTUM_STATEFUL_DOMAINS must include the public Funnel host and port");
  }

  if (config.SESSION_DOMAIN) {
    errors.push("SESSION_DOMAIN must be empty so the public origin receives a host-only cookie");
  }
  if (config.SESSION_SECURE_COOKIE && config.SESSION_SECURE_COOKIE !== "true") {
    errors.push("SESSION_SECURE_COOKIE must be true for the public HTTPS origin");
  }
  if (config.SESSION_SAME_SITE && config.SESSION_SAME_SITE !== "lax") {
    errors.push("SESSION_SAME_SITE must be lax for the public QA workspace");
  }

  if (config.APP_KEY && !config.APP_KEY.startsWith("base64:")) {
    errors.push("APP_KEY must be a Laravel base64 key");
  }

  return errors;
}

export function buildRuntimeEnv(config, inherited = process.env) {
  const runtimeEnv = { ...inherited };

  for (const key of APPLICATION_ENV_KEYS) {
    if (Object.hasOwn(config, key)) {
      runtimeEnv[key] = config[key];
    } else {
      delete runtimeEnv[key];
    }
  }

  runtimeEnv.APP_ENV = "qa-staging";
  runtimeEnv.DB_DATABASE = "caneguard_staging";
  runtimeEnv.DB_CONNECTION = "mysql";
  runtimeEnv.APP_DEBUG = "false";
  runtimeEnv.VITE_DATA_SOURCE = "api";
  runtimeEnv.QA_API_PROXY_TARGET = config.QA_API_URL;
  runtimeEnv.QA_PUBLIC_URL = config.QA_PUBLIC_URL;

  return runtimeEnv;
}

function buildConfidenceEnvironment(config) {
  const environment = {};

  for (const key of ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL"]) {
    if (process.env[key]) environment[key] = process.env[key];
  }

  environment.CI = "true";
  environment.APP_KEY = config.APP_KEY;
  environment.VITE_API_BASE_URL = config.QA_PUBLIC_URL;
  environment.VITE_DATA_SOURCE = "api";
  environment.VITE_REPORT_REFRESH_MS = config.VITE_REPORT_REFRESH_MS ?? "600000";
  environment.VITE_MAPTILER_KEY = config.VITE_MAPTILER_KEY ?? "";

  return environment;
}

export function buildWebCheckEnvironment(config) {
  const environment = buildConfidenceEnvironment(config);
  environment.VITE_API_BASE_URL = TEST_API_BASE_URL;
  environment.VITE_MAPTILER_KEY = "";
  return environment;
}

function runConfidenceCommand(config, worktree, args, { webCheck = false } = {}) {
  const result = spawnSync(NPM_COMMAND, args, {
    cwd: worktree,
    env: webCheck
      ? buildWebCheckEnvironment(config)
      : buildConfidenceEnvironment(config),
    stdio: "inherit",
  });

  if (result.error) {
    throw new Error(`could not start ${NPM_COMMAND}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `${NPM_COMMAND} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}`,
    );
  }
}

function assertPrivateConfigFile(configPath) {
  const fileStat = lstatSync(configPath);
  if (fileStat.isSymbolicLink() || !fileStat.isFile()) {
    throw new Error(`QA staging configuration must be a regular file: ${configPath}`);
  }
  if ((fileStat.mode & 0o077) !== 0) {
    throw new Error(`QA staging configuration must be private (chmod 600): ${configPath}`);
  }
}

function readConfig(configPath) {
  if (!existsSync(configPath)) {
    throw new Error(
      `QA staging configuration is missing at ${configPath}. Run ` +
        "npm run staging -- init, then fill every credential before starting.",
    );
  }

  assertPrivateConfigFile(configPath);
  const config = parseEnvFile(readFileSync(configPath, "utf8"));
  const errors = validateStagingConfig(config);
  if (errors.length > 0) {
    throw new Error(
      `QA staging configuration is not ready (${configPath}):\n- ${errors.join("\n- ")}\n` +
        "The launcher never falls back to the development .env.",
    );
  }

  return config;
}

function configPathFromArgs(args) {
  const index = args.indexOf("--config");
  if (index === -1) return DEFAULT_CONFIG_PATH;
  if (!args[index + 1]) throw new Error("--config requires a file path");

  const configPath = resolve(SCRIPT_ROOT, args[index + 1]);
  const allowedRoot = resolve(SCRIPT_ROOT, ".qa-staging");
  const configRelative = relative(allowedRoot, configPath);
  if (
    configRelative === "" ||
    configRelative.startsWith("..") ||
    isAbsolute(configRelative)
  ) {
    throw new Error("--config must point inside .qa-staging");
  }

  return configPath;
}

function stagingPaths(config) {
  return {
    worktree: resolve(SCRIPT_ROOT, config.QA_WORKTREE_PATH),
    state: STATE_PATH,
    logs: LOG_PATH,
  };
}

function writePrivateFile(path, contents) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, contents, { mode: 0o600 });
}

function pathExists(path) {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

function runGit(args, cwd = SCRIPT_ROOT) {
  try {
    return shellGit(args, cwd);
  } catch (error) {
    const details = error?.stderr?.toString().trim();
    throw new Error(details || `git ${args.join(" ")} failed`);
  }
}

function gitRefExists(ref) {
  try {
    execFileSync("git", ["show-ref", "--verify", "--quiet", ref], {
      cwd: SCRIPT_ROOT,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function assertNoDevelopmentEnv(worktree) {
  const developmentEnvFiles = [
    join(worktree, ".env"),
    join(worktree, ".env.local"),
    join(worktree, "api", ".env"),
  ];
  const present = developmentEnvFiles.filter(existsSync);
  if (present.length > 0) {
    throw new Error(
      `Remove development environment files from the QA worktree before starting: ${present.join(", ")}. ` +
        "Use .qa-staging/staging.env as the only runtime source.",
    );
  }
}

export function assertStagingDependencies(worktree) {
  const requiredPaths = [
    join(worktree, "node_modules"),
    join(worktree, "api", "vendor", "autoload.php"),
  ];
  const missingPaths = requiredPaths.filter((path) => !existsSync(path));

  if (missingPaths.length > 0) {
    throw new Error(
      `QA staging dependencies are missing: ${missingPaths.join(", ")}. ` +
        "Run npm run staging -- checkout, then cd .qa-staging/worktree && npm ci && composer install --working-dir=api before rerunning npm run staging.",
    );
  }
}

function ensureCheckout(config, paths) {
  mkdirSync(dirname(paths.worktree), { recursive: true, mode: 0o700 });

  if (pathExists(paths.worktree)) {
    if (lstatSync(paths.worktree).isSymbolicLink()) {
      throw new Error(`QA worktree path must not be a symbolic link: ${paths.worktree}`);
    }
    if (!statSync(paths.worktree).isDirectory()) {
      throw new Error(`QA worktree path is not a directory: ${paths.worktree}`);
    }

    const currentBranch = runGit(["branch", "--show-current"], paths.worktree);
    if (currentBranch !== config.QA_BRANCH) {
      throw new Error(
        `QA worktree is on ${currentBranch || "no branch"}; expected ${config.QA_BRANCH}. ` +
          "Remove or repair that worktree explicitly before retrying.",
      );
    }

    return;
  }

  const localBranch = `refs/heads/${config.QA_BRANCH}`;
  const remoteBranch = `refs/remotes/origin/${config.QA_BRANCH}`;

  if (gitRefExists(localBranch)) {
    runGit(["worktree", "add", paths.worktree, config.QA_BRANCH], SCRIPT_ROOT);
    return;
  }

  if (gitRefExists(remoteBranch)) {
    runGit(
      ["worktree", "add", "-b", config.QA_BRANCH, paths.worktree, `origin/${config.QA_BRANCH}`],
      SCRIPT_ROOT,
    );
    return;
  }

  throw new Error(
    `QA branch ${config.QA_BRANCH} is not available locally or as origin/${config.QA_BRANCH}. ` +
      "Fetch the candidate branch, then run checkout again.",
  );
}

function loadState() {
  if (!existsSync(STATE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf8"));
  } catch {
    throw new Error(`QA service state is unreadable at ${STATE_PATH}`);
  }
}

function writeState(state) {
  writePrivateFile(
    STATE_PATH,
    `${JSON.stringify(state, null, 2)}\n`,
  );
}

export function buildFunnelStartArgs(config) {
  return [
    "funnel",
    "--bg",
    `--https=${config.QA_FUNNEL_PORT}`,
    `${config.QA_WEB_HOST}:${config.QA_WEB_PORT}`,
  ];
}

export function buildFunnelStopArgs(port) {
  return ["funnel", `--https=${port}`, "off"];
}

function runTailscale(args) {
  try {
    execFileSync("tailscale", args, {
      cwd: SCRIPT_ROOT,
      stdio: "inherit",
    });
  } catch (error) {
    const details = error?.stderr?.toString().trim();
    throw new Error(details || `tailscale ${args.join(" ")} failed`);
  }
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function processGroupIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

function processStartTime(pid) {
  if (!processIsAlive(pid)) return null;
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const commandEnd = stat.lastIndexOf(")");
    const fields = stat.slice(commandEnd + 2).trim().split(/\s+/);
    return fields[19] ?? null;
  } catch {
    return null;
  }
}

function processIdentity(pid) {
  const startTime = processStartTime(pid);
  return startTime ? { startTime } : null;
}

function processMatchesIdentity(service) {
  return Boolean(
    service?.identity?.startTime &&
      processStartTime(service.pid) === service.identity.startTime,
  );
}

function killGroup(service, signal) {
  const leaderAlive = processIsAlive(service?.pid);
  if (!leaderAlive) {
    if (processGroupIsAlive(service?.pid)) {
      throw new Error(
        `Refusing to signal QA process group for PID ${service.pid}: group leader exited before cleanup`,
      );
    }
    return;
  }
  if (!processMatchesIdentity(service)) {
    throw new Error(
      `Refusing to signal QA process group for PID ${service.pid}: process identity changed or cannot be verified`,
    );
  }
  try {
    process.kill(-service.pid, signal);
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

function normalizedFunnelTarget(value) {
  return value.trim().replace(/\/$/, "").replace(/^http:\/\//, "");
}

export function funnelStatusHasTarget(status, target) {
  const expected = normalizedFunnelTarget(target);
  const candidates = new Set([expected, `http://${expected}`]);
  const visit = (value) => {
    if (typeof value === "string") {
      return candidates.has(value.replace(/\/$/, ""));
    }
    if (Array.isArray(value)) return value.some(visit);
    if (value && typeof value === "object") return Object.values(value).some(visit);
    return false;
  };
  return visit(status);
}

function readFunnelStatus() {
  try {
    const output = execFileSync("tailscale", ["funnel", "status", "--json"], {
      cwd: SCRIPT_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return JSON.parse(output);
  } catch (error) {
    const details = error?.stderr?.toString().trim();
    throw new Error(details || `tailscale funnel status --json failed`);
  }
}

function stopFunnel() {
  const state = loadState();
  if (!state?.funnel) return false;

  const status = readFunnelStatus();
  if (!funnelStatusHasTarget(status, state.funnel.target)) {
    throw new Error(
      `Refusing to stop Funnel port ${state.funnel.port}: current Funnel target does not match ${state.funnel.target}`,
    );
  }

  runTailscale(buildFunnelStopArgs(state.funnel.port));
  const { funnel: _funnel, ...remainingState } = state;
  if (remainingState.api || remainingState.web) {
    writeState(remainingState);
  } else {
    rmSync(STATE_PATH, { force: true });
  }
  return true;
}

async function stopServices() {
  const state = loadState();
  if (!state) return false;

  const activeServices = [state.web, state.api].filter(
    (service) => processIsAlive(service?.pid) || processGroupIsAlive(service?.pid),
  );
  if (activeServices.some((service) => !processMatchesIdentity(service))) {
    throw new Error(
      "Refusing to stop QA services because a live process identity cannot be verified from state.json",
    );
  }

  for (const service of activeServices) {
    killGroup(service, "SIGTERM");
  }

  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (!activeServices.some((service) =>
      processIsAlive(service?.pid) || processGroupIsAlive(service?.pid),
    )) break;
    await sleep(100);
  }

  for (const service of activeServices) {
    killGroup(service, "SIGKILL");
  }

  rmSync(STATE_PATH, { force: true });
  return true;
}

function spawnService(name, command, args, cwd, env, logPath) {
  mkdirSync(dirname(logPath), { recursive: true, mode: 0o700 });
  const logFd = openSync(logPath, "a", 0o600);
  const child = spawn(command, args, {
    cwd,
    env,
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });
  closeSync(logFd);

  const identity = processIdentity(child.pid);
  if (!identity) {
    child.kill("SIGTERM");
    throw new Error(`Could not record a safe identity for QA ${name} service PID ${child.pid}`);
  }

  child.unref();
  child.once("error", (error) => {
    console.error(`QA ${name} service failed to start: ${error.message}`);
  });
  return { pid: child.pid, identity };
}

function resetStagingStorage(worktree) {
  const storageRoot = resolve(worktree, "api/storage/app/private");
  if (existsSync(storageRoot) && lstatSync(storageRoot).isSymbolicLink()) {
    throw new Error(`Refusing to reset symbolic-link storage path: ${storageRoot}`);
  }
  mkdirSync(storageRoot, { recursive: true, mode: 0o700 });

  for (const entry of readdirSync(storageRoot)) {
    if (entry === ".gitignore") continue;
    rmSync(join(storageRoot, entry), { recursive: true, force: true });
  }
}

async function startServices(config, paths) {
  const existing = loadState();
  if (existing && [existing.api?.pid, existing.web?.pid].some(processIsAlive)) {
    throw new Error(
      "QA staging services are already running. Run ready or stop before starting again.",
    );
  }
  if (existing?.funnel) stopFunnel();
  if (pathExists(STATE_PATH)) rmSync(STATE_PATH, { force: true });

  const env = buildRuntimeEnv(config);
  const api = spawnService(
    "API",
    "php",
    [
      "-d",
      "upload_max_filesize=12M",
      "-d",
      "post_max_size=16M",
      "-S",
      `${config.QA_API_HOST}:${config.QA_API_PORT}`,
      "-t",
      "api/public",
      "api/server.php",
    ],
    paths.worktree,
    env,
    join(paths.logs, "api.log"),
  );
  const web = spawnService(
    "Web",
    "npm",
    [
      "run",
      "dev",
      "--",
      "--host",
      config.QA_WEB_HOST,
      "--port",
      config.QA_WEB_PORT,
      "--strictPort",
    ],
    paths.worktree,
    env,
    join(paths.logs, "web.log"),
  );

  writeState({
    version: 2,
    branch: config.QA_BRANCH,
    worktree: paths.worktree,
    api,
    web,
    startedAt: new Date().toISOString(),
  });
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  let body = null;
  if (text !== "") {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  return { response, body };
}

function responseCookies(response) {
  const values =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : (response.headers.get("set-cookie") ?? "").split(/,(?=[^;]+=)/);
  return values
    .map((cookie) => cookie.match(/^\s*([^=]+)=([^;]*)/))
    .filter(Boolean)
    .map((match) => [match[1], match[2]]);
}

function mergeCookies(cookieJar, response) {
  for (const [name, value] of responseCookies(response)) {
    cookieJar.set(name, value);
  }
}

function cookieHeader(cookieJar) {
  return [...cookieJar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function checkApiHealth(apiBaseUrl) {
  const health = await requestJson(`${apiBaseUrl}/api/health`);
  if (
    health.response.status !== 200 ||
    health.body?.data?.status !== "ok" ||
    health.body?.data?.checks?.database !== "ready" ||
    health.body?.data?.checks?.storage !== "ready"
  ) {
    throw new Error(
      `API health is not ready: HTTP ${health.response.status} ${JSON.stringify(health.body)}`,
    );
  }
}

function buildMobileUploadForm(worktree) {
  const imagePath = join(worktree, "api", "database", "seeders", "assets", "synthetic-sugarcane-rust.png");
  if (!existsSync(imagePath)) {
    throw new Error(`staging upload smoke image is missing at ${imagePath}`);
  }

  const form = new FormData();
  const append = (name, value) => form.append(name, String(value));

  append("client_uuid", SEEDED_REPORT_CLIENT_UUID);
  append("image_source_type", "camera");
  append("source_width", 1);
  append("source_height", 1);
  append("predicted_label", "rust");
  append("confidence", 0.82);
  append("class_scores[healthy]", 0.08);
  append("class_scores[mosaic]", 0.1);
  append("class_scores[rust]", 0.82);
  append("symptom_keys[]", "rust");
  append("checklist_consistency", "consistent");
  append("reported_severity", "moderate");
  append("quality_warnings[]", "low-resolution");
  append("barangay", "Mabini");
  append("model_version", "caneguard-mobile-v1.0.0");
  append("preprocess_ms", 12.5);
  append("inference_ms", 95.75);
  append("total_ms", 122.25);
  append("captured_at", "2026-07-20T10:00:00.456+08:00");
  form.append(
    "image",
    new Blob([readFileSync(imagePath)], { type: "image/png" }),
    "staging-confidence.png",
  );

  return form;
}

async function checkSeededMobileReportUpload(config, apiBaseUrl, worktree) {
  const login = await requestJson(`${apiBaseUrl}/api/v1/mobile/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: SEEDED_USERS.fieldReporter.email,
      password: config[SEEDED_USERS.fieldReporter.passwordKey],
      device_name: "qa-staging-confidence",
    }),
  });
  if (login.response.status !== 200 || typeof login.body?.token !== "string") {
    throw new Error(
      `mobile upload smoke login failed: HTTP ${login.response.status} ${JSON.stringify(login.body)}`,
    );
  }

  const upload = await requestJson(`${apiBaseUrl}/api/v1/mobile/reports`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${login.body.token}`,
    },
    body: buildMobileUploadForm(worktree),
  });
  if (
    ![200, 201].includes(upload.response.status) ||
    upload.body?.data?.identity?.reference_code !== EXPECTED_SEEDED_REFERENCE_CODE ||
    upload.body?.data?.identity?.client_uuid !== SEEDED_REPORT_CLIENT_UUID
  ) {
    throw new Error(
      `mobile report upload smoke failed: HTTP ${upload.response.status} ${JSON.stringify(upload.body)}`,
    );
  }

  const logout = await requestJson(`${apiBaseUrl}/api/v1/mobile/auth/logout`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${login.body.token}` },
  });
  if (logout.response.status !== 204) {
    throw new Error(`mobile upload smoke logout returned HTTP ${logout.response.status}`);
  }
}

export function readinessUrl(config, boundary = "local") {
  return boundary === "public" ? config.QA_PUBLIC_URL : config.QA_API_URL;
}

async function webLogin(config, email, password, apiBaseUrl) {
  const cookieJar = new Map();
  const csrf = await requestJson(`${apiBaseUrl}/sanctum/csrf-cookie`, {
    headers: { Origin: config.QA_PUBLIC_URL },
  });
  mergeCookies(cookieJar, csrf.response);
  if (csrf.response.status !== 204) {
    throw new Error(`CSRF cookie endpoint returned HTTP ${csrf.response.status} ${JSON.stringify(csrf.body)}`);
  }

  const xsrf = cookieJar.get("XSRF-TOKEN");
  if (!xsrf) throw new Error("CSRF cookie endpoint did not return XSRF-TOKEN");

  const login = await requestJson(`${apiBaseUrl}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: config.QA_PUBLIC_URL,
      Cookie: cookieHeader(cookieJar),
      "X-XSRF-TOKEN": decodeURIComponent(xsrf),
    },
    body: JSON.stringify({ email, password }),
  });
  mergeCookies(cookieJar, login.response);
  if (login.response.status !== 204) {
    throw new Error(`seeded web login for ${email} returned HTTP ${login.response.status} ${JSON.stringify(login.body)}`);
  }

  return cookieJar;
}

async function webGet(config, cookieJar, path, apiBaseUrl) {
  return requestJson(`${apiBaseUrl}${path}`, {
    headers: {
      Origin: config.QA_PUBLIC_URL,
      Cookie: cookieHeader(cookieJar),
    },
  });
}

async function webLogout(config, cookieJar, apiBaseUrl) {
  const xsrf = cookieJar.get("XSRF-TOKEN");
  const logout = await requestJson(`${apiBaseUrl}/logout`, {
    method: "POST",
    headers: {
      Origin: config.QA_PUBLIC_URL,
      Cookie: cookieHeader(cookieJar),
      ...(xsrf ? { "X-XSRF-TOKEN": decodeURIComponent(xsrf) } : {}),
    },
  });
  if (logout.response.status !== 204) {
    throw new Error(`seeded web logout returned HTTP ${logout.response.status}`);
  }
}

async function checkSeededWebUser(config, user, apiBaseUrl) {
  const cookies = await webLogin(config, user.email, config[user.passwordKey], apiBaseUrl);
  const me = await webGet(config, cookies, "/api/v1/me", apiBaseUrl);
  const meUser = me.body?.user ?? me.body?.data;
  if (me.response.status !== 200 || meUser?.email !== user.email) {
    throw new Error(`seeded web authentication did not restore ${user.email}: HTTP ${me.response.status} ${JSON.stringify(me.body)}`);
  }
  if (meUser?.role !== user.role) {
    throw new Error(`seeded web authentication returned the wrong role for ${user.email}: ${JSON.stringify(me.body)}`);
  }
  await webLogout(config, cookies, apiBaseUrl);
}

async function checkSeededFieldReporter(config, apiBaseUrl) {
  const login = await requestJson(`${apiBaseUrl}/api/v1/mobile/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: SEEDED_USERS.fieldReporter.email,
      password: config[SEEDED_USERS.fieldReporter.passwordKey],
      device_name: "qa-readiness",
    }),
  });
  if (login.response.status !== 200 || typeof login.body?.token !== "string") {
    throw new Error(`seeded field reporter mobile authentication failed: HTTP ${login.response.status} ${JSON.stringify(login.body)} using ${SEEDED_USERS.fieldReporter.email}`);
  }

  const me = await requestJson(`${apiBaseUrl}/api/v1/mobile/auth/me`, {
    headers: { Authorization: `Bearer ${login.body.token}` },
  });
  if (
    me.response.status !== 200 ||
    me.body?.user?.email !== SEEDED_USERS.fieldReporter.email ||
    me.body?.user?.role !== SEEDED_USERS.fieldReporter.role
  ) {
    throw new Error("seeded field reporter mobile session was not restored");
  }

  const logout = await requestJson(`${apiBaseUrl}/api/v1/mobile/auth/logout`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${login.body.token}` },
  });
  if (logout.response.status !== 204) {
    throw new Error(`seeded field reporter logout returned HTTP ${logout.response.status}`);
  }
}

async function checkReadiness(config, apiBaseUrl, worktree = stagingPaths(config).worktree) {
  await checkApiHealth(apiBaseUrl);
  await checkSeededFieldReporter(config, apiBaseUrl);
  await checkSeededWebUser(config, SEEDED_USERS.reviewer, apiBaseUrl);
  await checkSeededWebUser(config, SEEDED_USERS.administrator, apiBaseUrl);

  const reviewerCookies = await webLogin(
    config,
    SEEDED_USERS.reviewer.email,
    config[SEEDED_USERS.reviewer.passwordKey],
    apiBaseUrl,
  );
  const dashboard = await webGet(
    config,
    reviewerCookies,
    "/api/v1/dashboard/summary",
    apiBaseUrl,
  );
  if (
    dashboard.response.status !== 200 ||
    dashboard.body?.data?.counts?.total_submitted !== EXPECTED_SEEDED_REPORT_COUNT ||
    dashboard.body?.data?.recent_reports?.length !== 5
  ) {
    throw new Error(
      `seeded dashboard data did not contain ${EXPECTED_SEEDED_REPORT_COUNT} reports and five recent reports`,
    );
  }

  const report = await webGet(
    config,
    reviewerCookies,
    `/api/v1/reports?search=${encodeURIComponent(EXPECTED_SEEDED_REFERENCE_CODE)}`,
    apiBaseUrl,
  );
  await webLogout(config, reviewerCookies, apiBaseUrl);
  if (
    report.response.status !== 200 ||
    report.body?.meta?.total !== 1 ||
    report.body?.data?.[0]?.reference_code !== EXPECTED_SEEDED_REFERENCE_CODE
  ) {
    throw new Error(`seeded report ${EXPECTED_SEEDED_REFERENCE_CODE} was not available`);
  }

  await checkSeededMobileReportUpload(config, apiBaseUrl, worktree);
}

async function waitForReadiness(
  config,
  apiBaseUrl,
  timeoutMs = 60000,
  worktree = stagingPaths(config).worktree,
) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      await checkReadiness(config, apiBaseUrl, worktree);
      return;
    } catch (error) {
      lastError = error;
      const isRateLimited = /429|RATE_LIMITED|Too many requests/i.test(error?.message ?? "");
      await sleep(isRateLimited ? 5000 : 1000);
    }
  }
  throw new Error(`QA staging readiness timed out: ${lastError?.message ?? "unknown error"}`);
}

async function waitForHealth(apiBaseUrl, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      await checkApiHealth(apiBaseUrl);
      return;
    } catch (error) {
      lastError = error;
      await sleep(1000);
    }
  }

  throw new Error(`QA staging API health timed out: ${lastError?.message ?? "unknown error"}`);
}

function runArtisan(config, worktree, args) {
  const env = buildRuntimeEnv(config);
  try {
    execFileSync("php", ["artisan", ...args], {
      cwd: join(worktree, "api"),
      env,
      stdio: "inherit",
    });
  } catch {
    throw new Error(`php artisan ${args.join(" ")} failed in the QA worktree`);
  }
}

function assertServicesRunning() {
  const state = loadState();
  if (!state || !processIsAlive(state.api?.pid) || !processIsAlive(state.web?.pid)) {
    throw new Error("QA staging API and Web services must be running before starting the public Funnel");
  }
  return state;
}

async function startFunnel(config, { runChecks = true } = {}) {
  const state = assertServicesRunning();
  if (state.funnel) {
    throw new Error("The QA public Funnel is already tracked as running; run public-stop first");
  }

  runTailscale(buildFunnelStartArgs(config));
  writeState({
    ...state,
    funnel: {
      url: config.QA_PUBLIC_URL,
      port: config.QA_FUNNEL_PORT,
      target: `${config.QA_WEB_HOST}:${config.QA_WEB_PORT}`,
      startedAt: new Date().toISOString(),
    },
  });

  if (!runChecks) return;

  try {
    await waitForReadiness(
      config,
      readinessUrl(config, "public"),
      60000,
      stagingPaths(config).worktree,
    );
  } catch (error) {
    stopFunnel();
    throw new Error(`public Funnel readiness failed: ${error.message}`);
  }
}

async function runConfidenceCheck(label, action) {
  try {
    await action();
    console.log(`[staging] PASS ${label}`);
    return { label, passed: true };
  } catch (error) {
    console.error(`[staging] FAIL ${label}: ${error.message}`);
    return { label, passed: false, error: error.message };
  }
}

async function runAutomatedConfidenceChecks(config, worktree) {
  const checks = [
    {
      label: "Web lint, typecheck, tests, build, and API tests",
      args: ["run", "check:all"],
      webCheck: true,
    },
    {
      label: "mobile report-upload contract artifact",
      args: ["run", "contract:artifact"],
    },
    {
      label: "Laravel mobile report-upload contract tests",
      args: ["run", "contract:consumer"],
    },
    {
      label: "staging contract helper tests",
      args: ["run", "contract:test"],
    },
  ];

  const results = [];
  for (const check of checks) {
    results.push(
      await runConfidenceCheck(check.label, () =>
        runConfidenceCommand(config, worktree, check.args, { webCheck: check.webCheck }),
      ),
    );
  }
  return results;
}

async function runSimpleStaging(config, paths) {
  ensureCheckout(config, paths);
  assertNoDevelopmentEnv(paths.worktree);
  assertStagingDependencies(paths.worktree);

  console.log(`[staging] Using manually selected branch ${config.QA_BRANCH}.`);
  console.log(`[staging] Resetting isolated database ${config.DB_DATABASE}.`);

  stopFunnel();
  await stopServices();
  resetStagingStorage(paths.worktree);
  runArtisan(config, paths.worktree, ["config:clear"]);
  runArtisan(config, paths.worktree, ["migrate:fresh", "--seed", "--force"]);
  try {
    runArtisan(config, paths.worktree, ["cache:clear"]);
  } catch {
    console.warn("[staging] cache:clear was unavailable; continuing with a fresh database.");
  }

  try {
    await startServices(config, paths);
    await waitForHealth(config.QA_API_URL);
    await startFunnel(config, { runChecks: false });
  } catch (error) {
    try {
      stopFunnel();
      await stopServices();
    } catch (cleanupError) {
      throw new Error(`${error.message}; cleanup failed: ${cleanupError.message}`);
    }
    throw error;
  }

  const results = [];
  results.push(
    await runConfidenceCheck("private API and seeded data", () =>
      waitForReadiness(config, config.QA_API_URL, 60000, paths.worktree),
    ),
  );
  results.push(
    await runConfidenceCheck(`Funnel and APK/API exchange at ${config.QA_PUBLIC_URL}`, () =>
      waitForReadiness(config, config.QA_PUBLIC_URL, 60000, paths.worktree),
    ),
  );
  results.push(...await runAutomatedConfidenceChecks(config, paths.worktree));

  const failures = results.filter((result) => !result.passed);
  if (failures.length > 0) {
    console.error(
      `[staging] CONFIDENCE FAIL: ${failures.length} check(s) failed. `
        + "Staging remains running for investigation; use npm run staging -- stop when finished.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(`[staging] CONFIDENCE PASS: ${config.QA_BRANCH} is ready at ${config.QA_PUBLIC_URL}.`);
  console.log("[staging] EAS evidence is optional. Point the Preview APK at the same public URL.");
  console.log("[staging] Run npm run staging -- stop when finished; caneguard_staging is retained.");
}

function initConfig(configPath) {
  if (pathExists(configPath)) {
    throw new Error(`Refusing to overwrite existing QA staging configuration: ${configPath}`);
  }
  if (!existsSync(CONFIG_EXAMPLE_PATH)) {
    throw new Error(`QA staging configuration example is missing: ${CONFIG_EXAMPLE_PATH}`);
  }

  const contents = readFileSync(CONFIG_EXAMPLE_PATH, "utf8").replace(
    /^APP_KEY=.*$/m,
    `APP_KEY=base64:${randomBytes(32).toString("base64")}`,
  );
  writePrivateFile(configPath, contents);
  console.log(`Created ignored QA staging configuration at ${configPath}.`);
  console.log("Create and push the staging branch, then edit QA_BRANCH, QA_PUBLIC_URL and matching public-origin values, DB_PASSWORD, and all three CANEGUARD_*_PASSWORD values before starting.");
}

function printHelp() {
  console.log(`Usage: npm run staging [-- <command>] [--config path]\n\nCommands:\n  run           Reset, seed, start, Funnel, and run the full confidence suite (default).\n  init          Create the ignored persistent staging.env from the example.\n  checkout      Add or verify the manually selected staging branch worktree.\n  cycle         Reset caneguard_staging, migrate, seed, and start without Funnel.\n  start         Start the selected worktree without resetting its database.\n  ready         Check private health, seeded users/reports, and mobile upload exchange.\n  public-start  Start Tailscale Funnel and run public confidence checks.\n  public-ready  Run health, seeded users/reports, and mobile upload through Funnel.\n  public-stop   Stop the tracked Tailscale Funnel and retain staging services.\n  stop          Stop Funnel and API/Web services without deleting the database.\n  status        Show selected branch, origin, and service state without secrets.\n\nWith no command, npm run staging runs the simple workflow.\nThe default runtime configuration is .qa-staging/staging.env.\nTailscale Funnel is the canonical public HTTPS boundary; the API remains private behind the Web proxy.\nDevelopment .env files are never used as a fallback.`);
}

async function main(argv) {
  const [command = "run", ...args] = argv;
  const configPath = configPathFromArgs(args);

  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }
  if (command === "init") {
    initConfig(configPath);
    return;
  }
  if (command === "public-stop") {
    const stopped = stopFunnel();
    console.log(
      stopped
        ? "Tailscale Funnel stopped; QA services and caneguard_staging were retained."
        : "No tracked Tailscale Funnel was running; QA services and caneguard_staging were retained.",
    );
    return;
  }
  if (command === "stop") {
    const funnelStopped = stopFunnel();
    const servicesStopped = await stopServices();
    console.log(
      funnelStopped || servicesStopped
        ? "Tailscale Funnel and QA services stopped; caneguard_staging was retained."
        : "QA Funnel and services were not running; caneguard_staging was retained.",
    );
    return;
  }

  const config = readConfig(configPath);
  const paths = stagingPaths(config);

  if (command === "checkout") {
    ensureCheckout(config, paths);
    assertNoDevelopmentEnv(paths.worktree);
    console.log(`QA checkout ready: ${config.QA_BRANCH}`);
    console.log(`Worktree: ${paths.worktree}`);
    return;
  }

  if (command === "status") {
    const state = loadState();
    console.log(`Candidate: ${config.QA_BRANCH}`);
    console.log(`Worktree: ${paths.worktree}`);
    console.log(`Database: ${config.DB_DATABASE}`);
    console.log(`Private API: ${config.QA_API_URL}`);
    console.log(`Public origin: ${config.QA_PUBLIC_URL}`);
    console.log(`Web proxy target: ${config.QA_API_URL}`);
    console.log(
      state
        ? `Services: API ${processIsAlive(state.api?.pid) ? "running" : "stopped"}, Web ${processIsAlive(state.web?.pid) ? "running" : "stopped"}, Funnel ${state.funnel ? "running" : "stopped"}`
        : "Services: stopped, Funnel stopped",
    );
    return;
  }

  if (command === "public-ready") {
    await waitForReadiness(config, readinessUrl(config, "public"), 60000, paths.worktree);
    console.log(`Public QA smoke checks passed through ${config.QA_PUBLIC_URL}.`);
    return;
  }

  if (command === "run") {
    await runSimpleStaging(config, paths);
    return;
  }

  if (!["cycle", "start", "ready", "public-start"].includes(command)) {
    throw new Error(`Unknown QA staging command: ${command}`);
  }

  ensureCheckout(config, paths);
  assertNoDevelopmentEnv(paths.worktree);
  if (command === "cycle" || command === "start") {
    assertStagingDependencies(paths.worktree);
  }
  if (command === "ready") {
    await checkReadiness(config, readinessUrl(config), paths.worktree);
    console.log("QA staging ready: private health, seeded users/reports, and mobile upload exchange passed.");
    return;
  }
  if (command === "public-start") {
    await startFunnel(config);
    console.log(`Public QA staging ready at ${config.QA_PUBLIC_URL} using Tailscale Funnel.`);
    console.log("Run npm run staging -- stop when finished; the staging database is retained.");
    return;
  }

  if (command === "cycle") {
    stopFunnel();
    await stopServices();
    resetStagingStorage(paths.worktree);
    runArtisan(config, paths.worktree, ["config:clear"]);
    runArtisan(config, paths.worktree, ["migrate:fresh", "--seed", "--force"]);
    try { runArtisan(config, paths.worktree, ["cache:clear"]); } catch { /* best-effort throttle reset */ }
  } else {
    runArtisan(config, paths.worktree, ["config:clear"]);
  }

  try {
    await startServices(config, paths);
    await waitForReadiness(config, readinessUrl(config));
  } catch (error) {
    await stopServices();
    throw error;
  }

  console.log(`QA staging ready at ${config.QA_WEB_URL} using ${config.QA_BRANCH}.`);
  console.log("Run npm run staging -- stop when finished; the staging database is retained for the next cycle.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`QA staging failed: ${error.message}`);
    process.exitCode = 1;
  });
}
