import { describe, expect, it } from "vitest";
import indexCss from "../index.css?raw";
import tokensCss from "./tokens.css?raw";

// `src/styles/tokens.css` and `src/index.css` are the app's declarative design
// contract: the stylesheets are the consumer, and every `var(--x)` they
// reference must resolve to a declared value. An undeclared custom property
// makes the declaration invalid at computed-value time, so the element silently
// falls back to an inherited or initial colour/size.
// The sheets come in through Vite's `?raw` imports so this file stays inside the
// app TypeScript project (DOM libs only, no Node types) like every other test.
const stylesheets = [tokensCss, indexCss];

const declaredProperties = new Map<string, string>();
for (const css of stylesheets) {
  for (const match of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;{}]+);/gi)) {
    declaredProperties.set(match[1], match[2].trim());
  }
}

const referencedProperties = new Set<string>();
for (const css of stylesheets) {
  for (const match of css.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
    referencedProperties.add(match[1]);
  }
}

function resolve(name: string, seen: string[] = []): string {
  const value = declaredProperties.get(name);
  if (value === undefined) throw new Error(`${name} is not declared`);
  if (seen.includes(name)) {
    throw new Error(`circular custom property: ${[...seen, name].join(" -> ")}`);
  }
  const alias = /^var\(\s*(--[a-z0-9-]+)\s*\)$/.exec(value);
  if (alias) return resolve(alias[1], [...seen, name]);
  return value;
}

describe("design tokens", () => {
  it("resolves every custom property the stylesheets reference", () => {
    expect(referencedProperties.size).toBeGreaterThan(0);

    const unresolved: string[] = [];
    for (const name of referencedProperties) {
      try {
        expect(resolve(name)).not.toContain("var(");
      } catch {
        unresolved.push(name);
      }
    }

    expect(unresolved).toEqual([]);
  });

  it("gives the Quiet Field aliases concrete values instead of dropping declarations", () => {
    expect(resolve("--color-primary-soft")).toMatch(/^#[0-9a-f]{3,8}$/i);
    expect(resolve("--color-primary-text")).toMatch(/^#[0-9a-f]{3,8}$/i);
    expect(resolve("--text-caption")).toMatch(/^\d+(\.\d+)?(px|rem|em)$/);

    // The aliases exist so retinted surfaces keep the palette's own values
    // rather than the browser default (black text, transparent fill).
    expect(resolve("--text-caption")).toBe(resolve("--text-meta"));
  });
});
