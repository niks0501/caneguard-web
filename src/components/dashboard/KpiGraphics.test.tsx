import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RadialMeter } from "./RadialMeter";
import { SegmentedBar } from "./SegmentedBar";
import { StatusChip } from "./StatusChip";
import { metricSegmentName } from "./metricSegments";

describe("KPI graphics", () => {
  it("names every segment of a bar in text, so the split never rests on colour", () => {
    const { container } = render(
      <SegmentedBar
        label="Waiting age"
        segments={[
          { label: "0–2 days waiting", count: 1 },
          { label: "3–6 days waiting", count: 2 },
        ]}
      />,
    );

    expect(
      screen.getByRole("img", {
        name: "Waiting age: 0–2 days waiting 1, 3–6 days waiting 2",
      }),
    ).toBeInTheDocument();
    const segments = container.querySelectorAll(".kpi-bar__segment");
    expect(segments).toHaveLength(2);
    // Proportional widths come from counts; the tones differ per slice.
    expect((segments[0] as HTMLElement).style.flexGrow).toBe("1");
    expect((segments[1] as HTMLElement).style.flexGrow).toBe("2");
    expect(segments[0]).toHaveClass("kpi-bar__segment--0");
    expect(segments[1]).toHaveClass("kpi-bar__segment--1");
  });

  it("keeps a zero-count bar proportional instead of dividing by zero", () => {
    const { container } = render(
      <SegmentedBar
        label="Field-validation schedule"
        segments={[
          { label: "Past target date", count: 0 },
          { label: "Scheduled ahead", count: 0 },
        ]}
      />,
    );

    const segments = Array.from(container.querySelectorAll(".kpi-bar__segment"));
    expect(segments).toHaveLength(2);
    for (const segment of segments) {
      // Equal shares, never "0" or "NaN".
      expect((segment as HTMLElement).style.flexGrow).toBe("1");
    }
  });

  it("draws one radial slice per segment with an accessible name", () => {
    const { container } = render(
      <RadialMeter
        label="Waiting age"
        segments={[
          { label: "0–2 days waiting", count: 1 },
          { label: "3–6 days waiting", count: 2 },
        ]}
      />,
    );

    expect(
      screen.getByRole("img", {
        name: "Waiting age: 0–2 days waiting 1, 3–6 days waiting 2",
      }),
    ).toBeInTheDocument();
    const slices = container.querySelectorAll(".kpi-radial__slice");
    expect(slices).toHaveLength(2);
    // The larger slice gets the longer arc and starts after the first one.
    const first = Number(
      (slices[0].getAttribute("stroke-dasharray") ?? "").split(" ")[0],
    );
    const second = Number(
      (slices[1].getAttribute("stroke-dasharray") ?? "").split(" ")[0],
    );
    expect(second).toBeCloseTo(first * 2, 5);
    expect(slices[0].getAttribute("stroke-dashoffset")).toBe("0");
    expect(Number(slices[1].getAttribute("stroke-dashoffset"))).toBeCloseTo(
      -first,
      5,
    );
  });

  it("renders no radial slice for an empty split", () => {
    const { container } = render(<RadialMeter label="Waiting age" segments={[]} />);

    expect(container.querySelectorAll(".kpi-radial__slice")).toHaveLength(0);
    expect(
      screen.getByRole("img", { name: "Waiting age: nothing recorded" }),
    ).toBeInTheDocument();
  });

  it("states an icon-led chip as one named graphic", () => {
    render(
      <StatusChip
        icon={<span data-testid="chip-icon" />}
        text="No field visit assigned"
        name="No field-validation visit is assigned to these reports"
      />,
    );

    const chip = screen.getByRole("img", {
      name: "No field-validation visit is assigned to these reports",
    });
    expect(chip).toHaveTextContent("No field visit assigned");
    expect(chip).toContainHTML("chip-icon");
  });

  it("falls back to a plain sentence for an empty segment list", () => {
    expect(metricSegmentName("Waiting age", [])).toBe(
      "Waiting age: nothing recorded",
    );
  });
});
