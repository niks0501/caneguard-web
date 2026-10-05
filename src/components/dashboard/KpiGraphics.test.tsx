import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RadialMeter, RADIAL_ARC_LENGTH, RADIAL_SLICE_GAP } from "./RadialMeter";
import { SegmentedBar } from "./SegmentedBar";
import { Sparkline } from "./Sparkline";
import { StatusIndicator } from "./StatusIndicator";
import {
  KPI_BANDS,
  kpiBandFillClass,
  kpiBandFillToken,
  kpiBandForIndex,
} from "./kpiBandEncoding";
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
  it("indexes every band onto one four-step solid ramp", () => {
    // The whole encoding is the shared `--kpi-band-<N>` ramp: four ordered
    // solids, one class and one token per band, cycled by segment index.
    expect(KPI_BANDS).toEqual([1, 2, 3, 4]);
    expect(KPI_BANDS.map(kpiBandFillToken)).toEqual([
      "--kpi-band-1",
      "--kpi-band-2",
      "--kpi-band-3",
      "--kpi-band-4",
    ]);
    expect(KPI_BANDS.map(kpiBandFillClass)).toEqual([
      "kpi-band-fill--1",
      "kpi-band-fill--2",
      "kpi-band-fill--3",
      "kpi-band-fill--4",
    ]);
    // The fifth segment wraps to band 1, so a long split keeps cycling the
    // ramp instead of inventing a fifth fill.
    expect(kpiBandForIndex(0)).toBe(1);
    expect(kpiBandForIndex(3)).toBe(4);
    expect(kpiBandForIndex(4)).toBe(1);
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
    // Adjacent segments paint two distinct band solids, and the whole track
    // is texture-free: a flat fill carries the split.
    expect(segments[0]).toHaveClass("kpi-band-fill--1");
    expect(segments[1]).toHaveClass("kpi-band-fill--2");
    expect(segments[0].getAttribute("data-kpi-band")).toBe("1");
    expect(segments[1].getAttribute("data-kpi-band")).toBe("2");
    expect(container.querySelector("pattern")).toBeNull();
    expect(container.querySelector("[data-kpi-pattern]")).toBeNull();
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
    // Four-band cycle: the third segment is a third band, not a repeat.
    expect(new Set(attrValues(container, ".kpi-bar__segment", "data-kpi-band")).size).toBe(3);
  });

  it("draws one gapped, separately banded radial slice per segment", () => {
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

    // No slice paints a pattern: each publishes its band and takes its flat
    // solid from that band's CSS class instead.
    expect(container.querySelector("pattern")).toBeNull();
    for (const slice of slices) {
      expect(slice.getAttribute("stroke")).toBeNull();
    }
    expect(attrValues(container, ".kpi-radial__slice", "data-kpi-band")).toEqual([
      "1",
      "2",
    ]);
    expect(slices[0]).toHaveClass("kpi-radial__slice--band-1", "kpi-radial__slice");
    expect(slices[1]).toHaveClass("kpi-radial__slice--band-2");
    // ...and carries a --color-surface separator ring so the two solids never
    // touch edge to edge.
    expect(container.querySelectorAll(".kpi-radial__separator")).toHaveLength(2);
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

  it("defines no pattern when two KPI graphics mount together", () => {
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

    // Two mounted rings used to need scope-unique pattern ids; with flat
    // solids there is nothing to scope and nothing to collide.
    expect(container.querySelectorAll("pattern")).toHaveLength(0);
    const slices = Array.from(container.querySelectorAll(".kpi-radial__slice"));
    expect(slices).toHaveLength(4);
    for (const slice of slices) {
      expect(slice.getAttribute("stroke")).toBeNull();
      expect(slice.getAttribute("class")).toMatch(
        /kpi-radial__slice--band-[1-4]/,
      );
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
    // the line is drawn over a separator rather than beside its area. The
    // sparkline has no band split, so all of it is flat solid fill.
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
    expect(container.querySelector("pattern")).toBeNull();
    expect(container.querySelector("[fill^='url(']")).toBeNull();
  });

  it("returns no sparkline for a series too short to plot", () => {
    const { container } = render(<Sparkline points={[3]} label="Submissions" />);
    expect(container.querySelector(".kpi-sparkline")).toBeNull();
  });

  it("states a single status indicator as one named graphic with a solid lane", () => {
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
    // The lane is decoration, and it is a flat solid: no hatch, no pattern
    // attribute, no paint reference.
    const lane = indicator.querySelector(".kpi-status__lane");
    expect(lane).toHaveAttribute("aria-hidden", "true");
    expect(lane).not.toHaveAttribute("data-kpi-pattern");
    expect(lane?.getAttribute("class")).toBe("kpi-status__lane");
    expect(container.querySelector(".kpi-status__mark")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(container.querySelector("pattern")).toBeNull();
  });

  it("falls back to a plain sentence for an empty segment list", () => {
    expect(metricSegmentName("Waiting age", [])).toBe(
      "Waiting age: nothing recorded",
    );
  });
});
