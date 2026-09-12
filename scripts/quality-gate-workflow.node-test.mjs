import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const workflow = readFileSync(
  join(import.meta.dirname, "..", ".github", "workflows", "web-api-pr-quality-gate.yml"),
  "utf8",
);

function occurrences(value) {
  return workflow.split(value).length - 1;
}

test("the PR quality gate retains both dependency audit commands", () => {
  const npmAudit = "npm audit --audit-level=high";
  const composerAudit =
    "composer audit --working-dir=api --locked --no-interaction --no-dev --abandoned=fail";

  assert.equal(occurrences(npmAudit), 1);
  assert.equal(occurrences(composerAudit), 1);
  assert.match(workflow, /- name: Audit Web dependencies[\s\S]*?run: npm audit --audit-level=high/);
  assert.match(
    workflow,
    /- name: Audit Laravel dependencies[\s\S]*?run: composer audit --working-dir=api --locked --no-interaction --no-dev --abandoned=fail/,
  );
  assert.match(
    workflow,
    /- name: Verify MapLibre dependency security contract[\s\S]*?run: npm run security:dependency-check/,
  );
});

test("audits run after their corresponding dependency installations", () => {
  assert(
    workflow.indexOf("run: npm ci --no-audit --no-fund") <
      workflow.indexOf("npm audit --audit-level=high"),
  );
  assert(
    workflow.indexOf("run: composer install --working-dir=api") <
      workflow.indexOf(
        "composer audit --working-dir=api --locked --no-interaction --no-dev --abandoned=fail",
      ),
  );
});
