import test from "node:test";
import assert from "node:assert/strict";

import {
  EXPECTED_SEEDED_REFERENCE_CODE,
  EXPECTED_SEEDED_REPORT_COUNT,
  buildRuntimeEnv,
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
    QA_WEB_URL: "http://127.0.0.1:15173",
    APP_NAME: "CaneGuard",
    APP_ENV: "qa-staging",
    APP_KEY: "base64:qa-only-key",
    APP_DEBUG: "false",
    APP_MAINTENANCE_DRIVER: "file",
    APP_MAINTENANCE_STORE: "database",
    APP_URL: "http://127.0.0.1:18000",
    FRONTEND_URL: "http://127.0.0.1:15173",
    CORS_ALLOWED_ORIGINS: "http://127.0.0.1:15173",
    SANCTUM_STATEFUL_DOMAINS: "127.0.0.1:15173",
    SESSION_DRIVER: "database",
    SESSION_DOMAIN: "127.0.0.1",
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
    VITE_API_BASE_URL: "http://127.0.0.1:18000",
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

test("rejects development database, non-qa branch, and missing credentials", () => {
  const config = validConfig();
  config.DB_DATABASE = "caneguard";
  config.QA_BRANCH = "main";
  config.CANEGUARD_ADMIN_PASSWORD = "";

  const errors = validateStagingConfig(config);
  assert.ok(errors.includes("QA_BRANCH must name a safe qa/* branch"));
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

test("readiness uses the existing deterministic seeded report contract", () => {
  assert.equal(EXPECTED_SEEDED_REPORT_COUNT, 12);
  assert.equal(EXPECTED_SEEDED_REFERENCE_CODE, "CG-2026-0001");
});
