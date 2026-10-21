import { render, screen } from "@testing-library/react";
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

  it("keeps saved links visible when they are older than the selectable archive window", () => {
    const linked = affectedField(9, 5000, 25);
    const available = Array.from({ length: 250 }, (_, index) => boundary(300 - index, 5000));
    vi.mocked(useFieldSurveys).mockReturnValue(queryResult(available, {
      data: {
        type: "FeatureCollection",
        features: available,
        metadata: { totalCount: 300, returnedCount: 250, limit: 250, truncated: true },
      },
    }));

    renderLinkage(report({ affectedFields: [linked] }));

    expect(screen.getByText("Showing the newest 250 of 300 boundaries; older boundaries are not available to link here.")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Link boundary 9" })).toBeChecked();
    expect(screen.getByText("Not available in the loaded boundary list")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Show on Field boundaries" })
      .some((link) => link.getAttribute("href") === "/monitoring?view=boundaries&boundary=9")).toBe(false);
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
