import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DiseaseReport, PaginatedReports, ReportFilters } from "../domain/report.types";
import { readQueuePages, reportQueueReadPageSize } from "./reportQueries";
import { reportsRepository } from "../services/reports.service";

vi.mock("../services/reports.service", () => ({
  reportsRepository: { listReports: vi.fn() },
}));

function report(index: number): DiseaseReport {
  return {
    uuid: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    referenceCode: `CG-2026-${String(index).padStart(4, "0")}`,
    barangay: "Mabini",
  } as DiseaseReport;
}

const fixture = Array.from({ length: 137 }, (_, index) => report(index + 1));

function paginate(filters: ReportFilters = {}): Promise<PaginatedReports> {
  const page = filters.page ?? 1;
  const perPage = filters.perPage ?? 15;
  const start = (page - 1) * perPage;
  const rows = fixture.slice(start, start + perPage);
  return Promise.resolve({
    reports: rows,
    meta: {
      currentPage: page,
      from: rows.length ? start + 1 : null,
      lastPage: Math.ceil(fixture.length / perPage),
      perPage,
      to: rows.length ? start + rows.length : null,
      total: fixture.length,
    },
  });
}

describe("readQueuePages", () => {
  beforeEach(() => {
    vi.mocked(reportsRepository.listReports).mockReset();
  });

  it("exposes record 101 instead of stopping at the first page", async () => {
    vi.mocked(reportsRepository.listReports).mockImplementation(paginate);

    const read = await readQueuePages({ queue: "needs_review", sort: "oldest" });

    expect(read.reports).toHaveLength(fixture.length);
    expect(read.reports[100].referenceCode).toBe("CG-2026-0101");
    expect(read.total).toBe(137);
    expect(read.truncated).toBe(false);
    expect(read.loadedPages).toBe(2);
    expect(vi.mocked(reportsRepository.listReports)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(reportsRepository.listReports)).toHaveBeenCalledWith(
      expect.objectContaining({ queue: "needs_review", page: 2, perPage: reportQueueReadPageSize }),
    );
  });

  it("reports a bounded read as truncated with the authoritative total intact", async () => {
    vi.mocked(reportsRepository.listReports).mockImplementation(paginate);

    const read = await readQueuePages({ queue: "needs_review" }, 1);

    expect(read.reports).toHaveLength(reportQueueReadPageSize);
    expect(read.total).toBe(137);
    expect(read.truncated).toBe(true);
    expect(vi.mocked(reportsRepository.listReports)).toHaveBeenCalledTimes(1);
  });

  it("makes one request when the queue already fits one page", async () => {
    vi.mocked(reportsRepository.listReports).mockResolvedValue({
      reports: fixture.slice(0, 3),
      meta: { currentPage: 1, from: 1, lastPage: 1, perPage: 100, to: 3, total: 3 },
    });

    const read = await readQueuePages({ queue: "follow_up_due" });

    expect(read.reports).toHaveLength(3);
    expect(read.truncated).toBe(false);
    expect(vi.mocked(reportsRepository.listReports)).toHaveBeenCalledTimes(1);
  });
});
