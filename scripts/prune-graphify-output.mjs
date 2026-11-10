#!/usr/bin/env node
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

/**
 * `graphify cluster-only` copies the curated graph into a dated directory
 * (`graphify-out/YYYY-MM-DD/`) before every overwrite, and renders a
 * `graph.html` viewer. Neither is read by `graphify query|path|explain` or by
 * `scripts/validate-graphify-artifacts.mjs`, and each dated copy is the size of
 * the whole graph, so they accumulate per worktree. Only the current
 * `graph.json` and `GRAPH_REPORT.md` are worth keeping.
 *
 * Run by `npm run graphify:refresh` after clustering; safe to run any time.
 */
const outputRoot = join(process.cwd(), "graphify-out");
if (!existsSync(outputRoot)) process.exit(0);

let removed = 0;
for (const entry of readdirSync(outputRoot, { withFileTypes: true })) {
  const dated = entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name);
  if (dated || (entry.isFile() && entry.name === "graph.html")) {
    rmSync(join(outputRoot, entry.name), { recursive: true, force: true });
    removed += 1;
  }
}
console.log(`Pruned ${removed} dated snapshot/viewer entr${removed === 1 ? "y" : "ies"} from graphify-out/.`);
