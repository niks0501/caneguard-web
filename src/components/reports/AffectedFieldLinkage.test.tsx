import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/ApiError";
import type {
  FieldSurveyBoundariesData,
  FieldSurveyBoundaryFeature,
  FieldSurveyPolygon,
  InspectorBoundaryAttachment,
  ReportAffectedField,
} from "../../domain/fieldSurvey.types";
import type { DiseaseReport } from "../../domain/report.types";
import { useFieldSurveys } from "../../hooks/fieldSurveys";
import { useUpdateReportAffectedFields } from "../../hooks/useReports";
import { AffectedFieldLinkage } from "./AffectedFieldLinkage";

vi.mock("../../hooks/fieldSurveys", () => ({ useFieldSurveys: vi.fn() }));
vi.mock("../../hooks/useReports", () => ({ useUpdateReportAffectedFields: vi.fn() }));

/** About 111 m square at the case location. */
function plotAt(longitude: number, latitude: number): FieldSurveyPolygon {
  return {
    type: "Polygon",
    coordinates: [[
      [longitude, latitude],
      [longitude + 0.001, latitude],
      [longitude + 0.001, latitude + 0.001],
      [longitude, latitude + 0.001],
      [longitude, latitude],
    ]],
  };
}

const nearPlot = plotAt(122.95, 10.7);
const farPlot = plotAt(123.05, 10.8);

function feature(id: number, geometry: FieldSurveyPolygon, areaSqm = 10_000, affectedAreaSqm: number | null = null): FieldSurveyBoundaryFeature {
  return {
    type: "Feature",
    id: String(id),
    geometry,
    properties: {
      id,
      capturedAt: "2026-10-04T02:30:12.123456Z",
      areaSqm,
      areaSource: "device_reported",
      affectedAreas: [],
      affectedAreaSqm,
      cases: [],
      inspector: { uuid: `inspector-${id}`, name: `Inspector ${id}` },
    },
  };
}

function surveysResult(features: FieldSurveyBoundaryFeature[]) {
  const data: FieldSurveyBoundariesData = {
    type: "FeatureCollection",
    features,
    metadata: { totalCount: features.length, returnedCount: features.length, limit: 250, truncated: false, page: 1, pageCount: 1 },
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
  } as unknown as ReturnType<typeof useFieldSurveys>;
}

function linkedField(id: number, geometry: FieldSurveyPolygon, affectedPercent: number | null = 26): ReportAffectedField {
  return {
    fieldSurveyId: id,
    geometry,
    capturedAt: "2026-10-04T02:30:12.123456Z",
    areaSqm: 10_000,
    areaSource: "device_reported",
    inspector: { uuid: `inspector-${id}`, name: `Inspector ${id}` },
    affectedAreaSqm: affectedPercent === null ? null : 2_600,
    affectedPercent,
    lossRatePercent: null,
  };
}

function attachmentFor(field: ReportAffectedField | null, overrides: Partial<InspectorBoundaryAttachment> = {}): InspectorBoundaryAttachment {
  return {
    clientUuid: "client-uuid",
    arrived: field !== null,
    confirmed: false,
    boundary: field === null ? null : {
      fieldSurveyId: field.fieldSurveyId,
      geometry: field.geometry,
      capturedAt: field.capturedAt,
      areaSqm: field.areaSqm,
      areaSource: field.areaSource,
      inspector: field.inspector,
      affectedAreaSqm: field.affectedAreaSqm,
      affectedPercent: field.affectedPercent,
    },
    ...overrides,
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
    finalLatitude: 10.7005,
    finalLongitude: 122.9505,
    affectedFields: [],
    ...overrides,
  };
}

