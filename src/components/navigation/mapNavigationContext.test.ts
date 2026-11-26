import { describe, expect, it } from "vitest";
import {
  createReturnContext,
  isSafeInternalReturnPath,
  readReturnContext,
  withReturnContext,
} from "./mapNavigationContext";

describe("isSafeInternalReturnPath", () => {
  it.each(["/reports", "/reports/1?x=1", "/monitoring?view=map", "/dashboard#a", "/todo"])("accepts %s", (p) => {
    expect(isSafeInternalReturnPath(p)).toBe(true);
  });
  it.each(["", "   ", "//evil.com", "https://x.com/reports", "/reportsx", "/settings", "/reports\\x", " /reports"])("rejects %j", (p) => {
    expect(isSafeInternalReturnPath(p)).toBe(false);
  });
});

describe("return context", () => {
  it("round-trips through router state", () => {
    const ctx = createReturnContext("/reports/1", "Case", { clusterKeys: ["a"], clusterCoordinates: [1, 2] });
    expect(readReturnContext(withReturnContext(ctx))).toEqual(ctx);
  });
  it("rejects malformed state", () => {
    expect(readReturnContext(null)).toBeNull();
    expect(readReturnContext({})).toBeNull();
    expect(readReturnContext({ returnContext: { to: "//x", label: "L" } })).toBeNull();
    expect(readReturnContext({ returnContext: { to: "/reports", label: "  " } })).toBeNull();
    expect(readReturnContext({ returnContext: { to: "/reports", label: "L", clusterKeys: [1] } })).toBeNull();
    expect(readReturnContext({ returnContext: { to: "/reports", label: "L", clusterCoordinates: [1, NaN] } })).toBeNull();
  });
});
