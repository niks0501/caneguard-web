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

const securityStepNames = [
  "Verify dependency audit gate contract",
  "Verify MapLibre dependency security contract",
  "Audit Web dependencies (high and critical advisories fail)",
  "Audit Laravel dependencies (advisories and abandoned packages fail)",
];

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

test("each dependency installation exists once and precedes its audit", () => {
  const steps = qualityGateSteps();
  const pairs = [
    ["Install Web dependencies", "Audit Web dependencies (high and critical advisories fail)"],
    ["Install Laravel dependencies", "Audit Laravel dependencies (advisories and abandoned packages fail)"],
  ];

  for (const [installName, auditName] of pairs) {
    const install = stepNamed(installName);
    const audit = stepNamed(auditName);
    assert.ok(steps.indexOf(install) < steps.indexOf(audit), `${installName} must precede ${auditName}`);
  }
});
