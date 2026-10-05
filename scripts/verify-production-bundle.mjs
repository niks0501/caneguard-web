import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const dir = path.resolve(process.argv[2] ?? "dist");
const files = readdirSync(path.join(dir, "assets"));
const scripts = files.filter((file) => file.endsWith(".js") || file.endsWith(".mjs"));
const workers = scripts.filter((file) => /^maplibre-gl-worker-/.test(file));
assert.equal(workers.length, 1, "Expected exactly one bundled MapLibre worker");
const worker = workers[0];
const contents = scripts.map((file) => readFileSync(path.join(dir, "assets", file), "utf8"));
assert.ok(contents.some((content) => content.includes(`/assets/${worker}`)), "MapLibre worker URL must be referenced by the app bundle");
assert.ok(statSync(path.join(dir, "assets", worker)).size > 100_000, "Expected worker implementation, not a URL stub");
const workerContents = readFileSync(path.join(dir, "assets", worker), "utf8");
assert.ok(!/from["']\.\/maplibre-gl-shared/.test(workerContents), "Worker dependencies must be bundled, not missing sibling modules");
assert.ok(contents.every((content) => !content.includes('http://localhost:8000')), "Production bundle must not contain the development API base");
if (process.argv[3]) {
  assert.ok(contents.some((content) => content.includes(process.argv[3])), "Expected validated API origin in freshly compiled bundle");
}
console.log("Production bundle verified: referenced same-origin MapLibre worker, bundled dependencies, no development API base.");
