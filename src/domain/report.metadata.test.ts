import { describe, expect, it } from "vitest";
import { fieldValidationFilterOptions } from "./report.metadata";

describe("fieldValidationFilterOptions", () => {
  it("does not offer the phone-local in_progress visit state as a filter", () => {
    expect(fieldValidationFilterOptions).toEqual(["unassigned", "assigned", "completed"]);
  });
});
