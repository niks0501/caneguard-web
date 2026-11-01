import { describe, expect, it } from "vitest";
import { morningNote } from "./morningNote";

const queues = {
  needs_review: 0,
  needs_visit: 0,
  follow_up_due: 0,
  upcoming: 0,
  unverified_no_active_work: 0,
};

describe("morningNote", () => {
  it("names the most pressing item first", () => {
    expect(morningNote({ ...queues, follow_up_due: 2, needs_review: 5 })).toBe(
      "2 field visits are past the target date.",
    );
    expect(morningNote({ ...queues, needs_review: 1, needs_visit: 4 })).toBe(
      "1 report is waiting for your review.",
    );
    expect(morningNote({ ...queues, needs_visit: 3 })).toBe(
      "3 reports need a field visit.",
    );
  });

  it("says nothing needs the reviewer when every queue is empty", () => {
    expect(morningNote(queues)).toBe("Nothing needs you.");
  });
});
