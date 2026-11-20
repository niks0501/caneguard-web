import test, { after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const outDir = mkdtempSync(join(tmpdir(), "map-worker-dist-"));
const assetsDir = join(outDir, "assets");

const build = spawnSync(
  process.execPath,
  [join(root, "node_modules", "vite", "bin", "vite.js"), "build", "--outDir", outDir, "--emptyOutDir"],
  {
    cwd: root,
    env: {
      ...process.env,
      VITE_API_BASE_URL: "https://caneguard.online",
      VITE_DATA_SOURCE: "api",
      VITE_MAPTILER_KEY: "test-build-key",
      VITE_REALTIME_ENABLED: "false",
    },
    encoding: "utf8",
  },
);

const workers = existsSync(assetsDir)
  ? readdirSync(assetsDir).filter((file) => /^maplibre-gl-worker-.*\.js$/.test(file))
  : [];

after(() => rmSync(outDir, { recursive: true, force: true }));

test("production build emits one map worker asset", () => {
  assert.equal(build.status, 0, build.stderr);
  assert.equal(workers.length, 1);
});

test("the emitted map worker parses as a module", () => {
  const check = spawnSync(process.execPath, ["--input-type=module", "--check"], {
    input: readFileSync(join(assetsDir, workers[0])),
    encoding: "utf8",
  });
  assert.equal(check.status, 0, check.stderr);
});

test("the built app bundle registers a same-origin worker URL that is served", () => {
  const references = readdirSync(assetsDir)
    .filter((file) => file.endsWith(".js"))
    .flatMap((file) =>
      [...readFileSync(join(assetsDir, file), "utf8").matchAll(/\/assets\/maplibre-gl-worker-[^"'`\s]+?\.js/g)].map(
        (match) => match[0],
      ),
    );
  assert.notEqual(references.length, 0);
  for (const reference of references) {
    assert.ok(existsSync(join(outDir, reference)), `${reference} is missing from the build output`);
  }
});
