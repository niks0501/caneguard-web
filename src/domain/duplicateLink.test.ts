import { describe, expect, it } from "vitest";
import { duplicateLinkBlockedReason } from "./duplicateLink";
import type { DiseaseReport, ReportLifecycle } from "./report.types";

const lifecycle = (overrides: Partial<ReportLifecycle> = {}): ReportLifecycle => ({
  caseState: "open",
  verificationOutcome: "not_determined",
  fieldValidationState: "unassigned",
  referralState: "not_referred",
  ...overrides,
});
const linkage = (linkBlockedReason?: "closed" | "visit_completed" | null): DiseaseReport["canonicalLinkage"] => ({
  isDuplicate: false,
  canonicalCase: null,
  linkedBy: null,
  linkBlockedReason,
});

describe("duplicateLinkBlockedReason", () => {
  it("trusts the server's reason, including an explicit null", () => {
    expect(duplicateLinkBlockedReason({ lifecycle: lifecycle(), canonicalLinkage: linkage("closed") })).toBe("closed");
    expect(duplicateLinkBlockedReason({ lifecycle: lifecycle({ caseState: "closed" }), canonicalLinkage: linkage(null) })).toBeNull();
  });

  it("applies the same lifecycle rules when the server sends no reason", () => {
    expect(duplicateLinkBlockedReason({ lifecycle: lifecycle({ caseState: "closed" }) })).toBe("closed");
    expect(duplicateLinkBlockedReason({ lifecycle: lifecycle({ fieldValidationState: "completed" }), canonicalLinkage: linkage() })).toBe("visit_completed");
    expect(duplicateLinkBlockedReason({ lifecycle: lifecycle({ fieldValidationState: "assigned" }) })).toBeNull();
  });

  it("leaves linking available when nothing is known", () => {
    expect(duplicateLinkBlockedReason({})).toBeNull();
  });
});
