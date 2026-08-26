import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  QA_ID,
  assertSelectedMainCommit,
  createQaBranches,
  nextQaId,
  parseMobileEasEvidence,
  readMobileTargetConfig,
} from "./qa-open.mjs";

function git(repo, args) {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
}

function makeRepo(name, contents = name) {
  const repo = mkdtempSync(join(tmpdir(), `caneguard-${name}-`));
  git(repo, ["init", "-b", "main"]);
  git(repo, ["config", "user.email", "qa-tests@caneguard.test"]);
  git(repo, ["config", "user.name", "CaneGuard QA tests"]);
  writeFileSync(join(repo, "README.md"), `${contents}\n`);
  git(repo, ["add", "README.md"]);
  git(repo, ["commit", "-m", "initial"]);
  return repo;
}

function cleanup(...paths) {
  for (const path of paths) rmSync(path, { recursive: true, force: true });
}

test("requires the agreed QA branch shape", () => {
  assert.equal(QA_ID.test("qa/2026-08-26-01"), true);
  assert.equal(QA_ID.test("qa/2026-08-26-1"), false);
  assert.equal(QA_ID.test("staging/2026-08-26-01"), false);
});

test("selects only exact commits already reachable from main", () => {
  const repo = makeRepo("main-ref");
  try {
    const commit = git(repo, ["rev-parse", "main"]);
    assert.equal(assertSelectedMainCommit(repo, commit, "Web/API commit"), commit);
    assert.throws(
      () => assertSelectedMainCommit(repo, "1111111111111111111111111111111111111111", "Web/API commit"),
      /does not exist as a commit/,
    );
  } finally {
    cleanup(repo);
  }
});

test("creates matching branches at both selected commits when one repo is unchanged", () => {
  const webRepo = makeRepo("web-branch", "web");
  const mobileRepo = makeRepo("mobile-branch", "mobile");
  try {
    const webCommit = git(webRepo, ["rev-parse", "main"]);
    const mobileCommit = git(mobileRepo, ["rev-parse", "main"]);
    const branch = "qa/2026-08-26-01";
    const branches = createQaBranches({
      webRepo,
      mobileRepo,
      branch,
      webCommit,
      mobileCommit,
    });
    assert.deepEqual(branches, { web: webCommit, mobile: mobileCommit });
    assert.equal(git(webRepo, ["rev-parse", branch]), webCommit);
    assert.equal(git(mobileRepo, ["rev-parse", branch]), mobileCommit);
  } finally {
    cleanup(webRepo, mobileRepo);
  }
});

test("chooses the first unused cycle number across both repositories", () => {
  const webRepo = makeRepo("web-cycle", "web");
  const mobileRepo = makeRepo("mobile-cycle", "mobile");
  try {
    const webCommit = git(webRepo, ["rev-parse", "main"]);
    const mobileCommit = git(mobileRepo, ["rev-parse", "main"]);
    git(webRepo, ["branch", "qa/2026-08-26-01", webCommit]);
    git(mobileRepo, ["branch", "qa/2026-08-26-02", mobileCommit]);
    assert.equal(nextQaId("2026-08-26", [webRepo, mobileRepo]), "qa/2026-08-26-03");
  } finally {
    cleanup(webRepo, mobileRepo);
  }
});

test("does not reuse a cycle number reserved by an abandoned release record", () => {
  const webRepo = makeRepo("web-reserved-cycle", "web");
  const mobileRepo = makeRepo("mobile-reserved-cycle", "mobile");
  try {
    const recordRoot = join(webRepo, ".qa-staging", "qa-cycles");
    mkdirSync(recordRoot, { recursive: true });
    writeFileSync(join(recordRoot, "2026-08-26-01.json"), '{"status":"ABANDONED"}\n');
    assert.equal(nextQaId("2026-08-26", [webRepo, mobileRepo]), "qa/2026-08-26-02");
  } finally {
    cleanup(webRepo, mobileRepo);
  }
});

test("accepts only a Mobile target file that is HTTPS and in QA mode", () => {
  const directory = mkdtempSync(join(tmpdir(), "caneguard-mobile-target-"));
  const path = join(directory, ".env.qa.local");
  writeFileSync(path, "EXPO_PUBLIC_API_BASE_URL=https://qa.example.ts.net\nEXPO_PUBLIC_QA_MODE=true\n");
  chmodSync(path, 0o600);
  try {
    assert.deepEqual(readMobileTargetConfig(path, "https://qa.example.ts.net"), {
      apiBaseUrl: "https://qa.example.ts.net",
      qaMode: true,
    });
    writeFileSync(path, "EXPO_PUBLIC_API_BASE_URL=http://localhost:8000\nEXPO_PUBLIC_QA_MODE=true\n");
    assert.throws(() => readMobileTargetConfig(path, "https://qa.example.ts.net"), /HTTPS origin/);
  } finally {
    cleanup(directory);
  }
});

test("captures a real EAS Preview build identity and artifact URL", () => {
  const result = parseMobileEasEvidence(
    JSON.stringify({
      qaId: "qa/2026-08-26-01",
      sourceCommit: "A".repeat(40),
      delivery: "build",
      environment: "preview",
      channel: "qa",
      apiBaseUrl: "https://qa.example.ts.net",
      eas: {
        id: "build-123",
        buildDetailsUrl: "https://expo.dev/accounts/example/builds/build-123",
      },
      artifactUrl: "https://expo.dev/artifacts/eas/build-123.apk",
    }),
    {
      qaId: "qa/2026-08-26-01",
      mobileCommit: "a".repeat(40),
      stagingOrigin: "https://qa.example.ts.net",
    },
  );
  assert.deepEqual(result, {
    qaId: "qa/2026-08-26-01",
    sourceCommit: "a".repeat(40),
    delivery: "build",
    environment: "preview",
    channel: "qa",
    apiBaseUrl: "https://qa.example.ts.net",
    id: "build-123",
    detailsUrl: "https://expo.dev/accounts/example/builds/build-123",
    artifactUrl: "https://expo.dev/artifacts/eas/build-123.apk",
  });
});

test("captures an EAS Update identity without inventing an APK artifact", () => {
  const result = parseMobileEasEvidence(
    JSON.stringify({
      qaId: "qa/2026-08-26-01",
      delivery: "update",
      environment: "preview",
      channel: "qa",
      apiBaseUrl: "https://qa.example.ts.net",
      identity: {
        id: "update-group-123",
        detailsUrl: "https://expo.dev/accounts/example/projects/caneguard/updates/update-group-123",
      },
    }),
    {
      qaId: "qa/2026-08-26-01",
      stagingOrigin: "https://qa.example.ts.net",
    },
  );
  assert.equal(result.delivery, "update");
  assert.equal(result.id, "update-group-123");
  assert.equal(result.artifactUrl, null);
});

test("rejects an EAS build record that has no artifact URL", () => {
  assert.throws(
    () => parseMobileEasEvidence(
      JSON.stringify({
        qaId: "qa/2026-08-26-01",
        delivery: "build",
        environment: "preview",
        channel: "qa",
        apiBaseUrl: "https://qa.example.ts.net",
        identity: { id: "build-without-artifact" },
      }),
      { qaId: "qa/2026-08-26-01", stagingOrigin: "https://qa.example.ts.net" },
    ),
    /does not contain an APK artifact URL/,
  );
});
