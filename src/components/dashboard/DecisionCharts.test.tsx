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
// assertions (fills, printed values) actually render.
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
  it("aligns previous buckets by relative position rather than calendar label", () => {
    renderWithRouter(
      <InflowComparisonBars
        analytics={analytics}
        previousSeries={[
          { label: "2026-08-08", count: 3 },
          { label: "2026-08-09", count: 6 },
        ]}
        scopeLabel={scopeLabel}
      />,
    );
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent("2026-09-01");
    expect(rows[1]).toHaveTextContent("3");
    expect(rows[2]).toHaveTextContent("6");
  });

  it("uses equal relative week buckets from the API rather than ISO calendar keys", () => {
    renderWithRouter(
      <InflowComparisonBars
        analytics={{
          ...analytics,
          comparison: {
            ...analytics.comparison,
            currentSeries: [{ label: "2026-09-01", count: 5 }, { label: "2026-09-08", count: 7 }],
          },
        }}
        previousSeries={[{ label: "2026-08-18", count: 2 }, { label: "2026-08-25", count: 7 }]}
        scopeLabel={scopeLabel}
      />,
    );
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent("2026-09-01");
    expect(rows[1]).toHaveTextContent("2");
    expect(rows[2]).toHaveTextContent("7");
  });

  it("distinguishes a measured zero from unavailable comparison data", () => {
    renderWithRouter(
      <InflowComparisonBars
        analytics={{ ...analytics, comparison: { ...analytics.comparison, previousTotal: 0 } }}
        previousSeries={[{ label: "2026-08-08", count: 0 }, { label: "2026-08-09", count: 0 }]}
        scopeLabel={scopeLabel}
      />,
    );
    expect(screen.getByText("Previous period (0 reports)")).toBeInTheDocument();
    expect(screen.queryByText(/Previous period unavailable/)).not.toBeInTheDocument();
  });

  it("does not encode missing comparison data as zero", () => {
    renderWithRouter(
      <InflowComparisonBars analytics={analytics} scopeLabel={scopeLabel} />,
    );
    expect(screen.getByText(/Previous period unavailable/)).toBeInTheDocument();
    expect(screen.queryByText(/Previous period \(0\)/)).not.toBeInTheDocument();
    expect(screen.getByRole("table")).toHaveTextContent("Unavailable");
  });
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
    // The long description and the "what to do" takeaway are gone: the card
    // carries title, one period line and the marks.
    expect(container.querySelector(".decision-chart-card__description")).toBeNull();
    expect(container.querySelector(".decision-chart-card__takeaway")).toBeNull();
    expect(screen.queryByText(/says nothing about what comes next/)).not.toBeInTheDocument();
    // Series meaning never depends on colour alone: names and totals print.
    expect(
      screen.getByRole("img", {
        name: /12 reports submitted this period; 9 reports in the previous period/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/This period \(12 reports\)/)).toBeInTheDocument();
    expect(screen.getByText(/Previous period \(9 reports\)/)).toBeInTheDocument();
    // Both series are flat band solids: no pattern definition survives, no
    // mark paints a `url(#…)` reference, and the two legend swatches name the
    // same bands the bars use.
    expect(container.querySelectorAll("pattern")).toHaveLength(0);
    expect(container.querySelector("svg [fill^='url(']")).toBeNull();
    const inflowSwatches = Array.from(
      container.querySelectorAll(".decision-chart__swatch"),
    );
    expect(inflowSwatches).toHaveLength(2);
    expect(
      inflowSwatches.map((node) => node.getAttribute("data-series-band")),
    ).toEqual(["2", "1"]);
    expect(inflowSwatches[0]).toHaveClass("kpi-band-fill--2");
    expect(inflowSwatches[1]).toHaveClass("kpi-band-fill--1");

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
    // Explanatory hint copy is removed from visualization components.
    expect(
      screen.queryByText(/Reporter observation vs AI decision support/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/what the reporter observed/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Neither is a diagnosis/)).not.toBeInTheDocument();
    // Every reported row is prefixed; RSSI appears only there.
    const table = screen.getByRole("table");
    expect(within(table).getByText("Reported: RSSI")).toBeInTheDocument();
    expect(within(table).getByText("Reported: Mosaic")).toBeInTheDocument();
    expect(within(table).getByText("Possible: Mosaic")).toBeInTheDocument();
    expect(within(table).queryByText("Possible: RSSI")).not.toBeInTheDocument();
    expect(within(table).getByText("Possible: Smut")).toBeInTheDocument();
    // The axis labels carry the same prefixed names on the marks themselves.
    const axisText = [...container.querySelectorAll("svg text")]
      .map((node) => node.textContent ?? "")
      .join(" ");
    expect(axisText).toContain("Reported: RSSI");
    expect(axisText).toContain("Possible: Rust");
    expect(axisText).not.toContain("Possible: RSSI");
    // Solid fills back every series. No pattern definition and no `url(#…)`
    // paint reference may survive; separation rides on the shared four-step
    // band ramp plus the printed `Reported:` / `Possible:` row labels.
    expect(container.querySelectorAll("pattern")).toHaveLength(0);
    expect(container.querySelector("svg [fill^='url(']")).toBeNull();

    // The verification strip is a real legend: one flat solid mark per
    // outcome with its own accessible name, and the same rows in the card's
    // visually-hidden data table.
    const strip = screen.getByRole("list", { name: "Staff verification so far" });
    expect(strip).toHaveClass("decision-chart__legend--verification");
    expect(
      within(strip).getByRole("img", { name: "Verified by staff: 3 reports" }),
    ).toBeInTheDocument();
    expect(
      within(strip).getByRole("img", { name: "Unable to verify: 2 reports" }),
    ).toBeInTheDocument();
    expect(
      within(strip).getByRole("img", { name: "Not yet determined: 7 reports" }),
    ).toBeInTheDocument();
    // Solids, never colour alone: three flat band fills in ramp order, each
    // with its own printed label and count, and no texture anywhere.
    const outcomeSwatches = Array.from(
      strip.querySelectorAll(".decision-chart__swatch"),
    );
    expect(outcomeSwatches).toHaveLength(3);
    expect(
      outcomeSwatches.map((node) => node.getAttribute("data-series-band")),
    ).toEqual(["1", "2", "3"]);
    expect(outcomeSwatches[0]).toHaveClass("kpi-band-fill--1");
    expect(outcomeSwatches[1]).toHaveClass("kpi-band-fill--2");
    expect(outcomeSwatches[2]).toHaveClass("kpi-band-fill--3");
    expect(outcomeSwatches[0]).toHaveClass("decision-chart__swatch--verified");
    expect(outcomeSwatches[1]).toHaveClass("decision-chart__swatch--unable");
    expect(outcomeSwatches[2]).toHaveClass(
      "decision-chart__swatch--not-determined",
    );
    expect(strip.querySelector("pattern")).toBeNull();
    // Each category prints its label and count on one line.
    for (const [label, count] of [
      ["Verified by staff", "3"],
      ["Unable to verify", "2"],
      ["Not yet determined", "7"],
    ]) {
      expect(within(strip).getByText(label)).toBeInTheDocument();
      expect(
        within(strip).getByRole("img", { name: `${label}: ${count} reports` }),
      ).toHaveTextContent(count);
    }
    for (const [label, count] of [
      ["Verified by staff", "3"],
      ["Unable to verify", "2"],
      ["Not yet determined", "7"],
    ]) {
      const row = within(table)
        .getAllByRole("row")
        .find((candidate) =>
          candidate.textContent?.startsWith(`Staff verification: ${label}`),
        );
      expect(row).toBeDefined();
      expect(row).toHaveTextContent(count);
    }

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
    // Explanatory hint copy is removed from visualization components.
    expect(
      screen.queryByText(/Past target date uses the recorded target visit date/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Barangay first/)).not.toBeInTheDocument();
    expect(screen.queryByText(/policy deadline/)).not.toBeInTheDocument();
    const c3Table = screen.getByRole("table");
    expect(within(c3Table).getByText("Reports past target date")).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: /Balaytigui 8 reports submitted, 2 reports past target date/,
      }),
    ).toBeInTheDocument();
    // The baseline and the three stacked segments are four flat band solids,
    // and the legend swatches name the same bands in the same order.
    expect(container.querySelectorAll("pattern")).toHaveLength(0);
    expect(container.querySelector("svg [fill^='url(']")).toBeNull();
    const validationSwatches = Array.from(
      container.querySelectorAll(".decision-chart__swatch"),
    );
    expect(
      validationSwatches.map((node) => node.getAttribute("data-series-band")),
    ).toEqual(["1", "2", "3", "4"]);
    expect(validationSwatches[0]).toHaveClass("kpi-band-fill--1");
    expect(validationSwatches[1]).toHaveClass("kpi-band-fill--2");
    expect(validationSwatches[2]).toHaveClass("kpi-band-fill--3");
    expect(validationSwatches[3]).toHaveClass("kpi-band-fill--4");

    const body = within(c3Table).getAllByRole("row").slice(1);
    expect(body[0]).toHaveTextContent("Balaytigui");
    expect(body[0]).toHaveTextContent("8");
    expect(body[0]).toHaveTextContent("2");
    // Segments reconcile with the open count per barangay.
    for (const row of analytics.validationByBarangay) {
      expect(row.pastTargetDate + row.scheduled + row.unscheduled).toBe(row.open);
    }
  });

  it("prints single-report narrow rows with singular units", () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) as unknown as typeof window.matchMedia;
    try {
      renderWithRouter(
        <BarangayValidationBars
          analytics={{
            ...analytics,
            validationByBarangay: [
              {
                barangay: "Balaytigui",
                submitted: 1,
                open: 1,
                pastTargetDate: 1,
                scheduled: 0,
                unscheduled: 0,
              },
            ],
          } as ReportAnalytics}
          scopeLabel={scopeLabel}
        />,
      );

      expect(
        screen.getByText(
          "1 report submitted · 1 report past target date · 0 reports scheduled ahead · 0 reports unscheduled",
        ),
      ).toBeInTheDocument();
    } finally {
      window.matchMedia = originalMatchMedia;
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
      screen.getByRole("link", { name: /Balaytigui 8 reports submitted/ }),
    ).toHaveAttribute("href", "/reports?barangay=Balaytigui");

    await user.click(screen.getByRole("button", { name: "GPS points" }));
    expect(
      screen.getByRole("button", { name: "GPS points" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.queryByText(/GPS points are indicative/),
    ).not.toBeInTheDocument();
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
    expect(copy).toContain("Reports past target date");
    expect(copy.toLowerCase()).not.toContain("overdue");
  });
});

