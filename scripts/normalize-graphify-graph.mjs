#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Graphify keeps recursive-call self-loops (`a -> a`) on purpose: its extractor
 * preserves recursion in every language, and its clustering step ignores those
 * edges when it groups nodes.
 *
 * This repository's artifact contract is stricter. `graphify-out/graph.json` is
 * a directed=false, multigraph=false simple graph, and
 * `scripts/validate-graphify-artifacts.mjs` treats any `source === target` link
 * as a malformed relationship. A refreshed graph therefore has to be normalized
 * before it can be committed.
 *
 * The normalizer is deterministic and idempotent: it drops only self-loop links
 * and rewrites the file in the exact shape Graphify writes (2-space indent,
 * ASCII-escaped, no trailing newline), so a refresh diff shows the removed
 * edges and nothing else.
 *
 * Usage: run after `graphify update .` and before `graphify cluster-only .`
 * (or use `npm run graphify:refresh`, which chains all three).
 */
const graphPath = join(process.cwd(), "graphify-out", "graph.json");
const graph = JSON.parse(readFileSync(graphPath, "utf8"));

if (!graph || !Array.isArray(graph.links)) {
  console.error("graphify-out/graph.json has no links array; nothing to normalize.");
  process.exit(1);
}

const links = graph.links.filter(
  (link) => !link || link.source !== link.target,
);
const removed = graph.links.length - links.length;

if (removed === 0) {
  console.log("Graphify graph already has no self-loop links.");
  process.exit(0);
}

graph.links = links;
writeFileSync(graphPath, asciiJson(graph), "utf8");
console.log(`Removed ${removed} self-loop link(s) from graphify-out/graph.json.`);

/** Mirror Python's `json.dump(..., indent=2, ensure_ascii=True)`. */
function asciiJson(value) {
  return JSON.stringify(value, null, 2).replace(
    /[\u007f-\uffff]/g,
    (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}
