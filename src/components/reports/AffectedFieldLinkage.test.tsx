import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ApiError } from "../../api/ApiError";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FieldSurveyBoundariesData, FieldSurveyBoundaryFeature, FieldSurveyPolygon, ReportAffectedField } from "../../domain/fieldSurvey.types";
import type { DiseaseReport } from "../../domain/report.types";
import { useFieldSurveys } from "../../hooks/fieldSurveys";
import { useUpdateReportAffectedFields } from "../../hooks/useReports";
import { AffectedFieldLinkage } from "./AffectedFieldLinkage";

vi.mock("../../hooks/fieldSurveys", () => ({ useFieldSurveys: vi.fn() }));
vi.mock("../../hooks/useReports", () => ({ useUpdateReportAffectedFields: vi.fn() }));

const polygon: FieldSurveyPolygon = {
  type: "Polygon",
  coordinates: [[[122.95, 10.7], [122.951, 10.7], [122.95, 10.701], [122.95, 10.7]]],
};

function boundary(id: number, areaSqm: number): FieldSurveyBoundaryFeature {
  const capturedAt = "2026-10-04T02:30:12.123456Z";
  return {
    type: "Feature",
    id: String(id),
    geometry: polygon,
    properties: {
      id,
      capturedAt,
      areaSqm,
      areaSource: "device_reported",
      inspector: { uuid: `inspector-${id}`, name: `Inspector ${id}` },
    },
  };
}

