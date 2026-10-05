import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

const workflow = parse(
  readFileSync(
    join(import.meta.dirname, "..", ".github", "workflows", "web-api-pr-quality-gate.yml"),
    "utf8",
  ),
);

function qualityGateJob() {
  const job = workflow?.jobs?.["quality-gate"];
  assert.ok(job && typeof job === "object" && !Array.isArray(job), "quality-gate job must exist");
  return job;
}

function qualityGateSteps() {
  const steps = qualityGateJob().steps;
  assert.ok(Array.isArray(steps), "quality-gate job must define steps");
  return steps;
}

function stepNamed(name) {
  const matches = qualityGateSteps().filter((step) => step?.name === name);
  assert.equal(matches.length, 1, `expected exactly one step named ${name}`);
  return matches[0];
}

test("quality gate uses explicit safe production build inputs", () => {
  const env = stepNamed("Run Web checks (lint, typecheck, tests, build)").env;
  assert.deepEqual(env, {
    VITE_API_BASE_URL: "https://caneguard.example.test",
    VITE_DATA_SOURCE: "api",
    VITE_REALTIME_ENABLED: "false",
  });
});

const expectedCommands = {
  "Install Web dependencies": "npm ci --no-audit --no-fund",
  "Install Laravel dependencies":
    "composer install --working-dir=api --no-interaction --no-progress --prefer-dist",
  "Verify dependency audit gate contract": "npm run test:quality-gate-workflow",
  "Verify MapLibre dependency security contract": "npm run security:dependency-check",
  "Audit Web dependencies (high and critical advisories fail)": "npm audit --audit-level=high",
  "Audit Laravel dependencies (advisories and abandoned packages fail)":
    "composer audit --working-dir=api --locked --no-interaction --no-dev --abandoned=fail",
};

const securityStepNames = [
  "Verify dependency audit gate contract",
  "Verify MapLibre dependency security contract",
  "Audit Web dependencies (high and critical advisories fail)",
  "Audit Laravel dependencies (advisories and abandoned packages fail)",
];

test("the PR quality gate retains its dependency security commands", () => {
  for (const [name, command] of Object.entries(expectedCommands)) {
    assert.equal(stepNamed(name).run, command);
  }
});

test("quality gate job cannot be skipped or ignored", () => {
  const job = qualityGateJob();
  assert.equal(Object.hasOwn(job, "if"), false, "quality-gate job must not define if");
  assert.equal(
    Object.hasOwn(job, "continue-on-error"),
    false,
    "quality-gate job must not define continue-on-error",
  );
});

test("security steps cannot be skipped or ignored", () => {
  for (const name of securityStepNames) {
    const step = stepNamed(name);
    assert.equal(Object.hasOwn(step, "if"), false, `${name} must not define if`);
    assert.equal(
      Object.hasOwn(step, "continue-on-error"),
      false,
      `${name} must not define continue-on-error`,
    );
  }
});

test("audits run after their corresponding dependency installations", () => {
  const steps = qualityGateSteps();
  const stepIndex = (name) => steps.findIndex((step) => step?.name === name);

  assert.ok(
    stepIndex("Install Web dependencies") <
      stepIndex("Audit Web dependencies (high and critical advisories fail)"),
  );
  assert.ok(
    stepIndex("Install Laravel dependencies") <
      stepIndex("Audit Laravel dependencies (advisories and abandoned packages fail)"),
  );
});