describe("dashboard solid fill discipline", () => {
  it("renders every decision chart without a pattern definition or paint reference", () => {
    // The decisive gate for the solids change: no matter how many charts mount
    // together, none of them may define a pattern or paint one through
    // `url(#…)`. Separation is the shared band ramp plus printed labels only.
    const { container } = renderWithRouter(
      <>
        <InflowComparisonBars
          analytics={analytics}
          previousSeries={[
            { label: "2026-09-01", count: 4 },
            { label: "2026-09-02", count: 5 },
          ]}
          scopeLabel={scopeLabel}
        />
        <ConcernVsConditionBars analytics={analytics} scopeLabel={scopeLabel} />
        <BarangayValidationBars analytics={analytics} scopeLabel={scopeLabel} />
      </>,
    );

    expect(container.querySelectorAll("pattern")).toHaveLength(0);
    expect(container.querySelector("[patternUnits]")).toBeNull();
    const marks = Array.from(
      container.querySelectorAll("svg [fill], svg [stroke]"),
    );
    expect(marks.length).toBeGreaterThan(0);
    for (const mark of marks) {
      expect(mark.getAttribute("fill") ?? "").not.toContain("url(");
      expect(mark.getAttribute("stroke") ?? "").not.toContain("url(");
    }

    // Every legend entry survives, and each swatch names a band from the ramp.
    const swatches = Array.from(
      container.querySelectorAll(".decision-chart__swatch"),
    );
    expect(swatches).toHaveLength(9);
    for (const swatch of swatches) {
      const band = swatch.getAttribute("data-series-band");
      expect(band).toMatch(/^[1-4]$/);
      expect(swatch).toHaveClass(`kpi-band-fill--${band}`);
    }
  });
});
