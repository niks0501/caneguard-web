import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ReportAnalytics } from "../../domain/dashboard.types";
import { isRisingTrend } from "../../data/mock/mockConditionTrends";
import { MockDashboardRepository } from "../../data/mock/MockDashboardRepository";
import { ANALYTICS_FORBIDDEN_WORDS } from "./analyticsCopy";
import { risingRuleLine } from "./chartCopy";
import { ConditionTrends } from "./ConditionTrends";
import { quietGroup, quietTrends } from "./trendsFixture";

const labels = ["2026-09-01", "2026-09-02", "2026-09-03"];

function withTrends(overrides: Partial<ReportAnalytics>): ReportAnalytics {
  return { ...quietTrends, ...overrides } as ReportAnalytics;
}

const rustRising = {
  condition: "rust",
  total: 4,
  previousTotal: 1,
  rising: true,
  series: [
    { label: labels[0], count: 1 },
    { label: labels[1], count: 0 },
    { label: labels[2], count: 3 },
  ],
};
const smutSteady = { ...rustRising, condition: "smut", total: 2, previousTotal: 2, rising: false };

describe("ConditionTrends", () => {
  const analytics = withTrends({
    seriesByCondition: {
      staffClassification: {
        ...quietGroup(["mosaic", "rssi"], labels),
        conditions: [rustRising, smutSteady],
      },
      possibleCondition: quietGroup(["healthy", "mosaic", "rust", "smut"], labels),
    },
    seriesByBarangay: {
      topN: 5,
      rows: [
        { barangay: "Bucana", total: 6, previousTotal: 2, delta: 4, rising: true },
        { barangay: "Aga", total: 2, previousTotal: 3, delta: -1, rising: false },
      ],
    },
  });

  it("marks only the condition the API flags as rising, in text", () => {
    render(<ConditionTrends analytics={analytics} scopeLabel="1 Sep – 3 Sep 2026" />);
    const staff = screen.getByRole("img", { name: /Staff classification over time/ });
    const rust = within(staff).getByText("Sugarcane Rust").closest("li") as HTMLElement;
    const smut = within(staff).getByText("Sugarcane Smut").closest("li") as HTMLElement;
    expect(within(rust).getByText("Rising")).toBeInTheDocument();
    expect(within(smut).queryByText("Rising")).toBeNull();
    expect(within(rust).getByText("was 1")).toBeInTheDocument();
  });

  it("prints the rule from the API payload and leads with staff classification", () => {
    render(<ConditionTrends analytics={analytics} scopeLabel="1 Sep – 3 Sep 2026" />);
    expect(
      screen.getByText("Rising: at least 2× the previous period and at least 3 reports."),
    ).toBeInTheDocument();
    expect(risingRuleLine({ ratio: 3, minCases: 5 })).toBe(
      "Rising: at least 3× the previous period and at least 5 reports.",
    );
    const headings = screen.getAllByRole("heading", { level: 3 }).map((node) => node.textContent);
    expect(headings.slice(0, 2)).toEqual([
      "Staff classification over time",
      "Possible Condition (AI) over time",
    ]);
  });

  it("lists top barangays with signed deltas and a rising marker", () => {
    render(<ConditionTrends analytics={analytics} scopeLabel="1 Sep – 3 Sep 2026" />);
    const table = screen.getByRole("table", { name: "" });
    const bucana = within(table).getByRole("row", { name: /Bucana/ });
    expect(within(bucana).getByText("+4")).toBeInTheDocument();
    expect(within(bucana).getByText("Rising")).toBeInTheDocument();
    const aga = within(table).getByRole("row", { name: /Aga/ });
    expect(within(aga).getByText("−1")).toBeInTheDocument();
    expect(within(aga).queryByText("Rising")).toBeNull();
  });

  it("says so when nothing is classified, and when there are no barangays", () => {
    render(<ConditionTrends analytics={withTrends({})} scopeLabel="1 Sep – 3 Sep 2026" />);
    expect(screen.getByText("No staff-classified reports in this period.")).toBeInTheDocument();
    expect(screen.getByText("No reports with a barangay in this period.")).toBeInTheDocument();
  });

  it("keeps clear of the forbidden analytics vocabulary", () => {
    const { container } = render(
      <ConditionTrends analytics={analytics} scopeLabel="1 Sep – 3 Sep 2026" />,
    );
    const text = (container.textContent ?? "").toLowerCase();
    for (const word of ANALYTICS_FORBIDDEN_WORDS) {
      expect(text).not.toContain(word.toLowerCase());
    }
  });
});

describe("rising rule", () => {
  it("needs at least double the previous period and at least three cases", () => {
    expect(isRisingTrend(3, 1)).toBe(true);
    expect(isRisingTrend(3, 0)).toBe(true);
    expect(isRisingTrend(6, 3)).toBe(true);
    expect(isRisingTrend(2, 0)).toBe(false);
    expect(isRisingTrend(5, 3)).toBe(false);
    expect(isRisingTrend(0, 0)).toBe(false);
  });
});

describe("mock trends payload", () => {
  it("sums each group's series to the total series, bucket by bucket", async () => {
    const data = await new MockDashboardRepository().getAnalytics({
      from: "2026-01-01",
      to: "2026-12-31",
      granularity: "week",
    });
    const totals = Object.fromEntries(data.series.map((point) => [point.label, point.count]));
    for (const group of [
      data.seriesByCondition.staffClassification,
      data.seriesByCondition.possibleCondition,
    ]) {
      const sums: Record<string, number> = {};
      for (const trend of [...group.conditions, group.unclassified]) {
        for (const point of trend.series) sums[point.label] = (sums[point.label] ?? 0) + point.count;
      }
      expect(sums).toEqual(totals);
    }
    expect(data.seriesByBarangay.rows.length).toBeLessThanOrEqual(data.seriesByBarangay.topN);
  });
});
