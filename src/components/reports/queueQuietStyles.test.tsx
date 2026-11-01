import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { ReportTable } from "./ReportTable";
import type { DiseaseReport, ReportLifecycle } from "../../domain/report.types";
import indexCss from "../../index.css?raw";

/**
 * QF-5 silent queue - stylesheet behavior, not stylesheet text.
 *
 * `src/index.css` is the app's declarative design contract, so the shipped
 * rules are applied to a real document and read back through the CSS object
 * model. jsdom resolves declarations by document order rather than by
 * specificity, which is enough here because the silent-queue rules are written
 * after the tinted, pill-shaped rules they replace.
 */
const STYLE_ID = "quiet-queue-sheet";
const NARROW_STYLE_ID = "quiet-queue-narrow-sheet";

function applySheet(id: string, css: string) {
  const existing = document.getElementById(id);
  if (existing) existing.remove();
  const style = document.createElement("style");
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
}

/**
 * The stylesheet itself cannot be evaluated at a phone width by jsdom (it
 * ignores `@media`), so the narrow-viewport body of every `max-width: 899px`
 * block is lifted out and applied as plain rules - the same declarations a
 * 390px browser would win.
 */
function narrowWidthRules(css: string) {
  const rules: string[] = [];
  const marker = "@media (max-width: 899px)";
  let index = css.indexOf(marker);
  while (index !== -1) {
    const open = css.indexOf("{", index);
    if (open === -1) break;
    let depth = 0;
    let close = open;
    for (let cursor = open; cursor < css.length; cursor += 1) {
      if (css[cursor] === "{") depth += 1;
      else if (css[cursor] === "}") {
        depth -= 1;
        if (depth === 0) {
          close = cursor;
          break;
        }
      }
    }
    rules.push(css.slice(open + 1, close));
    index = css.indexOf(marker, close);
  }
  return rules.join("\n");
}

const untouched: ReportLifecycle = {
  caseState: "open",
  verificationOutcome: "not_determined",
  fieldValidationState: "unassigned",
  referralState: "not_referred",
};

function report(overrides: Partial<DiseaseReport> = {}): DiseaseReport {
  return {
    uuid: "00000000-0000-4000-8000-000000000001",
    referenceCode: "CG-2026-0001",
    barangay: "Balaytigui",
    province: "Batangas",
    municipality: "Nasugbu",
    farmReference: "Dela Cruz farm",
    submittedByName: "Ramon Dela Cruz",
    submitterRole: "field_reporter",
    capturedAt: "2026-07-18T07:42:00+08:00",
    submittedAt: "2026-07-18T09:16:00+08:00",
    predictedDisease: "rust",
    confidence: 0.95,
    imageStatus: "available",
    symptoms: [],
    reviewStatus: "submitted_unverified",
    lifecycle: untouched,
    ...overrides,
  };
}

function renderQueue(reports: DiseaseReport[]) {
  return render(
    <MemoryRouter>
      <ReportTable reports={reports} />
    </MemoryRouter>,
  );
}

/** The Settings device table shape: `.report-table` without the queue scope. */
function renderDeviceTable() {
  const host = document.createElement("div");
  host.innerHTML = `
    <div class="table-scroll">
      <table class="report-table device-table">
        <thead><tr><th scope="col">Device name</th><th scope="col">Device ID</th></tr></thead>
        <tbody><tr><td><strong>Field phone</strong></td><td><span class="machine-text">A1</span></td></tr></tbody>
      </table>
    </div>`;
  document.body.appendChild(host);
  return host;
}

describe("silent queue stylesheet", () => {
  it("draws the workflow status as plain ink instead of a hued pill", () => {
    applySheet(STYLE_ID, indexCss);
    renderQueue([report()]);

    const status = screen
      .getByRole("cell", { name: "Needs Review" })
      .querySelector(".workflow-status-badge") as HTMLElement;
    expect(status).not.toBeNull();

    const style = getComputedStyle(status);
    expect(style.padding).toBe("0px");
    expect(style.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(style.borderTopWidth).toBe("0px");
    expect(style.borderRadius).toBe("0px");
    expect(style.color).toBe("var(--color-text)");
  });

  it("flattens the condition badge and hides its coloured dot", () => {
    applySheet(STYLE_ID, indexCss);
    renderQueue([report()]);

    const badge = screen
      .getByRole("table")
      .querySelector(".disease-badge") as HTMLElement;
    expect(badge).not.toBeNull();

    const style = getComputedStyle(badge);
    expect(style.padding).toBe("0px");
    expect(style.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(style.borderTopWidth).toBe("0px");
    expect(style.borderRadius).toBe("0px");
    expect(style.color).toBe("var(--color-text)");
    expect(getComputedStyle(badge.firstElementChild as HTMLElement).display).toBe("none");
  });

  it("removes the warning and primary row descriptors", () => {
    applySheet(STYLE_ID, indexCss);
    renderQueue([
      report(),
      report({
        uuid: "00000000-0000-4000-8000-000000000002",
        referenceCode: "CG-2026-0002",
        reviewStatus: "for_field_validation",
        lifecycle: { ...untouched, fieldValidationState: "assigned" },
      }),
    ]);

    const rows = [
      document.querySelector("tr.report-row--submitted_unverified") as HTMLElement,
      document.querySelector("tr.report-row--for_field_validation") as HTMLElement,
    ];
    for (const row of rows) {
      expect(row).not.toBeNull();
      expect(getComputedStyle(row.firstElementChild as HTMLElement).boxShadow).toBe(
        "none",
      );
    }
  });

  it("removes the warning and primary row tints from the cascade", () => {
    applySheet(STYLE_ID, indexCss);

    // jsdom cannot evaluate `color-mix(...)`, so the row tint is read from the
    // declaration that wins the cascade rather than from a computed value.
    const winner = (selector: string) => {
      const matching: CSSStyleRule[] = [];
      for (const sheet of Array.from(document.styleSheets)) {
        for (const rule of Array.from(sheet.cssRules)) {
          if (rule instanceof CSSStyleRule) {
            const selectors = rule.selectorText.split(",").map((part) => part.trim());
            if (selectors.includes(selector)) matching.push(rule);
          }
        }
      }
      return matching.at(-1)?.style.background ?? "";
    };

    for (const status of ["submitted_unverified", "for_field_validation"]) {
      const selector = `.report-table tbody tr.report-row--${status}`;
      expect(winner(selector)).toBe("transparent");
    }
  });

  it("stacks queue tables at a phone width and leaves other report tables alone", () => {
    applySheet(STYLE_ID, indexCss);
    const narrowRules = narrowWidthRules(indexCss);
    applySheet(NARROW_STYLE_ID, narrowRules);

    let deviceHost: HTMLElement | null = null;
    try {
      renderQueue([report()]);
      deviceHost = renderDeviceTable();

      const queueCell = document.querySelector(
        ".report-table--queue tbody td",
      ) as HTMLElement;
      expect(getComputedStyle(queueCell).display).toBe("block");
      expect(
        getComputedStyle(
          document.querySelector(".report-table--queue thead") as HTMLElement,
        ).position,
      ).toBe("absolute");

      const deviceCell = document.querySelector(".device-table tbody td") as HTMLElement;
      expect(getComputedStyle(deviceCell).display).toBe("table-cell");
      expect(
        getComputedStyle(document.querySelector(".device-table thead") as HTMLElement)
          .position,
      ).toBe("static");
    } finally {
      deviceHost?.remove();
      document.getElementById(NARROW_STYLE_ID)?.remove();
    }
  });
});
