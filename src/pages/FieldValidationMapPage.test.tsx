import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/ApiError";
import { ZodError } from "zod";
import type { FieldValidationMapData, FieldValidationMapFeature } from "../domain/fieldValidation.types";
import { useFieldValidationMap } from "../hooks/useFieldValidation";
import { FieldValidationMapPage } from "./FieldValidationMapPage";

vi.mock("../hooks/useFieldValidation", () => ({
  useFieldValidationMap: vi.fn(),
}));

// The page controls disclosure/rendering; only the provider boundary is replaced.
vi.mock("../components/fieldValidation/ValidationMap", () => ({
  ValidationMap: ({ data, selection, onSelect, onClearSelection }: {
    data: FieldValidationMapData;
    selection: { kind: string } | null;
    onSelect: (selection: { kind: "case"; caseUuid: string; coordinates: [number, number] } | { kind: "cluster"; clusterKeys: string[]; coordinates: [number, number] }) => void;
    onClearSelection: () => void;
  }) => (
    <div role="region" aria-label="Map provider boundary">
      {data.features.map((feature) => (
        <button
          key={feature.properties.uuid}
          type="button"
          onClick={() => onSelect({ kind: "case", caseUuid: feature.properties.uuid, coordinates: feature.geometry.coordinates })}
        >
          Select {feature.properties.referenceCode}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onSelect({
          kind: "cluster",
          clusterKeys: data.features.map((feature) => feature.properties.locationGroupKey ?? feature.properties.uuid),
          coordinates: [120.6, 14.1],
        })}
      >
        Select cluster
      </button>
      <button type="button" onClick={onClearSelection}>Clear selection</button>
      <output data-testid="selection-kind">{selection?.kind ?? "none"}</output>
    </div>
  ),
}));

function feature(uuid: string, referenceCode: string, overrides: Partial<FieldValidationMapFeature["properties"]> = {}): FieldValidationMapFeature {
  return {
    type: "Feature",
    id: uuid,
    geometry: { type: "Point", coordinates: [120.6039, 14.126] },
    properties: {
      uuid,
      locationGroupKey: uuid,
      referenceCode,
      barangay: "Balaytigui",
      province: "Batangas",
      municipality: "Nasugbu",
      farmReference: "Block MBN-14",
      observedAt: "2026-08-13T10:20:30.000Z",
      submittedAt: "2026-08-13T11:00:00.000Z",
      predictedDisease: "rust",
      confidence: 0.84,
      reviewStatus: "for_field_validation",
      lifecycle: { caseState: "open", verificationOutcome: "not_determined", fieldValidationState: "assigned", referralState: "not_referred" },
      locationSource: "gps",
      gpsAccuracy: 8.5,
      affectedAreaHectares: 2.5,
      affectedPortionPercent: 18,
      ...overrides,
    },
  };
}

const mapData: FieldValidationMapData = {
  type: "FeatureCollection",
  features: [
    feature("report-1", "CG-2026-0001"),
    feature("report-2", "CG-2026-0002", { locationGroupKey: "report-1", referenceCode: "CG-2026-0002" }),
  ],
  metadata: {
    totalCount: 12,
    locatedCount: 2,
    unlocatedCount: 4,
    needVisitCount: 7,
    overdueCount: 3,
    limit: 1000,
    returnedCount: 2,
    truncated: false,
  },
};

function queryResult(data: unknown, overrides: Record<string, unknown> = {}) {
  return {
    data,
    error: null,
    isError: false,
    isFetching: false,
    isPending: false,
    isRefetchError: false,
    isPlaceholderData: false,
    refetch: vi.fn(),
    ...overrides,
  } as never;
}

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}{useLocation().search}</output>;
}

function renderPage(initialEntry = "/monitoring?view=map") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <FieldValidationMapPage />
      <LocationProbe />
    </MemoryRouter>,
  );
}

function summaryButton(name: string) {
  return screen.getByRole("button", { name: new RegExp(name) });
}

