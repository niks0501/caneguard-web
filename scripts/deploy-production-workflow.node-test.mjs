import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";

const workflow = parse(
  readFileSync(
    join(import.meta.dirname, "..", ".github", "workflows", "deploy-production.yml"),
    "utf8",
  ),
);
const configureWorkflow = parse(
  readFileSync(
    join(import.meta.dirname, "..", ".github", "workflows", "configure-production.yml"),
    "utf8",
  ),
);

function buildStep() {
  const steps = Object.values(workflow.jobs ?? {}).flatMap((job) => job.steps ?? []);
  const matches = steps.filter((step) => step?.name === "Build production React assets");
  assert.equal(matches.length, 1, "expected exactly one production build step");
  return matches[0];
}

function runBuildStep(mapTilerKey) {
  const binDir = mkdtempSync(join(tmpdir(), "deploy-build-bin-"));
  const npmRecord = join(binDir, "npm-record");
  writeFileSync(
    join(binDir, "npm"),
    `#!/bin/sh\nprintf '%s\\n' "$*" > "${npmRecord}"\nprintf '%s' "$VITE_MAPTILER_KEY" >> "${npmRecord}"\n`,
  );
  chmodSync(join(binDir, "npm"), 0o755);

  const step = buildStep();
  const scriptPath = join(binDir, "build-step.sh");
  writeFileSync(scriptPath, step.run);

  const result = spawnSync("bash", ["-e", scriptPath], {
    env: {
      PATH: `${binDir}:${process.env.PATH}`,
      ...step.env,
      VITE_MAPTILER_KEY: mapTilerKey,
    },
    encoding: "utf8",
  });
  const record = existsSync(npmRecord) ? readFileSync(npmRecord, "utf8").split("\n") : null;
  return {
    status: result.status,
    stderr: result.stderr,
    npmArgs: record?.[0],
    npmMapTilerKey: record?.[1],
  };
}

test("production build step passes the MapTiler build secret to Vite", () => {
  assert.equal(buildStep().env.VITE_MAPTILER_KEY, "${{ secrets.CANEGUARD_MAPTILER_KEY }}");
});

test("production build fails and does not build when the MapTiler key is empty", () => {
  const result = runBuildStep("");

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /CANEGUARD_MAPTILER_KEY/);
  assert.equal(result.npmArgs, undefined);
});

test("production build fails and does not build when the MapTiler key is whitespace", () => {
  const result = runBuildStep("   ");

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /CANEGUARD_MAPTILER_KEY/);
  assert.equal(result.npmArgs, undefined);
});

test("production build runs the Vite build with the MapTiler key when it is set", () => {
  const result = runBuildStep("test-build-key");

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.npmArgs, "run build");
  assert.equal(result.npmMapTilerKey, "test-build-key");
});

test("production deployment and configuration workflows stay restricted to main and never trigger on PRs", () => {
  for (const [name, parsed, jobName, confirmation] of [
    ["deploy-production.yml", workflow, "deploy", "deploy-caneguard"],
    ["configure-production.yml", configureWorkflow, "configure", "configure-caneguard"],
  ]) {
    assert.equal(Object.hasOwn(parsed?.on ?? {}, "pull_request"), false, `${name} must not run on pull_request`);
    assert.equal(Object.hasOwn(parsed?.on ?? {}, "pull_request_target"), false, `${name} must not run on pull_request_target`);
    assert.equal(Object.hasOwn(parsed?.on ?? {}, "push"), false, `${name} must not auto-deploy on push`);
    assert.equal(Object.hasOwn(parsed?.on ?? {}, "workflow_dispatch"), true, `${name} must remain manual dispatch`);
    assert.equal(parsed?.concurrency?.group, "caneguard-production", `${name} concurrency group`);
    assert.equal(parsed?.concurrency?.["cancel-in-progress"], false, `${name} must not cancel in-flight deploys`);
    const job = parsed?.jobs?.[jobName];
    assert.equal(
      job?.if,
      `github.ref == 'refs/heads/main' && inputs.confirmation == '${confirmation}'`,
      `${name} must gate on refs/heads/main and explicit confirmation`,
    );
    assert.equal(job?.environment, "production", `${name} must target production environment`);
  }
});
