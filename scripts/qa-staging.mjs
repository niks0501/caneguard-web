#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
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
const REQUIRED_KEYS = [
  "QA_BRANCH",
  "QA_WORKTREE_PATH",
  "QA_API_HOST",
  "QA_API_PORT",
  "QA_API_URL",
  "QA_WEB_HOST",
  "QA_WEB_PORT",
  "QA_WEB_URL",
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
  "SESSION_DOMAIN",
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

function isSafeQaBranch(branch) {
  return (
    /^qa\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(branch) &&
    !branch.includes("..") &&
    !branch.endsWith("/") &&
    !branch.includes("//")
  );
}

export function validateStagingConfig(config) {
  const errors = [];

  for (const key of REQUIRED_KEYS) {
    if (isPlaceholder(config[key] ?? "")) {
      errors.push(`${key} must be set`);
    }
  }

  if (config.QA_BRANCH && !isSafeQaBranch(config.QA_BRANCH)) {
    errors.push("QA_BRANCH must name a safe qa/* branch");
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

  for (const key of ["QA_API_PORT", "QA_WEB_PORT", "DB_PORT"]) {
    if (config[key] && !isPort(config[key])) {
      errors.push(`${key} must be a TCP port between 1 and 65535`);
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
    ["QA_API_URL", "APP_URL"],
    ["QA_API_URL", "VITE_API_BASE_URL"],
    ["QA_WEB_URL", "FRONTEND_URL"],
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

  if (
    config.QA_WEB_URL &&
    config.SANCTUM_STATEFUL_DOMAINS &&
    !config.SANCTUM_STATEFUL_DOMAINS.split(",").some((domain) =>
      config.QA_WEB_URL.startsWith(`http://${domain.trim()}`) ||
      config.QA_WEB_URL.startsWith(`https://${domain.trim()}`),
    )
  ) {
    errors.push("SANCTUM_STATEFUL_DOMAINS must include the QA web host and port");
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

  return runtimeEnv;
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
        "npm run qa:staging -- init, then fill every credential before starting.",
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

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killGroup(pid, signal) {
  if (!processIsAlive(pid)) return;
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

async function stopServices() {
  const state = loadState();
  if (!state) return false;

  for (const service of [state.web, state.api]) {
    killGroup(service?.pid, "SIGTERM");
  }

  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (![state.web?.pid, state.api?.pid].some(processIsAlive)) break;
    await sleep(100);
  }

  for (const service of [state.web, state.api]) {
    killGroup(service?.pid, "SIGKILL");
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

  child.unref();
  child.once("error", (error) => {
    console.error(`QA ${name} service failed to start: ${error.message}`);
  });
  return child.pid;
}

function resetStagingStorage(worktree) {
  const storageRoot = resolve(worktree, "api/storage/app/private");
  if (existsSync(storageRoot) && lstatSync(storageRoot).isSymbolicLink()) {
    throw new Error(`Refusing to reset symbolic-link storage path: ${storageRoot}`);
  }
  mkdirSync(storageRoot, { recursive: true, mode: 0o700 });

  for (const entry of readdirSync(storageRoot)) {
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
  if (existing) rmSync(STATE_PATH, { force: true });

  const env = buildRuntimeEnv(config);
  const apiPid = spawnService(
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
  const webPid = spawnService(
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

  writePrivateFile(
    STATE_PATH,
    `${JSON.stringify(
      {
        version: 1,
        branch: config.QA_BRANCH,
        worktree: paths.worktree,
        api: { pid: apiPid },
        web: { pid: webPid },
        startedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
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

async function webLogin(config, email, password) {
  const cookieJar = new Map();
  const csrf = await requestJson(`${config.QA_API_URL}/sanctum/csrf-cookie`, {
    headers: { Origin: config.QA_WEB_URL },
  });
  mergeCookies(cookieJar, csrf.response);
  if (csrf.response.status !== 204) {
    throw new Error(`CSRF cookie endpoint returned HTTP ${csrf.response.status}`);
  }

  const xsrf = cookieJar.get("XSRF-TOKEN");
  if (!xsrf) throw new Error("CSRF cookie endpoint did not return XSRF-TOKEN");

  const login = await requestJson(`${config.QA_API_URL}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: config.QA_WEB_URL,
      Cookie: cookieHeader(cookieJar),
      "X-XSRF-TOKEN": decodeURIComponent(xsrf),
    },
    body: JSON.stringify({ email, password }),
  });
  mergeCookies(cookieJar, login.response);
  if (login.response.status !== 204) {
    throw new Error(`seeded web login for ${email} returned HTTP ${login.response.status}`);
  }

  return cookieJar;
}

async function webGet(config, cookieJar, path) {
  return requestJson(`${config.QA_API_URL}${path}`, {
    headers: {
      Origin: config.QA_WEB_URL,
      Cookie: cookieHeader(cookieJar),
    },
  });
}

async function webLogout(config, cookieJar) {
  const xsrf = cookieJar.get("XSRF-TOKEN");
  const logout = await requestJson(`${config.QA_API_URL}/logout`, {
    method: "POST",
    headers: {
      Origin: config.QA_WEB_URL,
      Cookie: cookieHeader(cookieJar),
      ...(xsrf ? { "X-XSRF-TOKEN": decodeURIComponent(xsrf) } : {}),
    },
  });
  if (logout.response.status !== 204) {
    throw new Error(`seeded web logout returned HTTP ${logout.response.status}`);
  }
}

async function checkSeededWebUser(config, user) {
  const cookies = await webLogin(config, user.email, config[user.passwordKey]);
  const me = await webGet(config, cookies, "/api/v1/me");
  if (me.response.status !== 200 || me.body?.user?.email !== user.email) {
    throw new Error(`seeded web authentication did not restore ${user.email}`);
  }
  if (me.body?.user?.role !== user.role) {
    throw new Error(`seeded web authentication returned the wrong role for ${user.email}`);
  }
  await webLogout(config, cookies);
}

async function checkSeededFieldReporter(config) {
  const login = await requestJson(`${config.QA_API_URL}/api/v1/mobile/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: SEEDED_USERS.fieldReporter.email,
      password: config[SEEDED_USERS.fieldReporter.passwordKey],
      device_name: "qa-readiness",
    }),
  });
  if (login.response.status !== 200 || typeof login.body?.token !== "string") {
    throw new Error("seeded field reporter mobile authentication failed");
  }

  const me = await requestJson(`${config.QA_API_URL}/api/v1/mobile/auth/me`, {
    headers: { Authorization: `Bearer ${login.body.token}` },
  });
  if (
    me.response.status !== 200 ||
    me.body?.user?.email !== SEEDED_USERS.fieldReporter.email ||
    me.body?.user?.role !== SEEDED_USERS.fieldReporter.role
  ) {
    throw new Error("seeded field reporter mobile session was not restored");
  }

  const logout = await requestJson(`${config.QA_API_URL}/api/v1/mobile/auth/logout`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${login.body.token}` },
  });
  if (logout.response.status !== 204) {
    throw new Error(`seeded field reporter logout returned HTTP ${logout.response.status}`);
  }
}

async function checkReadiness(config) {
  const health = await requestJson(`${config.QA_API_URL}/api/health`);
  if (
    health.response.status !== 200 ||
    health.body?.data?.status !== "ok" ||
    health.body?.data?.checks?.database !== "ready" ||
    health.body?.data?.checks?.storage !== "ready"
  ) {
    throw new Error("API health is not ready with database and storage checks");
  }

  await checkSeededFieldReporter(config);
  await checkSeededWebUser(config, SEEDED_USERS.reviewer);
  await checkSeededWebUser(config, SEEDED_USERS.administrator);

  const reviewerCookies = await webLogin(
    config,
    SEEDED_USERS.reviewer.email,
    config[SEEDED_USERS.reviewer.passwordKey],
  );
  const dashboard = await webGet(config, reviewerCookies, "/api/v1/dashboard/summary");
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
  );
  await webLogout(config, reviewerCookies);
  if (
    report.response.status !== 200 ||
    report.body?.meta?.total !== 1 ||
    report.body?.data?.[0]?.reference_code !== EXPECTED_SEEDED_REFERENCE_CODE
  ) {
    throw new Error(`seeded report ${EXPECTED_SEEDED_REFERENCE_CODE} was not available`);
  }
}

async function waitForReadiness(config, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      await checkReadiness(config);
      return;
    } catch (error) {
      lastError = error;
      await sleep(500);
    }
  }
  throw new Error(`QA staging readiness timed out: ${lastError?.message ?? "unknown error"}`);
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
  console.log("Edit QA_BRANCH, DB_PASSWORD, and all three CANEGUARD_*_PASSWORD values before starting.");
}

function printHelp() {
  console.log(`Usage: npm run qa:staging -- <command> [--config path]\n\nCommands:\n  init      Create the ignored persistent staging.env from the example.\n  checkout  Add or verify the configured qa/* branch worktree.\n  cycle     Stop services, reset caneguard_staging, migrate, seed, and start.\n  start     Start the selected worktree without resetting its database.\n  ready     Check API health, all seeded authentication, and seeded reports.\n  stop      Stop QA API and Web services without deleting the database.\n  status    Show selected worktree and service state without secrets.\n\nThe default runtime configuration is .qa-staging/staging.env.\nDevelopment .env files are never used as a fallback.`);
}

async function main(argv) {
  const [command = "help", ...args] = argv;
  const configPath = configPathFromArgs(args);

  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }
  if (command === "init") {
    initConfig(configPath);
    return;
  }
  if (command === "stop") {
    const stopped = await stopServices();
    console.log(
      stopped
        ? "QA services stopped; caneguard_staging was retained."
        : "QA services were not running; caneguard_staging was retained.",
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
    console.log(`API: ${config.QA_API_URL}`);
    console.log(`Web: ${config.QA_WEB_URL}`);
    console.log(
      state
        ? `Services: API ${processIsAlive(state.api?.pid) ? "running" : "stopped"}, Web ${processIsAlive(state.web?.pid) ? "running" : "stopped"}`
        : "Services: stopped",
    );
    return;
  }

  if (!["cycle", "start", "ready"].includes(command)) {
    throw new Error(`Unknown QA staging command: ${command}`);
  }

  ensureCheckout(config, paths);
  assertNoDevelopmentEnv(paths.worktree);
  if (command === "ready") {
    await checkReadiness(config);
    console.log("QA staging ready: API health, seeded authentication, and seeded reports passed.");
    return;
  }

  if (command === "cycle") {
    await stopServices();
    resetStagingStorage(paths.worktree);
    runArtisan(config, paths.worktree, ["config:clear"]);
    runArtisan(config, paths.worktree, ["migrate:fresh", "--seed", "--force"]);
  } else {
    runArtisan(config, paths.worktree, ["config:clear"]);
  }

  try {
    await startServices(config, paths);
    await waitForReadiness(config);
  } catch (error) {
    await stopServices();
    throw error;
  }

  console.log(`QA staging ready at ${config.QA_WEB_URL} using ${config.QA_BRANCH}.`);
  console.log("Run npm run qa:staging -- stop when finished; the staging database is retained for the next cycle.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`QA staging failed: ${error.message}`);
    process.exitCode = 1;
  });
}