beforeEach(() => {
  vi.mocked(useFieldValidationMap).mockReturnValue(queryResult(mapData));
});

describe("FieldValidationMapPage structure and summary", () => {
  it("presents the map immediately without an expand action and without an empty sidebar", () => {
    renderPage();
    const map = screen.getByRole("region", { name: "Map provider boundary" });
    expect(map).toBeInTheDocument();
    const disclosure = map.closest("details");
    if (disclosure) expect(disclosure).toHaveAttribute("open");
    expect(screen.queryByRole("heading", { name: "Case Details" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Cases in this Area" })).not.toBeInTheDocument();
  });

  it("exposes four filtered summary metrics that describe the filtered scope", () => {
    renderPage();
    expect(summaryButton("Matching active reports")).toHaveTextContent("12");
    expect(summaryButton("Reports needing visit")).toHaveTextContent("7");
    expect(summaryButton("Reports past target date")).toHaveTextContent("3");
    expect(summaryButton("Reports without location")).toHaveTextContent("4");
  });

  it("drops the active qualifier once a case status is selected", () => {
    renderPage("/monitoring?view=map&status=resolved");

    expect(summaryButton("Matching reports")).toHaveTextContent("12");
    expect(
      screen.queryByRole("button", { name: /Matching active reports/ }),
    ).not.toBeInTheDocument();
  });

  it("never reports unknown map counts as zero", () => {
    vi.mocked(useFieldValidationMap).mockReturnValue(
      queryResult(undefined, { isPending: true }),
    );
    const { unmount } = renderPage();

    expect(summaryButton("Matching active reports")).toHaveTextContent("—");
    expect(summaryButton("Reports past target date")).toHaveTextContent("—");
    expect(summaryButton("Matching active reports")).not.toHaveTextContent("0");
    unmount();

    vi.mocked(useFieldValidationMap).mockReturnValue(
      queryResult(undefined, {
        error: new Error("Network unavailable"),
        isError: true,
        refetch: vi.fn(),
      }),
    );
    renderPage();

    expect(summaryButton("Matching active reports")).toHaveTextContent("Unavailable");
    expect(summaryButton("Reports needing visit")).toHaveTextContent("Unavailable");
  });

  it("gives staff a recovery step instead of developer instructions when the API is unreachable", () => {
    vi.mocked(useFieldValidationMap).mockReturnValue(
      queryResult(undefined, {
        error: { isAxiosError: true, code: "ERR_NETWORK", response: undefined, config: {}, isApiConnectionError: true },
        isError: true,
        refetch: vi.fn(),
      }),
    );
    renderPage();

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("CaneGuard cannot be reached right now");
    expect(alert).not.toHaveTextContent("VITE_API_BASE_URL");
    expect(alert).not.toHaveTextContent("Start the API server");
    expect(within(alert).getByText("Technical details")).toBeInTheDocument();
  });

  it("applies a reduced primary filter set with a known Barangay choice and recalculates the scope", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.getByLabelText("Barangay")).toBeInTheDocument();
    expect(screen.getByLabelText("Case Status")).toBeInTheDocument();
    expect(screen.getByLabelText("Date Observed from")).toBeInTheDocument();
    expect(screen.getByLabelText("Date Observed to")).toBeInTheDocument();

    const datalist = document.getElementById("known-barangays") as HTMLDataListElement;
    expect([...datalist.options].map((option) => option.value)).toContain("Balaytigui");

    await user.type(screen.getByLabelText("Barangay"), "Balaytigui");
    await user.selectOptions(screen.getByLabelText("Case Status"), "for_field_validation");
    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    expect(useFieldValidationMap).toHaveBeenLastCalledWith(
      expect.objectContaining({ barangay: "Balaytigui", status: "for_field_validation" }),
      { enabled: true },
    );
    expect(screen.getByTestId("location")).toHaveTextContent("barangay=Balaytigui");
    expect(screen.getByTestId("location")).toHaveTextContent("status=for_field_validation");
  });

  it("narrows to Need Visit and Overdue without silently clearing unrelated manual filters", async () => {
    const user = userEvent.setup();
    renderPage("/monitoring?view=map&barangay=Balaytigui");
    await user.click(summaryButton("Reports needing visit"));
    expect(useFieldValidationMap).toHaveBeenLastCalledWith(
      expect.objectContaining({ queue: "needs_visit", barangay: "Balaytigui" }),
      { enabled: true },
    );
    await user.click(summaryButton("Reports past target date"));
    expect(useFieldValidationMap).toHaveBeenLastCalledWith(
      expect.objectContaining({ queue: "follow_up_due", barangay: "Balaytigui" }),
      { enabled: true },
    );
    await user.click(summaryButton("Matching active reports"));
    expect(useFieldValidationMap).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ queue: expect.anything() }),
      { enabled: true },
    );
  });

  it("hands No Location to the normal case list filtered to matching unlocated reports", async () => {
    const user = userEvent.setup();
    renderPage("/monitoring?view=map&barangay=Balaytigui");
    await user.click(summaryButton("Reports without location"));
    expect(screen.getByTestId("location")).toHaveTextContent("/reports?");
    expect(screen.getByTestId("location")).toHaveTextContent("location=unlocated");
  });

  it("carries the Overdue queue into the register and no-location list", async () => {
    const user = userEvent.setup();
    renderPage("/monitoring?view=map&barangay=Bucay&queue=follow_up_due");
    await user.click(summaryButton("Reports without location"));
    expect(screen.getByTestId("location")).toHaveTextContent("/reports?");
    expect(screen.getByTestId("location")).toHaveTextContent("queue=follow_up_due");
    expect(screen.getByTestId("location")).toHaveTextContent("barangay=Bucay");
    expect(screen.getByTestId("location")).toHaveTextContent("location=unlocated");

    const withoutLocation = screen.getByRole("link", { name: "Open Reports Without Location" });
    expect(withoutLocation).toHaveAttribute("href", expect.stringContaining("queue=follow_up_due"));
    const allCases = screen.getByRole("link", { name: "View all cases" });
    expect(allCases).toHaveAttribute("href", expect.stringContaining("queue=follow_up_due"));
    expect(allCases.getAttribute("href")).not.toContain("location=");
  });

  it("keeps the full case list secondary to the map", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Cases that cannot be plotted" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View all cases" })).toHaveAttribute("href", "/reports");
    expect(screen.getByRole("link", { name: "Open Reports Without Location" })).toHaveAttribute(
      "href",
      expect.stringContaining("location=unlocated"),
    );
  });
});

