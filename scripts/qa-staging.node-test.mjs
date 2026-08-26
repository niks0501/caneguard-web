import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  EXPECTED_SEEDED_REFERENCE_CODE,
  EXPECTED_SEEDED_REPORT_COUNT,
  assertStagingDependencies,
  buildFunnelStartArgs,
  buildFunnelStopArgs,
  buildRuntimeEnv,
  buildWebCheckEnvironment,
  funnelStatusHasTarget,
  readinessUrl,
  parseEnvFile,
  validateStagingConfig,
} from "./qa-staging.mjs";

function validConfig() {
  return {
    QA_BRANCH: "qa/candidate",
    QA_WORKTREE_PATH: ".qa-staging/worktree",
    QA_API_HOST: "127.0.0.1",
    QA_API_PORT: "18000",
    QA_API_URL: "http://127.0.0.1:18000",
    QA_WEB_HOST: "127.0.0.1",
    QA_WEB_PORT: "15173",
    QA_WEB_URL: "https://qa-device.example.ts.net",
    QA_PUBLIC_URL: "https://qa-device.example.ts.net",
    QA_FUNNEL_PORT: "443",
    APP_NAME: "CaneGuard",
    APP_ENV: "qa-staging",
    APP_KEY: "base64:qa-only-key",
    APP_DEBUG: "false",
    APP_MAINTENANCE_DRIVER: "file",
    APP_MAINTENANCE_STORE: "database",
    APP_URL: "https://qa-device.example.ts.net",
    FRONTEND_URL: "https://qa-device.example.ts.net",
    CORS_ALLOWED_ORIGINS: "https://qa-device.example.ts.net",
    SANCTUM_STATEFUL_DOMAINS: "qa-device.example.ts.net",
    SESSION_DRIVER: "database",
    SESSION_DOMAIN: "",
    SESSION_SECURE_COOKIE: "true",
    SESSION_SAME_SITE: "lax",
    FILESYSTEM_DISK: "local",
    QUEUE_CONNECTION: "database",
    CACHE_STORE: "database",
    DB_CONNECTION: "mysql",
    DB_HOST: "127.0.0.1",
    DB_PORT: "3306",
    DB_DATABASE: "caneguard_staging",
    DB_USERNAME: "caneguard_app",
    DB_PASSWORD: "qa-db-password",
    CANEGUARD_FIELD_PASSWORD: "field-password",
    CANEGUARD_REVIEWER_PASSWORD: "reviewer-password",
    CANEGUARD_ADMIN_PASSWORD: "admin-password",
    VITE_API_BASE_URL: "https://qa-device.example.ts.net",
    VITE_DATA_SOURCE: "api",
  };
}

test("parses comments, quoted values, and empty values without shell evaluation", () => {
  assert.deepEqual(parseEnvFile(`A=one # comment\nB="two words"\nC='three#words'\nD=`), {
    A: "one",
    B: "two words",
    C: "three#words",
    D: "",
  });
});

test("rejects malformed environment lines", () => {
  assert.throws(
    () => parseEnvFile("GOOD=value\nnot an env assignment"),
    /line 2 must use KEY=VALUE syntax/,
  );
});

test("accepts the isolated staging database and candidate configuration", () => {
  assert.deepEqual(validateStagingConfig(validConfig()), []);
});

test("uses one public origin and a private API proxy target", () => {
  const config = validConfig();
  assert.equal(config.QA_PUBLIC_URL, config.QA_WEB_URL);
  assert.equal(config.VITE_API_BASE_URL, config.QA_PUBLIC_URL);

  const runtime = buildRuntimeEnv(config);
  assert.equal(runtime.QA_API_PROXY_TARGET, config.QA_API_URL);
  assert.equal(readinessUrl(config), config.QA_API_URL);
  assert.equal(readinessUrl(config, "public"), config.QA_PUBLIC_URL);
  assert.deepEqual(buildFunnelStartArgs(config), [
    "funnel",
    "--bg",
    "--https=443",
    "127.0.0.1:15173",
  ]);
  assert.deepEqual(buildFunnelStopArgs("443"), ["funnel", "--https=443", "off"]);
  assert.equal(
    funnelStatusHasTarget(
      { Web: { "https://qa-device.example.ts.net:443": { Proxy: "http://127.0.0.1:15173" } } },
      "127.0.0.1:15173",
    ),
    true,
  );
  assert.equal(funnelStatusHasTarget({ Web: { Proxy: "http://127.0.0.1:19000" } }, "127.0.0.1:15173"), false);
});

