import { afterEach, describe, expect, it, vi } from "vitest";
import { MockReportsRepository } from "./MockReportsRepository";

afterEach(() => {
  vi.useRealTimers();
});

describe("mock monthly reporting periods", () => {
  it("uses the Manila calendar month and its actual final date", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T16:00:00Z"));

    const summary = await new MockReportsRepository().getMonthlySummary();

    expect(summary.month).toBe("2026-10");
    expect(summary.period).toEqual({ from: "2026-10-01", to: "2026-10-31" });
  });

  it("returns the last calendar day for a leap-year February", async () => {
    const summary = await new MockReportsRepository().getMonthlySummary("2024-02");

    expect(summary.period).toEqual({ from: "2024-02-01", to: "2024-02-29" });
  });
});

describe("mock advisory library", () => {
  const seededUsed = "5c21f90a-5a40-4d8d-ae35-1275bb3f0102";

  it("starts with validated advisories across diseases, the pest and general field operations", async () => {
    const list = await new MockReportsRepository().listAdvisories();
    expect(list.length).toBeGreaterThanOrEqual(5);
    expect(list.every((item) => item.status === "validated")).toBe(true);
    expect(new Set(list.map((item) => item.category))).toEqual(new Set(["rust", "smut", "mosaic", "rssi", "general"]));
    expect(new Set(list.map((item) => item.code)).size).toBe(list.length);
  });

  it("creates a selectable advisory with the next free generated code, like the API", async () => {
    const repository = new MockReportsRepository();
    const first = await repository.createAdvisory({ title: " Rust follow-up ", content: " Recheck in a week. ", category: "rust" });
    const second = await repository.createAdvisory({ title: "Rust again", content: "More.", category: "rust" });
    const loose = await repository.createAdvisory({ title: "No topic", content: "Text." });
    expect(first).toMatchObject({ title: "Rust follow-up", content: "Recheck in a week.", status: "validated", category: "rust", code: "ADV-RUST-002" });
    expect(second.code).toBe("ADV-RUST-003");
    expect(loose).toMatchObject({ category: null, code: expect.stringMatching(/^ADV-GENERAL-\d{3}$/) });
    expect((await repository.listAdvisories()).map((item) => item.uuid)).toEqual(expect.arrayContaining([first.uuid, second.uuid, loose.uuid]));
  });

  it("rejects missing text and duplicate or malformed codes with field errors", async () => {
    const repository = new MockReportsRepository();
    await expect(repository.createAdvisory({ title: " ", content: "" })).rejects.toMatchObject({ status: 422, errors: { title: expect.any(Array), content: expect.any(Array) } });
    await expect(repository.createAdvisory({ title: "T", content: "C", code: "ADV-RUST-001" })).rejects.toMatchObject({ status: 422, errors: { code: expect.any(Array) } });
    await expect(repository.createAdvisory({ title: "T", content: "C", code: "bad code" })).rejects.toMatchObject({ status: 422, errors: { code: expect.any(Array) } });
  });

  it("edits in place and refuses edits of archived advisories", async () => {
    const repository = new MockReportsRepository();
    const [target] = await repository.listAdvisories();
    await expect(repository.updateAdvisory(target.uuid, { title: "Reworded", category: null })).resolves.toMatchObject({ uuid: target.uuid, title: "Reworded", category: null, code: target.code });
    await repository.deleteAdvisory(seededUsed);
    await expect(repository.updateAdvisory(seededUsed, { title: "x" })).rejects.toMatchObject({
      status: 422, errors: { status: [expect.stringContaining("removed from the office library")] },
    });
  });

  it("hard-deletes an unused advisory and archives one a case already used", async () => {
    const repository = new MockReportsRepository();
    const before = await repository.listAdvisories();
    const unused = before.find((item) => item.uuid !== seededUsed)!;
    await expect(repository.deleteAdvisory(unused.uuid)).resolves.toEqual({ uuid: unused.uuid, deleted: "hard" });
    await expect(repository.deleteAdvisory(unused.uuid)).rejects.toMatchObject({ status: 404 });
    await expect(repository.deleteAdvisory(seededUsed)).resolves.toEqual({ uuid: seededUsed, deleted: "archived" });
    expect((await repository.listAdvisories()).map((item) => item.uuid)).not.toContain(seededUsed);
  });

  it("refuses a removed advisory on review with the contract message, and freezes the wording once sent", async () => {
    const repository = new MockReportsRepository();
    const { reports } = await repository.listReports({ perPage: 1 });
    const report = (await repository.getReportById(reports[0].uuid))!;
    const [advisory] = await repository.listAdvisories();
    const sent = await repository.updateReview(report.uuid, {
      expectedVersion: report.reviewVersion ?? 0, actionTaken: "advisory_provided", advisoryUuid: advisory.uuid,
    });
    expect(sent.advisory).toMatchObject({ uuid: advisory.uuid, title: advisory.title, deliveryState: "pending" });

    await repository.updateAdvisory(advisory.uuid, { title: "Reworded after sending" });
    expect((await repository.getReportById(report.uuid))!.advisory?.title).toBe(advisory.title);
    expect(await repository.deleteAdvisory(advisory.uuid)).toEqual({ uuid: advisory.uuid, deleted: "archived" });

    await expect(repository.updateReview(report.uuid, {
      expectedVersion: sent.reviewVersion ?? 0, actionTaken: "advisory_provided", advisoryUuid: advisory.uuid,
    })).rejects.toMatchObject({ status: 422, errors: { advisory_uuid: ["This advisory was removed from the office library. Pick another one."] } });
  });
});