describe("FieldValidationMapPage selection workflows", () => {
  it("opens Case Details for one selected case with the required context and actions", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "Select CG-2026-0001" }));

    const sidebar = screen.getByRole("heading", { name: "Case Details" }).closest("aside") as HTMLElement;
    expect(within(sidebar).getAllByText("CG-2026-0001").length).toBeGreaterThan(0);
    expect(within(sidebar).getAllByText(/Balaytigui/).length).toBeGreaterThan(0);
    expect(within(sidebar).getByText("Rust")).toBeInTheDocument();
    expect(within(sidebar).getByText(/decision support, not a confirmed diagnosis/i)).toBeInTheDocument();
    expect(within(sidebar).getByText("Assigned")).toBeInTheDocument();
    expect(within(sidebar).getByRole("link", { name: "Open Case" })).toHaveAttribute("href", "/reports/report-1");
    expect(within(sidebar).getByRole("link", { name: "Plan Visit" })).toHaveAttribute(
      "href",
      "/monitoring?view=field-operations&report=report-1",
    );
  });

  it("opens Cases in this Area with every report represented by the selected cluster", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "Select cluster" }));

    const sidebar = screen.getByRole("heading", { name: "Cases in this Area" }).closest("aside") as HTMLElement;
    expect(within(sidebar).getAllByText("CG-2026-0001").length).toBeGreaterThan(0);
    expect(within(sidebar).getAllByText("CG-2026-0002").length).toBeGreaterThan(0);
    expect(within(sidebar).getByText(/not evidence of spread, severity, or a confirmed disease relationship/i)).toBeInTheDocument();
  });

  it("moves from a cluster queue entry into focused Case Details and back to the still-valid queue", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "Select cluster" }));
    const queue = screen.getByRole("heading", { name: "Cases in this Area" }).closest("aside") as HTMLElement;
    await user.click(within(queue).getAllByRole("button", { name: /CG-2026-0002/ })[0]);

    expect(screen.getByRole("heading", { name: "Case Details" })).toBeInTheDocument();
    expect(screen.getAllByText("CG-2026-0002").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /Return to Cases in this Area/ }));
    expect(screen.getByRole("heading", { name: "Cases in this Area" })).toBeInTheDocument();
  });

  it("preserves a stable deep link to a focused case", async () => {
    renderPage("/monitoring?view=map&report=report-2");
    expect(screen.getByRole("heading", { name: "Case Details" })).toBeInTheDocument();
    expect(screen.getAllByText("CG-2026-0002").length).toBeGreaterThan(0);
  });
});