function mutation(overrides: Record<string, unknown> = {}) {
  return {
    error: null,
    isError: false,
    isPending: false,
    mutateAsync: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useUpdateReportAffectedFields>;
}

function renderLinkage(currentReport: DiseaseReport, onRefresh = vi.fn().mockResolvedValue({ data: currentReport })) {
  return render(
    <MemoryRouter>
      <AffectedFieldLinkage report={currentReport} onRefresh={onRefresh} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(useFieldSurveys).mockReturnValue(surveysResult([feature(201, farPlot), feature(202, nearPlot, 10_000, 1_200)]));
  vi.mocked(useUpdateReportAffectedFields).mockReturnValue(mutation());
});

describe("AffectedFieldLinkage", () => {
  it("shows an empty case with one action and does not load field maps until asked", async () => {
    const user = userEvent.setup();
    renderLinkage(report());

    expect(screen.getByRole("heading", { name: "Field measurement" })).toBeInTheDocument();
    expect(screen.getByText("No field map on this case yet.")).toBeInTheDocument();
    expect(vi.mocked(useFieldSurveys).mock.calls.at(-1)?.[1]).toEqual({ enabled: false });

    await user.click(screen.getByRole("button", { name: "Link a field map" }));

    expect(vi.mocked(useFieldSurveys).mock.calls.at(-1)?.[1]).toEqual({ enabled: true });
    expect(screen.getByRole("group", { name: "Choose field maps" })).toBeInTheDocument();
  });

  it("confirms the map the inspector attached with one click and no typed rate", async () => {
    const user = userEvent.setup();
    const attached = linkedField(123, nearPlot, 26);
    const save = vi.fn().mockResolvedValue({ affectedFields: [attached], version: 5, updatedAt: "2026-10-04T04:00:00.000Z" });
    vi.mocked(useUpdateReportAffectedFields).mockReturnValue(mutation({ mutateAsync: save }));

    renderLinkage(report({ inspectorAttachment: attachmentFor(attached) }));

    const card = screen.getByRole("article", { name: "Field map 123" });
    expect(within(card).getByText("Waiting for you")).toBeInTheDocument();
    expect(within(card).getByText("1 ha")).toBeInTheDocument();
    expect(within(card).getByText("26%")).toBeInTheDocument();
    expect(within(card).getByText("Case location is inside this plot")).toBeInTheDocument();
    expect(screen.queryByText(/loss rate/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirm field" }));

    expect(save).toHaveBeenCalledWith({ expectedVersion: 4, affectedFields: [{ fieldSurveyId: 123 }] });
    expect(await screen.findByText("Field confirmed.")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "Field map 123" })).getByText("Confirmed")).toBeInTheDocument();
  });

  it("keeps the other maps out of sight until the reviewer says it is the wrong field", async () => {
    const user = userEvent.setup();
    const attached = linkedField(123, farPlot, 26);
    const save = vi.fn().mockResolvedValue({
      affectedFields: [linkedField(202, nearPlot, 12)],
      version: 5,
      updatedAt: "2026-10-04T04:00:00.000Z",
    });
    vi.mocked(useUpdateReportAffectedFields).mockReturnValue(mutation({ mutateAsync: save }));

    renderLinkage(report({ inspectorAttachment: attachmentFor(attached) }));

    expect(screen.getByText("Case location is outside this plot")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Choose field maps" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Wrong field…" }));

    const choices = within(screen.getByRole("group", { name: "Choose field maps" })).getAllByRole("listitem");
    // The map under the case comes first, with its distance, then the far one.
    expect(within(choices[0]).getByText(/Map 202/)).toBeInTheDocument();
    expect(within(choices[0]).getByText(/12% affected · 10 m from case/)).toBeInTheDocument();
    expect(choices.some((choice) => within(choice).queryByText(/Map 201/) !== null)).toBe(true);
    expect(within(choices[0]).queryByText(/Map 201/)).not.toBeInTheDocument();

    await user.click(within(choices[0]).getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Save field maps" }));

    expect(save).toHaveBeenCalledWith({ expectedVersion: 4, affectedFields: [{ fieldSurveyId: 202 }] });
    expect(await screen.findByText("Field maps saved.")).toBeInTheDocument();
  });

  it("lets the reviewer remove a confirmed map from this case only", async () => {
    const user = userEvent.setup();
    const confirmed = linkedField(123, nearPlot);
    const save = vi.fn().mockResolvedValue({ affectedFields: [], version: 5, updatedAt: "2026-10-04T04:00:00.000Z" });
    vi.mocked(useUpdateReportAffectedFields).mockReturnValue(mutation({ mutateAsync: save }));

    renderLinkage(report({ affectedFields: [confirmed] }));
    await user.click(screen.getByRole("button", { name: "Remove from case" }));

    expect(save).toHaveBeenCalledWith({ expectedVersion: 4, affectedFields: [] });
    expect(await screen.findByText("Field map removed.")).toBeInTheDocument();
    expect(screen.getByText("No field map on this case yet.")).toBeInTheDocument();
  });

  it("shows the name the inspector typed and where a reused outline came from", () => {
    renderLinkage(report({
      affectedFields: [{ ...linkedField(123, nearPlot), label: "North lot", outlineFromSurveyId: 41 }],
    }));

    const card = screen.getByRole("article", { name: "Field map 123" });
    expect(within(card).getByRole("heading", { name: /North lot/ })).toBeInTheDocument();
    expect(within(card).getByText("Plot outline reused from Map 41")).toBeInTheDocument();
  });

  it("says plainly when no damage was drawn instead of showing 0%", () => {
    renderLinkage(report({ affectedFields: [linkedField(123, nearPlot, null)] }));

    const card = screen.getByRole("article", { name: "Field map 123" });
    expect(within(card).getAllByText("Not drawn")).toHaveLength(2);
    expect(within(card).queryByText("0%")).not.toBeInTheDocument();
  });

  it("explains a map that has not reached the office yet and offers no confirm", () => {
    renderLinkage(report({ inspectorAttachment: attachmentFor(null, { arrived: false }) }));

    expect(screen.getByText(/still on their phone/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm field" })).not.toBeInTheDocument();
    expect(screen.queryByText("No field map on this case yet.")).not.toBeInTheDocument();
  });

  it("offers a refresh when the case changed underneath the reviewer", async () => {
    const user = userEvent.setup();
    const attached = linkedField(123, nearPlot);
    const save = vi.fn().mockRejectedValue(new ApiError("conflict", { status: 409 }));
    const onRefresh = vi.fn().mockResolvedValue({ data: report({ reviewVersion: 6, affectedFields: [] }) });
    vi.mocked(useUpdateReportAffectedFields).mockReturnValue(mutation({
      mutateAsync: save,
      error: new ApiError("conflict", { status: 409 }),
      isError: true,
    }));

    renderLinkage(report({ inspectorAttachment: attachmentFor(attached) }), onRefresh);
    await user.click(screen.getByRole("button", { name: "Confirm field" }));

    expect(screen.getByRole("alert")).toHaveTextContent("This case changed while the field map was being saved.");
    await user.click(screen.getByRole("button", { name: "Refresh case and discard changes" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
