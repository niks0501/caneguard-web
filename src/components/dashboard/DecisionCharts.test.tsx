import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BarangayValidationBars } from "./BarangayValidationBars";
import { ConcernVsConditionBars } from "./ConcernVsConditionBars";
import { InflowComparisonBars } from "./InflowComparisonBars";
import { ReportLocationMap } from "./ReportLocationMap";
import { ANALYTICS_FORBIDDEN_WORDS } from "./analyticsCopy";
import { dashboardChartCopy } from "./chartCopy";
import { useFieldValidationMap } from "../../hooks/useFieldValidation";
import type { ReportAnalytics } from "../../domain/dashboard.types";

vi.mock("../../hooks/useFieldValidation", () => ({
  useFieldValidationMap: vi.fn(),
}));

// jsdom has no layout: give Recharts a fixed canvas so SVG-level
// assertions (patterns, printed values) actually render.
vi.stubGlobal(
  "ResizeObserver",
  class {
    private callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe() {
      this.callback(
        [{ contentRect: { width: 600, height: 300 } } as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    }
    unobserve() {}
    disconnect() {}
  },
);

const analytics = {
  period: {
    from: "2026-09-01",
    to: "2026-09-24",
    granularity: "day",
    label: "1–24 Sep 2026",
    timezone: "Asia/Manila",
    timezoneLabel: "PHT (UTC+8)",
    days: 24,
    partial: false,
  },
  totalSubmitted: 12,
  series: [
    { label: "2026-09-01", count: 5 },
    { label: "2026-09-02", count: 7 },
  ],
  comparison: {
    previousFrom: "2026-08-08",
    previousTo: "2026-08-31",
    previousTotal: 9,
    currentTotal: 12,
    delta: 3,
  },
  reportedConcern: [
    { concern: "RSSI", label: "RSSI", count: 4, share: 0.3333 },
    { concern: "smut", label: "Smut", count: 1, share: 0.0833 },
    { concern: "mosaic", label: "Mosaic", count: 3, share: 0.25 },
    { concern: "rust", label: "Rust", count: 2, share: 0.1667 },
    { concern: "other", label: "Other reported", count: 1, share: 0.0833 },
    { concern: "not_stated", label: "Not stated", count: 1, share: 0.0833 },
  ],
  possibleCondition: [
    { condition: "healthy", count: 2 },
    { condition: "mosaic", count: 6 },
    { condition: "rust", count: 4 },
  ],
  verificationOutcome: {
    not_determined: 7,
    verified: 3,
    unable_to_verify: 2,
  },
  validationByBarangay: [
    {
      barangay: "Balaytigui",
      submitted: 8,
      open: 5,
      pastTargetDate: 2,
      scheduled: 2,
      unscheduled: 1,
    },
    {
      barangay: "Bucana",
      submitted: 4,
      open: 2,
      pastTargetDate: 0,
      scheduled: 1,
      unscheduled: 1,
    },
  ],
  barangayScope: {
    municipality: "Nasugbu",
    province: "Batangas",
    barangays: ["Balaytigui", "Bucana"],
  },
} as unknown as ReportAnalytics;

const scopeLabel = "1–24 Sep 2026";

function renderWithRouter(children: React.ReactNode) {
  return render(<MemoryRouter>{children}</MemoryRouter>);
}

beforeEach(() => {
  vi.mocked(useFieldValidationMap).mockReturnValue({
    data: undefined,
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof useFieldValidationMap>);
});

describe("InflowComparisonBars", () => {
  it("pairs this period against the previous window with both windows printed", () => {
    const { container } = renderWithRouter(
      <InflowComparisonBars
        analytics={analytics}
        previousSeries={[
          { label: "2026-09-01", count: 4 },
          { label: "2026-09-02", count: 5 },
        ]}
        scopeLabel={scopeLabel}
      />,
    );

    expect(screen.getByText("Inflow: this period vs the previous period")).toBeInTheDocument();
    expect(
      container.querySelector(".decision-chart-card__period"),
    ).toHaveTextContent("1–24 Sep 2026 vs 8–31 Aug 2026");
    // Series meaning never depends on colour alone: names and totals print.
    expect(screen.getByText(/This period \(12\)/)).toBeInTheDocument();
    expect(screen.getByText(/Previous period \(9\)/)).toBeInTheDocument();
    expect(
      container.querySelector("pattern#pattern-inflow-previous"),
    ).not.toBeNull();

    const table = screen.getByRole("table");
    expect(within(table).getByText("2026-09-01")).toBeInTheDocument();
    const rows = within(table).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("5");
    expect(rows[1]).toHaveTextContent("4");
  });
});

describe("ConcernVsConditionBars", () => {
  it("keeps the two vocabularies side by side without merging them", () => {
    const { container } = renderWithRouter(
      <ConcernVsConditionBars analytics={analytics} scopeLabel={scopeLabel} />,
    );

    expect(
      screen.getByText("Reported concern vs Possible Condition"),
    ).toBeInTheDocument();
    expect(screen.getByText(/what the reporter observed/)).toBeInTheDocument();
    // Every reported row is prefixed; RSSI appears only there.
    const table = screen.getByRole("table");
    expect(within(table).getByText("Reported: RSSI")).toBeInTheDocument();
    expect(within(table).getByText("Reported: Mosaic")).toBeInTheDocument();
    expect(within(table).getByText("Possible: Mosaic")).toBeInTheDocument();
    expect(within(table).queryByText("Possible: RSSI")).not.toBeInTheDocument();
    expect(within(table).queryByText("Possible: Smut")).not.toBeInTheDocument();
    // The axis labels carry the same prefixed names on the marks themselves.
    const axisText = [...container.querySelectorAll("svg text")]
      .map((node) => node.textContent ?? "")
      .join(" ");
    expect(axisText).toContain("Reported: RSSI");
    expect(axisText).toContain("Possible: Rust");
    expect(axisText).not.toContain("Possible: RSSI");
    // Pattern fills back every series for non-colour separation.
    for (const id of [
      "pattern-reported-rssi",
      "pattern-reported-mosaic",
      "pattern-possible-mosaic",
      "pattern-possible-healthy",
    ]) {
      expect(container.querySelector(`pattern#${id}`)).not.toBeNull();
    }

    // The verification strip closes the card with staff outcomes.
    const strip = screen.getByRole("list", { name: "Staff verification so far" });
    expect(within(strip).getByText("Verified by staff")).toBeInTheDocument();
    expect(within(strip).getByText("Unable to verify")).toBeInTheDocument();
    expect(within(strip).getByText("Not yet determined")).toBeInTheDocument();

    // Reported totals reconcile with the scoped count: nothing dropped.
    const reportedSum = analytics.reportedConcern.reduce(
      (sum, item) => sum + item.count,
      0,
    );
    expect(reportedSum).toBe(analytics.totalSubmitted);
    expect(within(table).getByText("Reported: Other reported")).toBeInTheDocument();
    expect(within(table).getByText("Reported: Not stated")).toBeInTheDocument();
  });

  it("states the quiet-scope empty case instead of an empty frame", () => {
    renderWithRouter(
      <ConcernVsConditionBars
        analytics={{ ...analytics, totalSubmitted: 0 } as ReportAnalytics}
        scopeLabel={scopeLabel}
      />,
    );
    expect(
      screen.getByText("No submitted reports in this period."),
    ).toBeInTheDocument();
  });
});

describe("BarangayValidationBars", () => {
  it("stacks the validation split on the submitted baseline per barangay", () => {
    const { container } = renderWithRouter(
      <BarangayValidationBars analytics={analytics} scopeLabel={scopeLabel} />,
    );

    expect(
      screen.getByText("Validation attention by barangay"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Barangay first/)).toBeInTheDocument();
    const c3Table = screen.getByRole("table");
    expect(within(c3Table).getByText("Past target date")).toBeInTheDocument();
    expect(
      container.querySelector("pattern#pattern-barangay-past"),
    ).not.toBeNull();

    const body = within(c3Table).getAllByRole("row").slice(1);
    expect(body[0]).toHaveTextContent("Balaytigui");
    expect(body[0]).toHaveTextContent("8");
    expect(body[0]).toHaveTextContent("2");
    // Segments reconcile with the open count per barangay.
    for (const row of analytics.validationByBarangay) {
      expect(row.pastTargetDate + row.scheduled + row.unscheduled).toBe(row.open);
    }
  });
});

describe("ReportLocationMap", () => {
  it("defaults to barangay circles with a real link list beside the map", async () => {
    const user = userEvent.setup();
    renderWithRouter(
      <ReportLocationMap
        rows={analytics.validationByBarangay}
        scopeLabel={scopeLabel}
        from="2026-09-01"
        to="2026-09-24"
      />,
    );

    expect(screen.getByText("Field-report locations — Nasugbu")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Barangay circles" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("link", { name: /Balaytigui 8 submitted/ }),
    ).toHaveAttribute("href", "/reports?barangay=Balaytigui");

    await user.click(screen.getByRole("button", { name: "GPS points" }));
    expect(
      screen.getByRole("button", { name: "GPS points" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByText(/GPS points are indicative/),
    ).toBeInTheDocument();
  });
});

describe("decision chart copy discipline", () => {
  it("never uses forbidden analytics vocabulary in the new chart copy", () => {
    const { container } = renderWithRouter(
      <>
        <InflowComparisonBars
          analytics={analytics}
          previousSeries={[]}
          scopeLabel={scopeLabel}
        />
        <ConcernVsConditionBars analytics={analytics} scopeLabel={scopeLabel} />
        <BarangayValidationBars analytics={analytics} scopeLabel={scopeLabel} />
      </>,
    );

    const copy =
      (container.textContent ?? "") + Object.values(dashboardChartCopy)
        .map((entry) => Object.values(entry).join(" "))
        .join(" ");
    for (const word of ANALYTICS_FORBIDDEN_WORDS) {
      expect(copy.toLowerCase()).not.toContain(word.toLowerCase());
    }
    // The one named exception: the KPI segment wording the plan allows
    // while "overdue" itself stays forbidden.
    expect(copy).toContain("Past target date");
    expect(copy.toLowerCase()).not.toContain("overdue");
  });
});
