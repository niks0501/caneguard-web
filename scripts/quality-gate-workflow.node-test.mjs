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
const packageJson = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8"),
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
  "Prepare MySQL integration database",
  "Run MySQL integration suite",
  "Run consumer contract suite",
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

test("pull request gate runs isolated MySQL and consumer-only contract checks", () => {
  const job = qualityGateJob();
  const mysqlService = job.services?.mysql;
  assert.equal(mysqlService?.image, "mysql:8.4");
  assert.equal(mysqlService?.env?.MYSQL_DATABASE, "caneguard_test");
  assert.equal(mysqlService?.env?.MYSQL_ALLOW_EMPTY_PASSWORD, "yes");
  assert.equal(mysqlService?.env?.MYSQL_ROOT_HOST, "%");
  assert.ok(mysqlService?.ports?.includes("3306:3306"));

  const steps = qualityGateSteps();
  const prepare = stepNamed("Prepare MySQL integration database");
  const mysql = stepNamed("Run MySQL integration suite");
  const contract = stepNamed("Run consumer contract suite");
  assert.match(prepare.run, /php api\/artisan migrate --force/);
  assert.doesNotMatch(prepare.run, /db:seed/);
  assert.equal(mysql.run, "npm run api:test:mysql");
  assert.equal(contract.run, "npm run verify:contract:consumer");
  assert.ok(steps.indexOf(prepare) < steps.indexOf(mysql));
  assert.ok(steps.indexOf(mysql) < steps.indexOf(contract));

  const consumerGate = packageJson.scripts?.["verify:contract:consumer"];
  assert.ok(typeof consumerGate === "string", "consumer contract gate script must exist");
  for (const command of [
    "contract:artifact",
    "contract:v2:artifact",
    "contract:status-v3-artifact",
    "contract:assignment-artifact",
    "contract:completion-artifact",
    "contract:notification-artifact",
    "contract:lifecycle-artifact",
    "contract:config",
    "contract:test",
    "contract:consumer",
    "contract:assignment-consumer",
    "contract:completion-consumer",
    "contract:notification-consumer",
    "contract:lifecycle-consumer",
  ]) {
    assert.ok(consumerGate.includes(`npm run ${command}`), `${command} must be part of the consumer gate`);
  }
  assert.doesNotMatch(consumerGate, /producer/);
});