test("rejects public origin mismatches and non-private service bindings", () => {
  const config = validConfig();
  config.QA_PUBLIC_URL = "https://other.example.ts.net";
  config.QA_WEB_HOST = "0.0.0.0";

  const errors = validateStagingConfig(config);
  assert.ok(errors.includes("QA_WEB_URL must match QA_PUBLIC_URL"));
  assert.ok(errors.includes("QA_WEB_HOST must be 127.0.0.1 to keep local staging private"));
});

test("accepts manually selected feature branches but rejects the development branch", () => {
  const config = validConfig();
  config.QA_BRANCH = "feature1";
  assert.deepEqual(validateStagingConfig(config), []);

  config.QA_BRANCH = "main";
  const errors = validateStagingConfig(config);
  assert.ok(errors.some((error) => error.startsWith("QA_BRANCH must name a safe non-main staging branch")));
});

test("rejects a development database and missing credentials", () => {
  const config = validConfig();
  config.DB_DATABASE = "caneguard";
  config.CANEGUARD_ADMIN_PASSWORD = "";

  const errors = validateStagingConfig(config);
  assert.ok(errors.includes("DB_DATABASE must be exactly caneguard_staging"));
  assert.ok(errors.includes("CANEGUARD_ADMIN_PASSWORD must be set"));
});

test("runtime environment overrides inherited development values", () => {
  const config = validConfig();
  const runtime = buildRuntimeEnv(config, {
    PATH: "/usr/bin",
    DB_DATABASE: "caneguard",
    DB_CONNECTION: "sqlite",
    VITE_DATA_SOURCE: "mock",
  });

  assert.equal(runtime.DB_DATABASE, "caneguard_staging");
  assert.equal(runtime.DB_CONNECTION, "mysql");
  assert.equal(runtime.VITE_DATA_SOURCE, "api");
  assert.equal(runtime.APP_ENV, "qa-staging");
});

test("web confidence checks use local test defaults instead of the public staging origin", () => {
  const config = validConfig();
  config.VITE_MAPTILER_KEY = "staging-map-key";
  const environment = buildWebCheckEnvironment(config);

  assert.equal(environment.APP_KEY, config.APP_KEY);
  assert.equal(environment.VITE_API_BASE_URL, "http://localhost:8000");
  assert.equal(environment.VITE_DATA_SOURCE, "api");
  assert.equal(environment.VITE_MAPTILER_KEY, "");
  assert.equal(buildRuntimeEnv(config).VITE_API_BASE_URL, config.VITE_API_BASE_URL);
  assert.equal(buildRuntimeEnv(config).VITE_MAPTILER_KEY, "staging-map-key");
});

test("reports actionable dependency setup instructions before PHP starts", () => {
  const worktree = mkdtempSync(join(tmpdir(), "caneguard-qa-staging-"));
  mkdirSync(join(worktree, "node_modules"));
  mkdirSync(join(worktree, "api"));

  try {
    assert.throws(
      () => assertStagingDependencies(worktree),
      (error) =>
        error instanceof Error &&
        error.message.includes("api/vendor/autoload.php") &&
        error.message.includes("Run npm run staging -- checkout") &&
        error.message.includes("npm ci") &&
        error.message.includes("composer install"),
    );
  } finally {
    rmSync(worktree, { recursive: true, force: true });
  }
});

test("readiness uses the existing deterministic seeded report contract", () => {
  assert.equal(EXPECTED_SEEDED_REPORT_COUNT, 12);
  assert.equal(EXPECTED_SEEDED_REFERENCE_CODE, "CG-2026-0001");
});