describe("FieldValidationMapPage reliability states", () => {
  it("distinguishes a basemap or transport failure from an empty result and offers retry", () => {
    vi.mocked(useFieldValidationMap).mockReturnValue(queryResult(undefined, {
      error: new ApiError("Unavailable", { status: 503 }),
      isError: true,
    }));
    renderPage();
    expect(screen.getByText(/Monitoring Map is unavailable/i)).toBeInTheDocument();
    expect(screen.queryByText(/No matching cases/i)).not.toBeInTheDocument();
  });

  it("distinguishes authorization denial from an empty result and never renders cached data", () => {
    vi.mocked(useFieldValidationMap).mockReturnValue(queryResult(mapData, {
      error: new ApiError("Forbidden", { status: 403 }),
      isError: true,
      isRefetchError: true,
    }));
    renderPage();
    expect(screen.getByText(/does not have access to the Monitoring Map/i)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Map provider boundary" })).not.toBeInTheDocument();
  });

  it("shows retained data as stale after a failed refresh rather than silently current", () => {
    vi.mocked(useFieldValidationMap).mockReturnValue(queryResult(mapData, {
      error: new ApiError("Unavailable", { status: 503 }),
      isError: true,
      isRefetchError: true,
    }));
    renderPage();
    expect(screen.getByRole("alert")).toHaveTextContent(/most recently loaded map is still shown and may be stale/i);
    expect(screen.getByRole("region", { name: "Map provider boundary" })).toBeInTheDocument();
  });

  it("reports malformed map data without presenting it as no cases", () => {
    vi.mocked(useFieldValidationMap).mockReturnValue(queryResult(undefined, {
      error: new ZodError([]),
      isError: true,
    }));
    renderPage();
    expect(screen.getByText(/unexpected Map format/i)).toBeInTheDocument();
  });

  it("distinguishes no matching cases from matching cases with no located coordinates", () => {
    vi.mocked(useFieldValidationMap).mockReturnValue(queryResult({
      type: "FeatureCollection",
      features: [],
      metadata: { totalCount: 0, locatedCount: 0, unlocatedCount: 0, needVisitCount: 0, overdueCount: 0, limit: 1000, returnedCount: 0, truncated: false },
    }));
    const { unmount } = renderPage();
    expect(screen.getByText("Every matching case has a usable coordinate pair.")).toBeInTheDocument();
    unmount();

    vi.mocked(useFieldValidationMap).mockReturnValue(queryResult({
      type: "FeatureCollection",
      features: [],
      metadata: { totalCount: 3, locatedCount: 0, unlocatedCount: 3, needVisitCount: 1, overdueCount: 0, limit: 1000, returnedCount: 0, truncated: false },
    }));
    renderPage();
    expect(screen.getByText(/3 matching cases have no usable coordinate pair/i)).toBeInTheDocument();
  });
});
