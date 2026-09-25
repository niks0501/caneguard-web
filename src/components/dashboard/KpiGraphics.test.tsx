import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RadialMeter, RADIAL_ARC_LENGTH, RADIAL_SLICE_GAP } from "./RadialMeter";
import { SegmentedBar } from "./SegmentedBar";
import { Sparkline } from "./Sparkline";
import { StatusIndicator } from "./StatusIndicator";
import { KPI_BANDS, kpiBandSignature } from "./kpiBandEncoding";
import { metricSegmentName } from "./metricSegments";

/** One attribute read from every node matching a selector. */
function attrValues(
  container: HTMLElement,
  selector: string,
  attribute: string,
): string[] {
  return Array.from(container.querySelectorAll(selector), (node) =>
    node.getAttribute(attribute) ?? "",
  );
}

describe("KPI graphics", () => {
  it("gives every band a distinct hatch signature, not one hatch at four opacities", () => {
    // The non-colour channel: four different tile shapes. A regression to a
    // single shape (or two) would leave the split colour-only.
    const signatures = KPI_BANDS.map((band) => kpiBandSignature(band));
    expect(new Set(signatures).size).toBe(KPI_BANDS.length);
    expect(new Set(KPI_BANDS.map((band) => band.band)).size).toBe(4);
    // Bands 1 and 3, and bands 2 and 4, are the pairs that are never
    // adjacent; they still differ in shape as well as in fill.
    expect(signatures[0]).not.toBe(signatures[2]);
    expect(signatures[1]).not.toBe(signatures[3]);
  });

  it("names every segment of a bar in text, so the split never rests on colour", () => {
    const { container } = render(
      <SegmentedBar
        label="Field-validation schedule"
        segments={[
          { label: "Past target date", count: 1 },
          { label: "Scheduled ahead", count: 2 },
        ]}
      />,
    );

    expect(
      screen.getByRole("img", {
        name: "Field-validation schedule: Past target date 1, Scheduled ahead 2",
      }),
    ).toBeInTheDocument();
    const segments = container.querySelectorAll(".kpi-bar__segment");
    expect(segments).toHaveLength(2);
    // Proportional widths come from counts.
    expect((segments[0] as HTMLElement).style.flexGrow).toBe("1");
    expect((segments[1] as HTMLElement).style.flexGrow).toBe("2");
    // Adjacent segments paint different band fills AND different patterns.
    expect(segments[0]).toHaveClass("kpi-band-fill--1");
    expect(segments[1]).toHaveClass("kpi-band-fill--2");
    expect(segments[0].getAttribute("data-kpi-band")).toBe("1");
    expect(segments[1].getAttribute("data-kpi-band")).toBe("2");
    expect(segments[0].getAttribute("data-kpi-pattern")).not.toBe(
      segments[1].getAttribute("data-kpi-pattern"),
    );
  });

  it("keeps a zero-count bar proportional instead of dividing by zero", () => {
    const { container } = render(
      <SegmentedBar
        label="Field-validation schedule"
        segments={[
          { label: "Past target date", count: 0 },
          { label: "Scheduled ahead", count: 0 },
          { label: "Unscheduled", count: 0 },
        ]}
      />,
    );

    const segments = Array.from(container.querySelectorAll(".kpi-bar__segment"));
    expect(segments).toHaveLength(3);
    for (const segment of segments) {
      // Equal shares, never "0" or "NaN".
      expect((segment as HTMLElement).style.flexGrow).toBe("1");
    }
    // Four-band cycle: the third segment is a third pattern, not a repeat.
    expect(new Set(attrValues(container, ".kpi-bar__segment", "data-kpi-pattern")).size).toBe(3);
  });

  it("draws one gapped, separately patterned radial slice per segment", () => {
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
    const firstShare = RADIAL_ARC_LENGTH / 3;
    const secondShare = (RADIAL_ARC_LENGTH * 2) / 3;
    const first = Number(
      (slices[0].getAttribute("stroke-dasharray") ?? "").split(" ")[0],
    );
    const second = Number(
      (slices[1].getAttribute("stroke-dasharray") ?? "").split(" ")[0],
    );
    // Each arc is its count's share minus the gap, so neighbours never touch.
    expect(first).toBeCloseTo(firstShare - RADIAL_SLICE_GAP, 5);
    expect(second).toBeCloseTo(secondShare - RADIAL_SLICE_GAP, 5);
    expect(first).toBeLessThan(firstShare);
    expect(second).toBeLessThan(secondShare);
    expect(slices[0].getAttribute("stroke-dashoffset")).toBe("0");
    expect(Number(slices[1].getAttribute("stroke-dashoffset"))).toBeCloseTo(
      -firstShare,
      5,
    );

    // Each band paints its own pattern tile, never a flat colour...
    const paints = Array.from(slices, (slice) => slice.getAttribute("stroke"));
    for (const paint of paints) {
      expect(paint).toMatch(/^url\(#kpi-band-/);
    }
    expect(new Set(paints).size).toBe(2);
    // ...and carries a --color-surface separator ring plus its own hatch.
    expect(container.querySelectorAll(".kpi-radial__separator")).toHaveLength(2);
    // Every slice publishes its band and its hatch shape to the DOM.
    expect(attrValues(container, ".kpi-radial__slice", "data-kpi-band")).toEqual([
      "1",
      "2",
    ]);
    expect(
      new Set(attrValues(container, ".kpi-radial__slice", "data-kpi-pattern"))
        .size,
    ).toBe(2);
    // All four tiles are defined, so any band count renders distinctly.
    expect(new Set(attrValues(container, "pattern", "data-kpi-pattern")).size).toBe(
      KPI_BANDS.length,
    );
    expect(slices[0]).toHaveClass("kpi-radial__slice--band-1");
    expect(slices[1]).toHaveClass("kpi-radial__slice--band-2");
  });

  it("keeps the radial gap proportional for a one-report band", () => {
    const { container } = render(
      <RadialMeter
        label="Waiting age"
        segments={[
          { label: "0–2 days waiting", count: 1 },
          { label: "14+ days waiting", count: 400 },
        ]}
      />,
    );

    const slices = container.querySelectorAll(".kpi-radial__slice");
    const tiny = Number(
      (slices[0].getAttribute("stroke-dasharray") ?? "").split(" ")[0],
    );
    const share = RADIAL_ARC_LENGTH / 401;
    // A band never loses more than a third of its arc, so it still reads.
    expect(tiny).toBeCloseTo(share - share / 3, 6);
    expect(tiny).toBeGreaterThan(0);
  });

  it("keeps pattern ids unique when two KPI graphics mount together", () => {
    const { container } = render(
      <>
        <RadialMeter
          label="Waiting age"
          segments={[
            { label: "0–2 days waiting", count: 1 },
            { label: "3–6 days waiting", count: 2 },
          ]}
        />
        <RadialMeter
          label="Waiting age"
          segments={[
            { label: "0–2 days waiting", count: 3 },
            { label: "3–6 days waiting", count: 1 },
          ]}
        />
      </>,
    );

    const ids = Array.from(
      container.querySelectorAll("pattern"),
      (pattern) => pattern.id,
    );
    expect(ids).toHaveLength(KPI_BANDS.length * 2);
    expect(new Set(ids).size).toBe(ids.length);
    // Every slice points at a pattern that actually exists in this graphic.
    const paints = attrValues(container, ".kpi-radial__slice", "stroke");
    for (const paint of paints) {
      const id = paint.replace(/^url\(#|\)$/g, "");
      expect(ids).toContain(id);
    }
  });

  it("renders no radial slice for an empty split", () => {
    const { container } = render(<RadialMeter label="Waiting age" segments={[]} />);

    expect(container.querySelectorAll(".kpi-radial__slice")).toHaveLength(0);
    expect(container.querySelectorAll(".kpi-radial__separator")).toHaveLength(0);
    expect(
      screen.getByRole("img", { name: "Waiting age: nothing recorded" }),
    ).toBeInTheDocument();
  });

  it("renders an empty track, not equal shares, for an empty split", () => {
    const { container } = render(
      <SegmentedBar label="Field-validation schedule" segments={[]} />,
    );

    expect(
      screen.getByRole("img", {
        name: "Field-validation schedule: nothing recorded",
      }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll(".kpi-bar__segment")).toHaveLength(0);
  });

  it("separates the sparkline line from its area with a surface halo", () => {
    const { container } = render(
      <Sparkline points={[1, 4, 2, 6]} label="Submissions 2026-09-01 to 2026-09-30" />,
    );

    expect(
      screen.getByRole("img", {
        name: "Submissions 2026-09-01 to 2026-09-30",
      }),
    ).toBeInTheDocument();
    // Area, halo, line and an end marker all use the same path geometry, so
    // the line is drawn over a separator rather than beside its area.
    const area = container.querySelector(".kpi-sparkline__area");
    const halo = container.querySelector(".kpi-sparkline__halo");
    const line = container.querySelector(".kpi-sparkline__line");
    expect(area).toBeInTheDocument();
    expect(halo).toBeInTheDocument();
    expect(line).toBeInTheDocument();
    expect(halo?.getAttribute("d")).toBe(line?.getAttribute("d"));
    expect(area?.getAttribute("d")).toContain(line?.getAttribute("d") ?? "");
    expect(container.querySelector(".kpi-sparkline__end")).toBeInTheDocument();
    // All four are decoration: the name carries the series.
    for (const node of [area, halo, line]) {
      expect(node).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("returns no sparkline for a series too short to plot", () => {
    const { container } = render(<Sparkline points={[3]} label="Submissions" />);
    expect(container.querySelector(".kpi-sparkline")).toBeNull();
  });

  it("states a single status indicator as one named graphic with a hatched lane", () => {
    const { container } = render(
      <StatusIndicator
        icon={<span data-testid="status-icon" />}
        name="3 unverified reports with no validation or referral underway"
      />,
    );

    const indicator = screen.getByRole("img", {
      name: "3 unverified reports with no validation or referral underway",
    });
    expect(indicator).toHaveClass("kpi-status");
    expect(indicator).toContainHTML("status-icon");
    // The lane is decoration, but it is textured rather than another
    // near-white fill beside the mark's near-white chip.
    const lane = indicator.querySelector(".kpi-status__lane");
    expect(lane).toHaveAttribute("aria-hidden", "true");
    expect(lane).toHaveAttribute("data-kpi-pattern", "status-lane/hatch");
    expect(container.querySelector(".kpi-status__mark")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("falls back to a plain sentence for an empty segment list", () => {
    expect(metricSegmentName("Waiting age", [])).toBe(
      "Waiting age: nothing recorded",
    );
  });
});
