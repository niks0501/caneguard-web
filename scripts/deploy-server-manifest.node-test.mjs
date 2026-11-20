import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const serverDir = join(import.meta.dirname, "..", "deploy", "server");

test("server upload-limit files match the SHA256SUMS manifest", () => {
  const result = spawnSync("sha256sum", ["-c", "SHA256SUMS"], { cwd: serverDir, encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