function queryResult(features: FieldSurveyBoundaryFeature[] = [], overrides: Record<string, unknown> = {}) {
  const data: FieldSurveyBoundariesData = {
    type: "FeatureCollection",
    features,
    metadata: {
      totalCount: features.length,
      returnedCount: features.length,
      limit: 250,
      truncated: false,
      page: 1,
      pageCount: 1,
    },
  };
  return {
    data,
    error: null,
    isError: false,
    isPending: false,
    isSuccess: true,
    isFetching: false,
    isRefetchError: false,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useFieldSurveys>;
}

function affectedField(id: number, areaSqm: number, rate: number): ReportAffectedField {
  return {
    fieldSurveyId: id,
    geometry: polygon,
    capturedAt: "2026-10-04T02:30:12.123456Z",
    areaSqm,
    areaSource: "device_reported",
    inspector: { uuid: `inspector-${id}`, name: `Inspector ${id}` },
    lossRatePercent: rate,
  };
}

function report(overrides: Partial<DiseaseReport> = {}): DiseaseReport {
  return {
    uuid: "case-123",
    referenceCode: "CG-2026-0123",
    barangay: "Mabini",
    submittedByName: "Field Reporter",
    submitterRole: "field_reporter",
    capturedAt: "2026-10-04T02:00:00.000Z",
    submittedAt: "2026-10-04T03:00:00.000Z",
    predictedDisease: "rust",
    imageStatus: "unavailable",
    symptoms: [],
    reviewStatus: "submitted_unverified",
    reviewVersion: 4,
    affectedFields: [],
    ...overrides,
  };
}

function mutationResult(overrides: Record<string, unknown> = {}) {
  return {
    error: null,
    isError: false,
    isPending: false,
    mutateAsync: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useUpdateReportAffectedFields>;
}

function renderLinkage(
  currentReport = report(),
  onRefresh = vi.fn().mockResolvedValue({ data: currentReport }),
) {
  return render(
    <MemoryRouter>
      <AffectedFieldLinkage report={currentReport} onRefresh={onRefresh} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(useFieldSurveys).mockReturnValue(queryResult([boundary(123, 6075.12), boundary(124, 8120.5)]));
  vi.mocked(useUpdateReportAffectedFields).mockReturnValue(mutationResult());
});

describe("AffectedFieldLinkage", () => {
  it("links multiple phone-captured boundaries and saves office rates without an area rollup", async () => {
    const user = userEvent.setup();
    const first = affectedField(123, 6075.12, 18.5);
    const second = affectedField(124, 8120.5, 42);
    const save = vi.fn().mockResolvedValue({
      affectedFields: [first, second],
      version: 5,
      updatedAt: "2026-10-04T04:00:00.000Z",
    });
    vi.mocked(useUpdateReportAffectedFields).mockReturnValue(mutationResult({ mutateAsync: save }));

    renderLinkage();

    expect(screen.getByText("Area is device-reported. Loss rates are supplied by the office.")).toBeInTheDocument();
    expect(screen.getByText("0.61 ha")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Show on Field boundaries" })
      .some((link) => link.getAttribute("href") === "/monitoring?view=boundaries&boundary=123")).toBe(true);
    expect(screen.queryByText(/combined area|total area|server area/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Link boundary 123" }));
    expect(screen.getByText("Enter a rate from 0 to 100.")).toBeInTheDocument();
    expect(screen.getByLabelText("Office loss rate for boundary 123 (percent)")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Save affected boundaries" })).toBeDisabled();
    await user.clear(screen.getByLabelText("Office loss rate for boundary 123 (percent)"));
    await user.type(screen.getByLabelText("Office loss rate for boundary 123 (percent)"), "18.5");
    await user.click(screen.getByRole("checkbox", { name: "Link boundary 124" }));
    await user.type(screen.getByLabelText("Office loss rate for boundary 124 (percent)"), "42");
    await user.click(screen.getByRole("button", { name: "Save affected boundaries" }));

    expect(save).toHaveBeenCalledWith({
      expectedVersion: 4,
      affectedFields: [
        { fieldSurveyId: 123, lossRatePercent: 18.5 },
        { fieldSurveyId: 124, lossRatePercent: 42 },
      ],
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Affected field boundaries saved.");
  });

  it("keeps saved links selectable while paging through older boundary pages", () => {
    const linked = affectedField(9, 5000, 25);
    const available = Array.from({ length: 250 }, (_, index) => boundary(300 - index, 5000));
    vi.mocked(useFieldSurveys).mockReturnValue(queryResult(available, {
      data: {
        type: "FeatureCollection",
        features: available,
        metadata: { totalCount: 300, returnedCount: 250, limit: 250, truncated: true, page: 1, pageCount: 2 },
      },
    }));

    renderLinkage(report({ affectedFields: [linked] }));

    const lookup = screen.getByRole("status");
    expect(lookup).toHaveTextContent("300 matching boundaries · page 1 of 2");
    expect(lookup).toHaveTextContent("of 2. Linked boundaries stay selectable even when they are not on this page.");
    expect(screen.getByRole("checkbox", { name: "Link boundary 9" })).toBeChecked();
    expect(screen.getByText("Linked from an earlier boundary list")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Show on Field boundaries" })
      .some((link) => link.getAttribute("href") === "/monitoring?view=boundaries&boundary=9")).toBe(false);
  });

  it("states a truncated single-page read instead of showing a complete-looking list", () => {
    const available = [boundary(300, 5000), boundary(299, 5000)];
    vi.mocked(useFieldSurveys).mockReturnValue(queryResult(available, {
      data: {
        type: "FeatureCollection",
        features: available,
        metadata: { totalCount: 250, returnedCount: 2, limit: 250, truncated: true, page: 1, pageCount: 1 },
      },
    }));

    renderLinkage();

    const notice = screen.getByText(/boundaries\. This read stopped before the last matching boundary/);
    expect(notice).toHaveTextContent("250 matching boundaries");
    expect(notice).not.toHaveTextContent("page 1 of 1");
  });

  it("searches and pages the server lookup instead of widening the download", async () => {
    const user = userEvent.setup();
    const available = [boundary(300, 5000), boundary(299, 5000)];
    vi.mocked(useFieldSurveys).mockReturnValue(queryResult(available, {
      data: {
        type: "FeatureCollection",
        features: available,
        metadata: { totalCount: 300, returnedCount: 2, limit: 250, truncated: true, page: 1, pageCount: 2 },
      },
    }));

    renderLinkage();

    await user.type(screen.getByRole("searchbox", { name: "Find an older boundary" }), "Mateo");
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(vi.mocked(useFieldSurveys).mock.calls.at(-1)?.[0]).toMatchObject({ search: "Mateo", page: 1 });
    // Rows found beyond the viewer's loaded page cannot be opened there.
    expect(screen.queryByRole("link", { name: "Show on Field boundaries" })).not.toBeInTheDocument();
    expect(screen.queryByText("Linked from an earlier boundary list")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Go to page 2" }));
    expect(vi.mocked(useFieldSurveys).mock.calls.at(-1)?.[0]).toMatchObject({ page: 2 });
    expect(screen.queryByRole("link", { name: "Show on Field boundaries" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(vi.mocked(useFieldSurveys).mock.calls.at(-1)?.[0]).toMatchObject({ search: "", page: 1 });
    expect(screen.getAllByRole("link", { name: "Show on Field boundaries" }).length).toBeGreaterThan(0);
  });

  it("previews a boundary shape without disturbing the draft", async () => {
    const user = userEvent.setup();
    vi.mocked(useFieldSurveys).mockReturnValue(queryResult([boundary(123, 6075.12)]));

    renderLinkage(report({ affectedFields: [affectedField(123, 6075.12, 18.5)] }));

    await user.click(screen.getByRole("button", { name: "Preview shape" }));

    const preview = screen.getByRole("group", { name: "Boundary 123 shape" });
    expect(within(preview).getByRole("img", { name: "Stored shape of boundary 123" })).toBeInTheDocument();
    expect(within(preview).getByText("18.5%")).toBeInTheDocument();
    expect(within(preview).getByText("Device-reported area")).toBeInTheDocument();
    // The draft loss rate is untouched by looking at the shape.
    expect(screen.getByLabelText(/Office loss rate for boundary 123/)).toHaveValue(18.5);
  });

  it("keeps loss rates finite and inside 0 to 100", async () => {
    const user = userEvent.setup();
    const save = vi.fn();
    vi.mocked(useUpdateReportAffectedFields).mockReturnValue({
      mutateAsync: save, reset: vi.fn(), isPending: false, isError: false, error: null,
    } as unknown as ReturnType<typeof useUpdateReportAffectedFields>);
    vi.mocked(useFieldSurveys).mockReturnValue(queryResult([boundary(123, 6075.12)]));

    renderLinkage(report({ affectedFields: [affectedField(123, 6075.12, 18.5)] }));

    const rate = screen.getByLabelText(/Office loss rate for boundary 123/);
    await user.clear(rate);
    await user.type(rate, "101");

    // Out-of-range and unknown rates block the save; unknown is never treated as 0.
    expect(rate).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Enter a rate from 0 to 100.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save affected boundaries" })).toBeDisabled();
    expect(save).not.toHaveBeenCalled();
  });

  it("shows an honest empty state when no phone boundaries have been captured", () => {
    vi.mocked(useFieldSurveys).mockReturnValue(queryResult());

    renderLinkage();

    expect(screen.getByText("No recorded field boundaries are available to link.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Field boundaries" })).toHaveAttribute(
      "href",
      "/monitoring?view=boundaries",
    );
    expect(screen.getByRole("button", { name: "Save affected boundaries" })).toBeDisabled();
  });

  it("does not claim the archive is empty while boundaries are loading", () => {
    vi.mocked(useFieldSurveys).mockReturnValue(queryResult([], {
      data: undefined,
      isPending: true,
      isSuccess: false,
      isFetching: true,
    }));

    renderLinkage();

    expect(screen.getByText("Loading field boundaries…")).toBeInTheDocument();
    expect(screen.queryByText("No recorded field boundaries are available to link.")).not.toBeInTheDocument();
  });

  it("does not claim the archive is empty when its initial request fails", () => {
    vi.mocked(useFieldSurveys).mockReturnValue(queryResult([], {
      data: undefined,
      isError: true,
      isSuccess: false,
    }));

    renderLinkage();

    expect(screen.getByText(/Field boundary choices are unavailable/)).toBeInTheDocument();
    expect(screen.queryByText("No recorded field boundaries are available to link.")).not.toBeInTheDocument();
  });

  it("does not claim the archive is empty after a failed refresh", () => {
    vi.mocked(useFieldSurveys).mockReturnValue(queryResult([], {
      isError: true,
      isSuccess: false,
      isRefetchError: true,
    }));

    renderLinkage();

    expect(screen.getByText(/boundary archive could not be refreshed/)).toBeInTheDocument();
    expect(screen.queryByText("No recorded field boundaries are available to link.")).not.toBeInTheDocument();
  });

  it("keeps the draft version through refreshes and advances it only when replacing the draft", async () => {
    const user = userEvent.setup();
    const originalField = affectedField(123, 6075.12, 18.5);
    const concurrentField = affectedField(999, 8000, 12);
    const refreshedReport = report({ reviewVersion: 5, affectedFields: [originalField, concurrentField] });
    const savedFields = [affectedField(123, 6075.12, 21), concurrentField];
    let mutationError: unknown = null;
    const reset = vi.fn(() => {
      mutationError = null;
    });
    const save = vi.fn()
      .mockImplementationOnce(async () => {
        mutationError = new ApiError("Stale version", { status: 409 });
        throw mutationError;
      })
      .mockResolvedValueOnce({ affectedFields: savedFields, version: 6, updatedAt: "2026-10-04T04:00:00.000Z" })
      .mockResolvedValueOnce({
        affectedFields: [affectedField(123, 6075.12, 22), concurrentField],
        version: 7,
        updatedAt: "2026-10-04T05:00:00.000Z",
      });
    const mutation = {
      get error() { return mutationError; },
      get isError() { return mutationError !== null; },
      isPending: false,
      mutateAsync: save,
      reset,
    } as unknown as ReturnType<typeof useUpdateReportAffectedFields>;
    vi.mocked(useUpdateReportAffectedFields).mockReturnValue(mutation);

    const onRefresh = vi.fn().mockResolvedValue({ data: refreshedReport });
    const view = renderLinkage(report({ affectedFields: [originalField], reviewVersion: 4 }), onRefresh);
    const rate = screen.getByLabelText("Office loss rate for boundary 123 (percent)");
    await user.clear(rate);
    await user.type(rate, "21");

    view.rerender(
      <MemoryRouter>
        <AffectedFieldLinkage report={refreshedReport} onRefresh={onRefresh} />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: "Save affected boundaries" }));

    expect(save).toHaveBeenNthCalledWith(1, {
      expectedVersion: 4,
      affectedFields: [{ fieldSurveyId: 123, lossRatePercent: 21 }],
    });
    view.rerender(
      <MemoryRouter>
        <AffectedFieldLinkage report={refreshedReport} onRefresh={onRefresh} />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: "Refresh case and discard draft changes" }));
    expect(onRefresh).toHaveBeenCalledOnce();

    const refreshedRate = screen.getByLabelText("Office loss rate for boundary 123 (percent)");
    await user.clear(refreshedRate);
    await user.type(refreshedRate, "21");
    await user.click(screen.getByRole("button", { name: "Save affected boundaries" }));
    expect(save).toHaveBeenNthCalledWith(2, {
      expectedVersion: 5,
      affectedFields: [
        { fieldSurveyId: 123, lossRatePercent: 21 },
        { fieldSurveyId: 999, lossRatePercent: 12 },
      ],
    });
    expect(await screen.findByText("Affected field boundaries saved.")).toBeInTheDocument();

    const savedReport = report({ reviewVersion: 6, affectedFields: savedFields });
    view.rerender(
      <MemoryRouter>
        <AffectedFieldLinkage report={savedReport} onRefresh={onRefresh} />
      </MemoryRouter>,
    );
    const savedRate = screen.getByLabelText("Office loss rate for boundary 123 (percent)");
    await user.clear(savedRate);
    await user.type(savedRate, "22");
    await user.click(screen.getByRole("button", { name: "Save affected boundaries" }));
    expect(save).toHaveBeenNthCalledWith(3, {
      expectedVersion: 6,
      affectedFields: [
        { fieldSurveyId: 123, lossRatePercent: 22 },
        { fieldSurveyId: 999, lossRatePercent: 12 },
      ],
    });
  });
});
